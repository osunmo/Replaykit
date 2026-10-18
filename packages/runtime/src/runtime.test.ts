import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createRuntime, HEARTBEAT_TIMEOUT_MS } from './index.js';
import { acquireExecutionLease } from './lease.js';
import { atomicJson, createMarker, readManagedFile } from './storage.js';
import type { StoredJob } from './contracts.js';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function fixture(state: StoredJob['state'] = 'RUNNING') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'replaykit-runtime-test-'));
  directories.push(root);
  const runId = randomUUID();
  const output = path.join(root, 'runs', runId);
  await mkdir(output, { recursive: true });
  const now = new Date().toISOString();
  const job: StoredJob = {
    schemaVersion: 1,
    runId,
    state,
    createdAt: now,
    updatedAt: now,
    heartbeatAt: now,
    concurrency: 3,
    ownerToken: 'a'.repeat(64),
    progress: {
      phase: 'VERIFYING',
      completedExecutions: 1,
      totalExecutions: 17,
      preliminary: true,
    },
    verdict: null,
    reasonCode: null,
    cancelRequested: false,
  };
  await atomicJson(output, 'job.json', job);
  return { root, output, runId, job, runtime: createRuntime(root) };
}

it('rejects malformed IDs and extra execution capabilities before creating work', async () => {
  const { runtime, root } = await fixture();
  for (const id of ['../private', '/etc/passwd', 'R1', `${randomUUID()}/report.md`]) {
    await expect(runtime.status(id)).rejects.toMatchObject({ code: 'INVALID_RUN_ID' });
    await expect(runtime.openTest(id)).rejects.toMatchObject({ code: 'INVALID_RUN_ID' });
  }
  for (const request of [
    { fixture: 'D2' },
    { fixture: 'R1', concurrency: 4 },
    { fixture: 'R1', command: 'whoami' },
  ])
    await expect(runtime.start(request as { fixture: 'R1' })).rejects.toMatchObject({
      code: 'INVALID_START_REQUEST',
    });
  expect(
    await readFile(path.join(root, 'runs', (await runtime.list())[0]!.runId, 'job.json'), 'utf8'),
  ).not.toContain('whoami');
});

it('persisted stale work is permanently interrupted and never inherits an existing VERIFIED result', async () => {
  const { runtime, output, job, runId } = await fixture();
  await atomicJson(output, 'job.json', {
    ...job,
    heartbeatAt: new Date(Date.now() - HEARTBEAT_TIMEOUT_MS - 1000).toISOString(),
  });
  await atomicJson(output, 'result.json', { status: 'VERIFIED' });
  expect(await runtime.status(runId)).toMatchObject({
    state: 'INTERRUPTED',
    verdict: null,
    reasonCode: 'WORKER_INTERRUPTED',
  });
  await atomicJson(output, 'job.json', { ...job, state: 'COMPLETED', verdict: 'VERIFIED' });
  expect(await createRuntime(path.dirname(path.dirname(output))).status(runId)).toMatchObject({
    state: 'INTERRUPTED',
    verdict: null,
  });
  await expect(runtime.report(runId)).rejects.toMatchObject({ code: 'REPORT_NOT_READY' });
});

it('cancellation is persisted and excludes unsafe artifact reads', async () => {
  const { runtime, output, runId } = await fixture();
  expect(await runtime.cancel(runId)).toMatchObject({
    state: 'RUNNING',
    cancelRequested: true,
    verdict: null,
  });
  expect(await readManagedFile(output, 'cancel.request')).toBe('requested\n');
  await expect(runtime.openTest(runId)).rejects.toMatchObject({ code: 'TEST_NOT_READY' });
  await writeFile(path.join(output, 'repro.test.ts'), 'a'.repeat(32_769));
  await expect(runtime.openTest(runId)).rejects.toMatchObject({ code: 'ARTIFACT_TOO_LARGE' });
  await expect(readManagedFile(output, '../private')).rejects.toMatchObject({
    code: 'INVALID_ARTIFACT',
  });
});

it('rejects directory symlinks into arbitrary artifacts', async () => {
  const { runtime, root } = await fixture();
  const runId = randomUUID();
  const outside = path.join(root, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'repro.test.ts'), 'private canary');
  await symlink(outside, path.join(root, 'runs', runId), 'junction');
  await expect(runtime.openTest(runId)).rejects.toMatchObject({ code: 'UNSAFE_MANAGED_PATH' });
});

it('global lease permits one executing job per canonical repository and releases cleanly', async () => {
  const { root } = await fixture();
  const release = await acquireExecutionLease(root);
  try {
    await expect(acquireExecutionLease(root)).rejects.toMatchObject({ code: 'RUNTIME_BUSY' });
  } finally {
    await release();
  }
  await (
    await acquireExecutionLease(root)
  )();
});

it('late cancellation cannot expose a terminal VERIFIED result', async () => {
  const { runtime, output, job, runId } = await fixture();
  await createMarker(output, 'cancel.request');
  await atomicJson(output, 'job.json', { ...job, state: 'COMPLETED', verdict: 'VERIFIED' });
  expect(await runtime.status(runId)).toMatchObject({ state: 'CANCELLED', verdict: null });
  await expect(runtime.report(runId)).rejects.toMatchObject({ code: 'REPORT_NOT_READY' });
});

it('real detached worker persists missing-environment failure and inherits no Sentry token', async () => {
  const { root, runtime } = await fixture('COMPLETED');
  const old = process.env.SENTRY_AUTH_TOKEN;
  process.env.SENTRY_AUTH_TOKEN = 'sntrys_secret_canary_never_persist';
  try {
    const job = await runtime.start({ fixture: 'R1', concurrency: 3 });
    expect(job.state).toBe('QUEUED');
    expect(job.verdict).toBeNull();
    await expect
      .poll(async () => (await runtime.status(job.runId)).state, { timeout: 30_000 })
      .toBe('FAILED');
    const failure = await runtime.status(job.runId);
    expect(failure).toMatchObject({ verdict: null, reasonCode: 'SANDBOX_UNAVAILABLE' });
    const saved = await readFile(path.join(root, 'runs', job.runId, 'job.json'), 'utf8');
    expect(saved).not.toContain('sntrys_secret_canary');
  } finally {
    if (old === undefined) delete process.env.SENTRY_AUTH_TOKEN;
    else process.env.SENTRY_AUTH_TOKEN = old;
  }
}, 60_000);
