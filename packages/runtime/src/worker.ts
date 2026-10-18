import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { IncidentSchema } from '../../contracts/src/index.js';
import { captureIncident, verifyPlan } from '../../cli/src/workflow.js';
import { loadManifest } from '../../judge/src/sandbox.js';
import {
  JobSchema,
  ProgressSchema,
  RunIdSchema,
  RuntimeError,
  StartRequestSchema,
  terminal,
  type StoredJob,
} from './contracts.js';
import {
  atomicJson,
  createMarker,
  hasMarker,
  managedDirectory,
  readManagedFile,
} from './storage.js';
import { acquireExecutionLease } from './lease.js';

/** The sole job writer. Heartbeats and progress share one ordered write queue. */
export async function runWorker(root: string, runId: string, ownerToken: string): Promise<void> {
  RunIdSchema.parse(runId);
  if (!/^[a-f0-9]{64}$/.test(ownerToken)) throw new RuntimeError('INVALID_WORKER_OWNER');
  const output = await managedDirectory(root, ['runs', runId]);
  let job = JobSchema.parse(JSON.parse(await readManagedFile(output, 'job.json', 32_768)));
  if (
    job.runId !== runId ||
    !timingSafeEqual(Buffer.from(ownerToken), Buffer.from(job.ownerToken)) ||
    job.state !== 'QUEUED'
  )
    throw new RuntimeError('INVALID_WORKER_OWNER');
  const abort = new AbortController();
  let releaseLease: (() => Promise<void>) | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let timedOut = false;
  let queue = Promise.resolve();
  const update = (mutate: (current: StoredJob) => StoredJob) => {
    const operation = queue.then(async () => {
      const interrupted = await hasMarker(output, 'interrupted.request');
      const cancelled = await hasMarker(output, 'cancel.request');
      if (interrupted || cancelled) abort.abort();
      job = mutate(job);
      if (interrupted)
        job = { ...job, state: 'INTERRUPTED', verdict: null, reasonCode: 'WORKER_INTERRUPTED' };
      else if (cancelled && terminal(job.state))
        job = { ...job, state: 'CANCELLED', verdict: null, reasonCode: 'CANCELLED' };
      job.cancelRequested = cancelled;
      job.heartbeatAt = new Date().toISOString();
      JobSchema.parse(job);
      await atomicJson(output, 'job.json', job);
    });
    queue = operation.catch(() => undefined);
    return operation;
  };
  const timeout = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, 20 * 60_000);
  timeout.unref();
  const interrupt = () => {
    abort.abort();
    void createMarker(output, 'interrupted.request').catch(() => undefined);
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const request = StartRequestSchema.parse(
      JSON.parse(await readManagedFile(output, 'request.json')),
    );
    await update((current) => current);
    abort.signal.throwIfAborted();
    releaseLease = await acquireExecutionLease(root);
    await update((current) => ({
      ...current,
      state: 'RUNNING',
      updatedAt: new Date().toISOString(),
    }));
    heartbeat = setInterval(() => {
      void update((current) => current).catch(() => abort.abort());
    }, 1000);
    heartbeat.unref();
    const manifest = await loadManifest(root);
    if (
      manifest.postgresRuntime &&
      (manifest.postgresRuntime.mode !== 'initdb' || manifest.postgresRuntime.fsync !== 'on')
    )
      throw new RuntimeError('UNSUPPORTED_POSTGRES_RUNTIME');
    let incident;
    if ('fixture' in request) {
      await update((current) => ({
        ...current,
        progress: { ...current.progress, phase: 'CAPTURING' },
        updatedAt: new Date().toISOString(),
      }));
      incident = await captureIncident(root, output);
    } else incident = IncidentSchema.parse(request.incident);
    abort.signal.throwIfAborted();
    const { result } = await verifyPlan(root, output, incident, undefined, {
      concurrency: request.concurrency,
      signal: abort.signal,
      onProgress: (progress) =>
        update((current) => ({
          ...current,
          progress: ProgressSchema.parse(progress),
          updatedAt: new Date().toISOString(),
        })),
    });
    abort.signal.throwIfAborted();
    await update((current) => ({
      ...current,
      state: 'COMPLETED',
      verdict: result.status,
      reasonCode: null,
      progress: { ...current.progress, phase: 'FINISHED' },
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    await update((current) => ({
      ...current,
      state: 'FAILED',
      verdict: null,
      reasonCode: timedOut
        ? 'WORKER_TIME_LIMIT'
        : error instanceof RuntimeError
          ? error.code
          : 'SANDBOX_UNAVAILABLE',
      updatedAt: new Date().toISOString(),
    }));
  } finally {
    clearTimeout(timeout);
    if (heartbeat) clearInterval(heartbeat);
    await queue;
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    await releaseLease?.();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, runId, owner] = process.argv.slice(2);
  if (!root || !runId || !owner) process.exitCode = 1;
  else
    runWorker(root, runId, owner).catch(() => {
      process.exitCode = 1;
    });
}
