import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { incidentFixture } from '../../contracts/src/fixtures.js';
import { IncidentSchema, type ExecutionEvidence } from '../../contracts/src/index.js';
import { planIncident } from '../../planner/src/index.js';
import { evaluateEvidence, inspectTest, type ExecutionMatrix } from './evaluate.js';

const incident = IncidentSchema.parse(incidentFixture());
const plan = planIncident(incident);
function evidence(overrides: Partial<ExecutionEvidence> = {}): ExecutionEvidence {
  return {
    runId: 'run-1',
    variantHash: 'a'.repeat(64),
    candidateHash: createHash('sha256').update(plan.testSource!).digest('hex'),
    executionStatus: 'COMPLETED',
    exitCode: 1,
    failure: { type: 'DuplicatePaymentError', topApplicationFrame: 'payments/createPayment' },
    charges: 2,
    requests: 2,
    cleanDatabase: true,
    isolated: true,
    offline: true,
    schedule: [],
    durationMs: 1,
    stdout: '',
    stderr: '',
    ...overrides,
  };
}
function matrix(): ExecutionMatrix {
  return {
    buggy: Array.from({ length: 10 }, (_, i) => evidence({ runId: `buggy-${i}` })),
    reference: evidence({ exitCode: 0, charges: 1, failure: null }),
    alternate: evidence({ exitCode: 0, charges: 1, failure: null }),
    decoy: evidence({ failure: null }),
  };
}
describe('independent strict judge', () => {
  it('verifies only the complete trusted matrix', () => {
    expect(evaluateEvidence(incident, plan, matrix()).status).toBe('VERIFIED');
  });
  it('rejects the same exception on a different application path', () => {
    const wrong = {
      ...incident,
      exception: { ...incident.exception, topApplicationFrame: 'refunds/createRefund' },
    };
    expect(evaluateEvidence(wrong, planIncident(wrong), matrix()).status).toBe('PARTIAL');
    expect(evaluateEvidence(wrong, planIncident(wrong), matrix()).checks.sameFailureIdentity).toBe(
      false,
    );
  });
  it('does not accept an incomplete deterministic sample', () => {
    const m = matrix();
    m.buggy.pop();
    expect(evaluateEvidence(incident, plan, m).status).not.toBe('VERIFIED');
  });
  it('rejects a candidate that passes on the still-faulty decoy', () => {
    const m = matrix();
    m.decoy.exitCode = 0;
    expect(evaluateEvidence(incident, plan, m).checks.decoyFixStillFails).toBe(false);
  });
  it('rejects an empty test even if its process exited successfully on valid fixes', () => {
    const m = matrix();
    m.reference.requests = 0;
    m.reference.charges = 0;
    expect(evaluateEvidence(incident, plan, m).checks.referenceFixPasses).toBe(false);
  });
  it('keeps build errors separate from domain failures', () => {
    const m = matrix();
    m.buggy[0] = evidence({ executionStatus: 'ERROR', error: 'daemon unavailable', failure: null });
    expect(evaluateEvidence(incident, plan, m).status).toBe('ERROR');
  });
  it('rejects substituted test artifacts', () => {
    const m = matrix();
    m.alternate.candidateHash = 'f'.repeat(64);
    expect(evaluateEvidence(incident, plan, m).checks.sameCandidate).toBe(false);
  });
  it('does not trust a printed matching exception without a real domain observation', () => {
    const m = matrix();
    m.buggy = m.buggy.map((e) => ({
      ...e,
      failure: null,
      charges: 0,
      stdout: 'DuplicatePaymentError payments/createPayment',
    }));
    expect(evaluateEvidence(incident, plan, m).status).toBe('NOT_REPRODUCED');
  });
  it('rejects runs without proven offline isolation and clean state', () => {
    const m = matrix();
    m.buggy[0] = evidence({ offline: false, isolated: false, cleanDatabase: false });
    expect(evaluateEvidence(incident, plan, m).status).not.toBe('VERIFIED');
  });
  it('never verifies out-of-memory or killed candidate processes', () => {
    const m = matrix();
    m.buggy = m.buggy.map((e) => ({ ...e, exitCode: 137 }));
    m.decoy.exitCode = 137;
    expect(evaluateEvidence(incident, plan, m).status).not.toBe('VERIFIED');
  });
});
describe('candidate review policy', () => {
  it('permits the supported readable generated test', () =>
    expect(inspectTest(plan.testSource!).allowed).toBe(true));
  it.each([
    "throw new Error('DuplicatePaymentError');",
    "import fs from 'node:fs';",
    'await fetch("https://example.com");',
    'setTimeout(() => {}, 100);',
    'while (true) {}',
  ])('rejects prohibited code: %s', (source) => expect(inspectTest(source).allowed).toBe(false));
  it('enforces the 60-line reviewability bound', () =>
    expect(inspectTest('\n'.repeat(61)).allowed).toBe(false));
});
