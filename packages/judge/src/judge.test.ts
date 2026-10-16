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
    reference: Array.from({ length: 3 }, (_, i) =>
      evidence({ runId: `reference-${i}`, exitCode: 0, charges: 1, failure: null }),
    ),
    alternate: Array.from({ length: 3 }, (_, i) =>
      evidence({ runId: `alternate-${i}`, exitCode: 0, charges: 1, failure: null }),
    ),
    decoy: evidence({ runId: 'decoy-0', failure: null }),
  };
}
describe('independent strict judge', () => {
  it('verifies only the complete trusted matrix', () => {
    const result = evaluateEvidence(incident, plan, matrix());
    expect(result.status).toBe('VERIFIED');
    expect(result.metadata).toMatchObject({
      evaluator: 'r1-strict-v2',
      referenceFixAttempts: 3,
      referenceFixSuccesses: 3,
      alternateFixAttempts: 3,
      alternateFixSuccesses: 3,
    });
  });
  it('rejects legacy single-execution fix evidence', () => {
    const m = matrix();
    const legacy = { ...m, reference: m.reference[0], alternate: m.alternate[0] };
    expect(() => evaluateEvidence(incident, plan, legacy as unknown as ExecutionMatrix)).toThrow(
      /arrays/,
    );
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
    m.reference[0]!.requests = 0;
    m.reference[0]!.charges = 0;
    expect(evaluateEvidence(incident, plan, m).checks.referenceFixPasses).toBe(false);
  });
  it('keeps build errors separate from domain failures', () => {
    const m = matrix();
    m.buggy[0] = evidence({ executionStatus: 'ERROR', error: 'daemon unavailable', failure: null });
    expect(evaluateEvidence(incident, plan, m).status).toBe('ERROR');
  });
  it('rejects substituted test artifacts', () => {
    const m = matrix();
    m.alternate[0]!.candidateHash = 'f'.repeat(64);
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
  it('rejects a decoy failure without duplicate ledger charges', () => {
    const m = matrix();
    m.decoy.charges = 1;
    const result = evaluateEvidence(incident, plan, m);
    expect(result.status).not.toBe('VERIFIED');
    expect(result.checks.decoyFixStillFails).toBe(false);
  });
  it('rejects execution IDs reused across variants', () => {
    const m = matrix();
    m.alternate[2]!.runId = m.buggy[0]!.runId;
    const result = evaluateEvidence(incident, plan, m);
    expect(result.status).not.toBe('VERIFIED');
    expect(result.checks.freshState).toBe(false);
    expect(result.reasonCodes).toContain('REUSED_EXECUTION_ID');
  });
});

describe.each(['reference', 'alternate'] as const)('%s fix repetition gates', (variant) => {
  const gate = variant === 'reference' ? 'referenceFixPasses' : 'alternateFixPasses';
  it('rejects an omitted repetition', () => {
    const m = matrix();
    m[variant].pop();
    const result = evaluateEvidence(incident, plan, m);
    expect(result.status).not.toBe('VERIFIED');
    expect(result.checks[gate]).toBe(false);
    expect(result.metadata[`${variant}FixAttempts`]).toBe(2);
  });
  it('requires exactly three repetitions', () => {
    const m = matrix();
    m[variant].push(evidence({ runId: `${variant}-3`, exitCode: 0, charges: 1, failure: null }));
    expect(evaluateEvidence(incident, plan, m).checks[gate]).toBe(false);
  });
  it('rejects a reused successful repetition', () => {
    const m = matrix();
    m[variant][2] = { ...m[variant][0]! };
    const result = evaluateEvidence(incident, plan, m);
    expect(result.status).not.toBe('VERIFIED');
    expect(result.checks.freshState).toBe(false);
    expect(result.reasonCodes).toContain('REUSED_EXECUTION_ID');
  });
  describe.each([0, 1, 2])('repetition %i', (index) => {
    it('rejects a failing valid fix', () => {
      const m = matrix();
      m[variant][index] = evidence({ runId: `${variant}-${index}` });
      const result = evaluateEvidence(incident, plan, m);
      expect(result.status).not.toBe('VERIFIED');
      expect(result.checks[gate]).toBe(false);
      expect(result.metadata[`${variant}FixSuccesses`]).toBe(2);
    });
    it('rejects a substituted candidate hash', () => {
      const m = matrix();
      m[variant][index]!.candidateHash = 'f'.repeat(64);
      const result = evaluateEvidence(incident, plan, m);
      expect(result.status).not.toBe('VERIFIED');
      expect(result.checks.sameCandidate).toBe(false);
    });
    it.each([
      ['offline', 'offlineExecution'],
      ['isolated', 'isolatedExecution'],
      ['cleanDatabase', 'freshState'],
    ] as const)('rejects a missing %s guarantee', (field, resultGate) => {
      const m = matrix();
      m[variant][index]![field] = false;
      const result = evaluateEvidence(incident, plan, m);
      expect(result.status).not.toBe('VERIFIED');
      expect(result.checks[resultGate]).toBe(false);
    });
    it('classifies infrastructure failure as ERROR', () => {
      const m = matrix();
      m[variant][index]!.executionStatus = 'ERROR';
      expect(evaluateEvidence(incident, plan, m).status).toBe('ERROR');
    });
    it('classifies killed candidate processes as ERROR', () => {
      const m = matrix();
      m[variant][index]!.exitCode = 137;
      expect(evaluateEvidence(incident, plan, m).status).toBe('ERROR');
    });
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
