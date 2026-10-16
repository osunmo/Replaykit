import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { incidentFixture } from '../../contracts/src/fixtures.js';
import { planIncident } from '../../planner/src/index.js';
import { runSandbox } from '../../judge/src/sandbox.js';
import { verifyPlan } from './workflow.js';

vi.mock('../../judge/src/sandbox.js', () => ({
  loadManifest: async () => ({ appImages: { buggy: `sha256:${'a'.repeat(64)}` } }),
  planInSandbox: vi.fn(),
  runSandbox: vi.fn(async (_root, _output, variant, source) => ({
    runId: randomUUID(),
    variantHash: 'b'.repeat(64),
    candidateHash: createHash('sha256').update(source).digest('hex'),
    executionStatus: 'COMPLETED',
    exitCode: ['reference', 'alternate'].includes(variant) ? 0 : 1,
    failure:
      variant === 'buggy'
        ? { type: 'DuplicatePaymentError', topApplicationFrame: 'payments/createPayment' }
        : null,
    charges: ['reference', 'alternate'].includes(variant) ? 1 : 2,
    requests: 2,
    cleanDatabase: true,
    isolated: true,
    offline: true,
    schedule: [],
    durationMs: 1,
    stdout: '',
    stderr: '',
  })),
}));

it('sends identical test bytes through all 17 independent executions and judges all fix repetitions', async () => {
  vi.mocked(runSandbox).mockClear();
  const root = process.cwd();
  const output = await mkdtemp(path.join(tmpdir(), 'replaykit-scheduling-'));
  const incident = { ...incidentFixture(), revision: `sha256:${'a'.repeat(64)}` };
  const plan = planIncident(incident);
  const { result, matrix } = await verifyPlan(root, output, incident, plan);
  const calls = vi.mocked(runSandbox).mock.calls;
  expect(calls).toHaveLength(17);
  expect(calls.filter((call) => call[2] === 'reference')).toHaveLength(3);
  expect(calls.filter((call) => call[2] === 'alternate')).toHaveLength(3);
  expect(new Set(calls.map((call) => call[3]))).toEqual(new Set([plan.testSource]));
  expect(result.status).toBe('VERIFIED');
  expect(result.metadata.concurrency).toBe(3);
  expect(result.metadata.maxActiveExecutions).toBe(3);
  expect(result.metadata.executionRunIds).toHaveLength(17);
  expect(matrix?.buggy).toHaveLength(10);
  expect(await readFile(path.join(output, 'repro.test.ts'), 'utf8')).toBe(plan.testSource);
});
