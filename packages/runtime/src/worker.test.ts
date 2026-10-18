import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VerificationOptions } from '../../cli/src/workflow.js';
import { createRuntime } from './index.js';
import { atomicJson, createMarker } from './storage.js';
import type { StoredJob } from './contracts.js';
import { runWorker } from './worker.js';

const mocked = vi.hoisted(() => ({ manifest: vi.fn(), capture: vi.fn(), verify: vi.fn() }));
vi.mock('../../cli/src/workflow.js', () => ({
  captureIncident: mocked.capture,
  verifyPlan: mocked.verify,
}));
vi.mock('../../judge/src/sandbox.js', () => ({ loadManifest: mocked.manifest }));
const directories: string[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  mocked.manifest.mockResolvedValue({ postgresRuntime: { mode: 'initdb', fsync: 'on' } });
  mocked.capture.mockResolvedValue({ id: 'R1' });
});
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'replaykit-worker-test-'));
  directories.push(root);
  const runId = randomUUID();
  const output = path.join(root, 'runs', runId);
  await mkdir(output, { recursive: true });
  const now = new Date().toISOString();
  const owner = 'a'.repeat(64);
  const job: StoredJob = {
    schemaVersion: 1,
    runId,
    state: 'QUEUED',
    createdAt: now,
    updatedAt: now,
    heartbeatAt: now,
    concurrency: 3,
    ownerToken: owner,
    progress: { phase: 'QUEUED', completedExecutions: 0, totalExecutions: 17, preliminary: false },
    verdict: null,
    reasonCode: null,
    cancelRequested: false,
  };
  await atomicJson(output, 'job.json', job);
  await atomicJson(output, 'request.json', { fixture: 'R1', concurrency: 3 });
  return { root, output, runId, owner, runtime: createRuntime(root) };
}

it('does not run a pre-cancelled job or expose a verdict', async () => {
  const { root, runId, owner, runtime } = await fixture();
  await runtime.cancel(runId);
  await runWorker(root, runId, owner);
  expect(mocked.capture).not.toHaveBeenCalled();
  expect(mocked.verify).not.toHaveBeenCalled();
  expect(await runtime.status(runId)).toMatchObject({ state: 'CANCELLED', verdict: null });
});

it('retains preliminary progress without promoting it to a judge verdict', async () => {
  const { root, runId, owner, runtime } = await fixture();
  let release!: () => void;
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  mocked.verify.mockImplementation(
    async (_root, _output, _incident, _plan, options: VerificationOptions) => {
      await options.onProgress?.({
        phase: 'VERIFYING',
        completedExecutions: 1,
        totalExecutions: 17,
        preliminary: true,
      });
      signalStarted();
      await hold;
      return { result: { status: 'NOT_REPRODUCED' } };
    },
  );
  const worker = runWorker(root, runId, owner);
  await started;
  expect(await runtime.status(runId)).toMatchObject({
    state: 'RUNNING',
    verdict: null,
    progress: { completedExecutions: 1, preliminary: true },
  });
  release();
  await worker;
  expect(await runtime.status(runId)).toMatchObject({
    state: 'COMPLETED',
    verdict: 'NOT_REPRODUCED',
  });
}, 60_000);

it('waits for active work to drain after cancellation and suppresses a late verdict', async () => {
  const { root, runId, owner, runtime } = await fixture();
  let release!: () => void;
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let drained = false;
  mocked.verify.mockImplementation(async () => {
    signalStarted();
    await hold;
    drained = true;
    return { result: { status: 'VERIFIED' } };
  });
  const worker = runWorker(root, runId, owner);
  await started;
  await runtime.cancel(runId);
  expect(drained).toBe(false);
  expect((await runtime.status(runId)).verdict).toBeNull();
  release();
  await worker;
  expect(drained).toBe(true);
  expect(await runtime.status(runId)).toMatchObject({ state: 'CANCELLED', verdict: null });
}, 60_000);

it('rejected worker owner cannot execute or modify the job', async () => {
  const { root, runId, runtime } = await fixture();
  await expect(runWorker(root, runId, 'b'.repeat(64))).rejects.toMatchObject({
    code: 'INVALID_WORKER_OWNER',
  });
  expect(mocked.capture).not.toHaveBeenCalled();
  expect(await runtime.status(runId)).toMatchObject({ state: 'QUEUED', verdict: null });
});

it('interrupted jobs cannot be completed by late worker writes', async () => {
  const { root, output, runId, owner, runtime } = await fixture();
  mocked.verify.mockImplementation(async () => {
    await createMarker(output, 'interrupted.request');
    return { result: { status: 'VERIFIED' } };
  });
  await runWorker(root, runId, owner);
  expect(await runtime.status(runId)).toMatchObject({ state: 'INTERRUPTED', verdict: null });
});

it('rejects template or fsync-off configurations before capture', async () => {
  const { root, runId, owner, runtime } = await fixture();
  mocked.manifest.mockResolvedValue({ postgresRuntime: { mode: 'template-copy', fsync: 'on' } });
  await runWorker(root, runId, owner);
  expect(mocked.capture).not.toHaveBeenCalled();
  expect(await runtime.status(runId)).toMatchObject({
    state: 'FAILED',
    reasonCode: 'UNSUPPORTED_POSTGRES_RUNTIME',
    verdict: null,
  });
});
