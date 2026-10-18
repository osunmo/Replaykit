import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { JudgeResultSchema } from '../../contracts/src/index.js';
import { redact } from '../../telemetry/src/index.js';
import {
  JobSchema,
  RunIdSchema,
  RuntimeError,
  StartRequestSchema,
  terminal,
  type JobStatus,
  type ManagedArtifact,
  type StartRequest,
  type StoredJob,
} from './contracts.js';
import {
  atomicJson,
  createMarker,
  hasMarker,
  managedDirectory,
  readManagedFile,
} from './storage.js';

export { RuntimeError, JobSchema, RunIdSchema, StartRequestSchema } from './contracts.js';
export type { JobStatus, ManagedArtifact, StartRequest } from './contracts.js';
export { managedDirectory, readManagedFile } from './storage.js';
export const HEARTBEAT_TIMEOUT_MS = 60_000;
const publicStatus = (job: StoredJob): JobStatus => {
  const { ownerToken: _owner, heartbeatAt: _heartbeat, ...status } = job;
  return status;
};
const safeEnvironment = (): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_TLS_VERIFY|DOCKER_CERT_PATH|DOCKER_CONFIG)$/i.test(
        key,
      ),
    ),
  );

export function createRuntime(root: string) {
  const directory = async (runId: string) => {
    if (!RunIdSchema.safeParse(runId).success) throw new RuntimeError('INVALID_RUN_ID');
    try {
      return await managedDirectory(root, ['runs', runId]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new RuntimeError('RUN_NOT_FOUND');
      throw error;
    }
  };
  const readJob = async (runId: string) => {
    const output = await directory(runId);
    const job = JobSchema.parse(JSON.parse(await readManagedFile(output, 'job.json', 32_768)));
    if (job.runId !== runId) throw new RuntimeError('INVALID_JOB');
    return { output, job };
  };
  const status = async (runId: string): Promise<JobStatus> => {
    const { output, job } = await readJob(runId);
    const cancelled = await hasMarker(output, 'cancel.request');
    let interrupted = await hasMarker(output, 'interrupted.request');
    if (!terminal(job.state) && Date.now() - Date.parse(job.heartbeatAt) > HEARTBEAT_TIMEOUT_MS) {
      await createMarker(output, 'interrupted.request');
      interrupted = true;
    }
    if (interrupted)
      return publicStatus({
        ...job,
        state: 'INTERRUPTED',
        verdict: null,
        reasonCode: 'WORKER_INTERRUPTED',
        cancelRequested: cancelled,
      });
    if (cancelled && terminal(job.state))
      return publicStatus({
        ...job,
        state: 'CANCELLED',
        verdict: null,
        reasonCode: 'CANCELLED',
        cancelRequested: true,
      });
    return publicStatus({ ...job, cancelRequested: cancelled || job.cancelRequested });
  };
  return {
    async start(input: StartRequest): Promise<JobStatus> {
      const parsed = StartRequestSchema.safeParse(input);
      if (!parsed.success) throw new RuntimeError('INVALID_START_REQUEST');
      const request = StartRequestSchema.parse(redact(parsed.data));
      if (Buffer.byteLength(JSON.stringify(request)) > 1_048_576)
        throw new RuntimeError('INPUT_TOO_LARGE');
      const runs = await managedDirectory(root, ['runs'], true);
      const runId = randomUUID();
      const output = path.join(runs, runId);
      await mkdir(output);
      const now = new Date().toISOString();
      const job: StoredJob = {
        schemaVersion: 1,
        runId,
        state: 'QUEUED',
        createdAt: now,
        updatedAt: now,
        heartbeatAt: now,
        concurrency: request.concurrency,
        ownerToken: randomBytes(32).toString('hex'),
        progress: {
          phase: 'QUEUED',
          completedExecutions: 0,
          totalExecutions: 17,
          preliminary: false,
        },
        verdict: null,
        reasonCode: null,
        cancelRequested: false,
      };
      await atomicJson(output, 'request.json', request);
      await atomicJson(output, 'job.json', job);
      const source = fileURLToPath(new URL('./worker.js', import.meta.url));
      const sourceMode = import.meta.url.endsWith('.ts');
      const worker = sourceMode ? source.replace(/\.js$/, '.ts') : source;
      const args = sourceMode
        ? [
            '--import',
            pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href,
            worker,
          ]
        : [worker];
      try {
        const child = spawn(
          process.execPath,
          [...args, await managedDirectory(root, []), runId, job.ownerToken],
          {
            detached: true,
            windowsHide: true,
            stdio: 'ignore',
            env: safeEnvironment(),
            shell: false,
          },
        );
        await new Promise<void>((resolve, reject) => {
          child.once('spawn', resolve);
          child.once('error', reject);
        });
        child.unref();
      } catch {
        job.state = 'FAILED';
        job.reasonCode = 'WORKER_START_FAILED';
        job.updatedAt = new Date().toISOString();
        await atomicJson(output, 'job.json', job);
      }
      return publicStatus(job);
    },
    status,
    async list(limit = 20): Promise<JobStatus[]> {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new RuntimeError('INVALID_LIMIT');
      const runs = await managedDirectory(root, ['runs'], true);
      const jobs: JobStatus[] = [];
      for (const entry of await readdir(runs, { withFileTypes: true })) {
        if (
          !entry.isDirectory() ||
          entry.isSymbolicLink() ||
          !RunIdSchema.safeParse(entry.name).success
        )
          continue;
        try {
          jobs.push(await status(entry.name));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof z.ZodError))
            throw error;
        }
      }
      return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    },
    async cancel(runId: string): Promise<JobStatus> {
      const current = await status(runId);
      if (terminal(current.state)) return current;
      await createMarker(await directory(runId), 'cancel.request');
      return status(runId);
    },
    async report(
      runId: string,
    ): Promise<ManagedArtifact & { result: ReturnType<typeof JudgeResultSchema.parse> }> {
      const current = await status(runId);
      if (current.state !== 'COMPLETED') throw new RuntimeError('REPORT_NOT_READY');
      const output = await directory(runId);
      const parsed = JudgeResultSchema.parse(
        JSON.parse(await readManagedFile(output, 'result.json')),
      );
      if (parsed.runId !== runId || parsed.status !== current.verdict)
        throw new RuntimeError('RESULT_MISMATCH');
      const metadata: Record<string, unknown> = {};
      for (const field of [
        'referenceFixSuccesses',
        'referenceFixAttempts',
        'alternateFixSuccesses',
        'alternateFixAttempts',
        'verificationWallMs',
        'matrixWallMs',
        'concurrency',
        'maxActiveExecutions',
      ]) {
        if (typeof parsed.metadata[field] === 'number') metadata[field] = parsed.metadata[field];
      }
      return {
        runId,
        artifact: `runs/${runId}/report.md`,
        content: await readManagedFile(output, 'report.md'),
        result: { ...parsed, metadata },
      };
    },
    async openTest(runId: string): Promise<ManagedArtifact> {
      const output = await directory(runId);
      await readJob(runId);
      try {
        return {
          runId,
          artifact: `runs/${runId}/repro.test.ts`,
          content: await readManagedFile(output, 'repro.test.ts', 32_768),
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          throw new RuntimeError('TEST_NOT_READY');
        throw error;
      }
    },
  };
}
export type ReplayRuntime = ReturnType<typeof createRuntime>;
