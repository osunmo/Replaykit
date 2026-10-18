// Unit fixtures only: none of these records is container-verification evidence.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { evaluateExternalEvidence } from './external.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const source = "import assert from 'node:assert/strict';\nassert.equal(1 + 1, 2);\n";
const config = {
  contract: 'external-official-suite-v1',
  instanceId: 'unit-fixture',
  baseCommit: 'b'.repeat(40),
  image: 'registry.invalid/fixture@sha256:' + hash('image'),
  testPatchHash: hash('official test patch'),
  candidateHash: hash(source),
  testFileHash: hash(source),
  sourceFiles: ['src/application.js', 'test/repro.js'],
  failToPass: ['regression'],
  passToPass: ['control'],
  expectedFailure: { type: 'AssertionError', topApplicationFrame: 'src/application.js:10' },
  patchHashes: {
    buggy: hash(''),
    reference: hash('gold diff'),
    alternate: hash('independent diff'),
    decoy: hash('decoy diff'),
  },
};
const failed = { name: 'regression', status: 'failed', failure: config.expectedFailure };
const passed = { name: 'regression', status: 'passed', failure: null };
const control = { name: 'control', status: 'passed', failure: null };
function evidence(runId: string, patchHash: string, tests: object[], exitCode: number) {
  const reportJson = JSON.stringify({ reporter: 'official-suite-normalized-v1', tests });
  return {
    contract: 'external-official-suite-v1',
    instanceId: config.instanceId,
    baseCommit: config.baseCommit,
    runId,
    image: config.image,
    patchHash,
    testPatchHash: config.testPatchHash,
    candidateHash: config.candidateHash,
    sourceHashes: {
      'src/application.js': hash('observed source bytes'),
      'test/repro.js': hash(source),
    },
    executionStatus: 'COMPLETED',
    exitCode,
    reportJson,
    reportHash: hash(reportJson),
    freshWorkspace: true,
    durationMs: 10,
    isolation: {
      networkMode: 'none',
      user: '1000:1000',
      readonlyRoot: true,
      capDropAll: true,
      noNewPrivileges: true,
      cpus: 1,
      memoryBytes: 268435456,
      pidsLimit: 64,
      mounts: [],
    },
  };
}
function matrix() {
  return {
    buggy: Array.from({ length: 10 }, (_, i) =>
      evidence('b' + i, config.patchHashes.buggy, [failed, control], 1),
    ),
    reference: Array.from({ length: 3 }, (_, i) =>
      evidence('r' + i, config.patchHashes.reference, [passed, control], 0),
    ),
    alternate: Array.from({ length: 3 }, (_, i) =>
      evidence('a' + i, config.patchHashes.alternate, [passed, control], 0),
    ),
    decoy: evidence('d', config.patchHashes.decoy, [failed, control], 1),
  };
}
function setReport(e: ReturnType<typeof evidence>, tests: object[]) {
  e.reportJson = JSON.stringify({ reporter: 'official-suite-normalized-v1', tests });
  e.reportHash = hash(e.reportJson);
}
function bindSource(m: ReturnType<typeof matrix>, candidate: string) {
  for (const e of [...m.buggy, ...m.reference, ...m.alternate, m.decoy])
    e.candidateHash = hash(candidate);
  return { ...config, candidateHash: hash(candidate) };
}
describe('separate external official-suite evaluator', () => {
  it('requires an explicit base revision on every execution', () => {
    const m = matrix();
    Reflect.deleteProperty(m.buggy[0]!, 'baseCommit');
    expect(evaluateExternalEvidence(config, source, m).status).toBe('ERROR');
  });
  it('requires a pinned full official test-file hash', () => {
    const manifest = { ...config };
    Reflect.deleteProperty(manifest, 'testFileHash');
    expect(evaluateExternalEvidence(manifest, source, matrix()).status).toBe('ERROR');
  });
  it.each(['base-revision', 'official-test-file'])(
    'rejects substituted %s bytes despite a matching candidate fragment',
    (mode) => {
      const m = matrix();
      if (mode === 'base-revision') Object.assign(m.buggy[0]!, { baseCommit: 'a'.repeat(40) });
      else Object.assign(m.buggy[0]!.sourceHashes, { 'test/repro.js': hash('tampered controls') });
      const result = evaluateExternalEvidence(config, source, m);
      expect(result.checks.buggyFails).toBe(false);
      expect(result.status).not.toBe('VERIFIED');
    },
  );
  it('requires an explicit inspected mount list', () => {
    const m = matrix();
    Reflect.deleteProperty(m.buggy[0]!.isolation, 'mounts');
    expect(evaluateExternalEvidence(config, source, m).status).toBe('ERROR');
  });
  it('accepts a recorded private tmpfs and rejects host bind mounts', () => {
    const m = matrix();
    Object.assign(m.buggy[0]!.isolation, { mounts: [{ type: 'tmpfs', destination: '/tmp' }] });
    expect(evaluateExternalEvidence(config, source, m).status).toBe('VERIFIED');
    Object.assign(m.buggy[0]!.isolation, {
      mounts: [{ type: 'bind', destination: '/workspace', source: '/host' }],
    });
    expect(evaluateExternalEvidence(config, source, m).status).toBe('ERROR');
  });
  it('rejects a reference patch reused as the alternate patch', () => {
    expect(
      evaluateExternalEvidence(
        {
          ...config,
          patchHashes: { ...config.patchHashes, alternate: config.patchHashes.reference },
        },
        source,
        matrix(),
      ).status,
    ).toBe('ERROR');
  });
  it('accepts only a complete correctly bound unit matrix', () => {
    const r = evaluateExternalEvidence(config, source, matrix());
    expect(r.status).toBe('VERIFIED');
    expect(r.checks.deterministicFailures).toBe(10);
    expect(r.checks.referenceFixPasses).toBe(true);
    expect(r.checks.alternateFixPasses).toBe(true);
  });
  it.each(['buggy', 'reference', 'alternate'] as const)('requires all %s repetitions', (key) => {
    const m = matrix();
    m[key].pop();
    expect(evaluateExternalEvidence(config, source, m).status).not.toBe('VERIFIED');
  });
  it('requires ten distinct fresh executions and no reused fix execution', () => {
    const m = matrix();
    m.reference[0]!.runId = m.buggy[0]!.runId;
    expect(evaluateExternalEvidence(config, source, m).checks.freshState).toBe(false);
  });
  it('requires the actual buggy failure identity', () => {
    const m = matrix();
    setReport(m.buggy[0]!, [
      { ...failed, failure: { ...config.expectedFailure, topApplicationFrame: 'wrong/path.js:1' } },
      control,
    ]);
    expect(evaluateExternalEvidence(config, source, m).checks.sameFailureIdentity).toBe(false);
  });
  it('does not verify an assert-true test whose buggy executions pass', () => {
    const m = matrix();
    for (const e of m.buggy) {
      setReport(e, [passed, control]);
      e.exitCode = 0;
    }
    expect(evaluateExternalEvidence(config, source, m).status).toBe('NOT_REPRODUCED');
  });
  it.each(['reference', 'alternate'] as const)(
    'requires every %s fix to pass the official invariant',
    (key) => {
      const m = matrix();
      setReport(m[key][1]!, [failed, control]);
      m[key][1]!.exitCode = 1;
      expect(evaluateExternalEvidence(config, source, m).status).not.toBe('VERIFIED');
    },
  );
  it('rejects a passing decoy', () => {
    const m = matrix();
    setReport(m.decoy, [passed, control]);
    m.decoy.exitCode = 0;
    expect(evaluateExternalEvidence(config, source, m).checks.decoyFixStillFails).toBe(false);
  });
  it.each(['missing', 'skipped', 'duplicate', 'extra-failure', 'pass-to-pass-failure'])(
    'rejects %s official inventory evidence',
    (mode) => {
      const m = matrix();
      const tests =
        mode === 'missing'
          ? [passed]
          : mode === 'skipped'
            ? [{ ...passed, status: 'skipped' }, control]
            : mode === 'duplicate'
              ? [passed, passed, control]
              : mode === 'extra-failure'
                ? [passed, control, { ...failed, name: 'unrelated' }]
                : [passed, { ...control, status: 'failed', failure: config.expectedFailure }];
      setReport(m.reference[0]!, tests);
      expect(evaluateExternalEvidence(config, source, m).status).not.toBe('VERIFIED');
    },
  );
  it.each([
    'network',
    'root-user',
    'writable-root',
    'capabilities',
    'privileges',
    'cpu',
    'memory',
    'pids',
    'fresh-state',
    'candidate',
    'image',
    'patch',
    'test-patch',
    'source-files',
  ])('rejects an invalid %s guarantee', (mode) => {
    const m = matrix();
    const e = m.buggy[0]!;
    if (mode === 'network') e.isolation.networkMode = 'bridge';
    if (mode === 'root-user') e.isolation.user = '0:0';
    if (mode === 'writable-root') e.isolation.readonlyRoot = false;
    if (mode === 'capabilities') e.isolation.capDropAll = false;
    if (mode === 'privileges') e.isolation.noNewPrivileges = false;
    if (mode === 'cpu') e.isolation.cpus = 2;
    if (mode === 'memory') e.isolation.memoryBytes *= 2;
    if (mode === 'pids') e.isolation.pidsLimit = 128;
    if (mode === 'fresh-state') e.freshWorkspace = false;
    if (mode === 'candidate') e.candidateHash = hash('substituted test');
    if (mode === 'image') e.image = 'registry.invalid/fixture@sha256:' + hash('other image');
    if (mode === 'patch') e.patchHash = hash('other patch');
    if (mode === 'test-patch') e.testPatchHash = hash('other official patch');
    if (mode === 'source-files') e.sourceHashes = {} as typeof e.sourceHashes;
    expect(evaluateExternalEvidence(config, source, m).status).not.toBe('VERIFIED');
  });
  it('fails closed on malformed or altered reporter bytes', () => {
    const m = matrix();
    m.buggy[0]!.reportJson = '{}';
    expect(evaluateExternalEvidence(config, source, m).status).toBe('ERROR');
  });
  it('fails closed on correctly hashed malformed reporter JSON', () => {
    const m = matrix();
    m.buggy[0]!.reportJson = '{';
    m.buggy[0]!.reportHash = hash(m.buggy[0]!.reportJson);
    expect(evaluateExternalEvidence(config, source, m).status).toBe('ERROR');
  });
  it('fails closed on a fabricated invariant boolean', () => {
    const m = matrix();
    Object.assign(m.buggy[0]!, { invariantPassed: false });
    expect(evaluateExternalEvidence(config, source, m).status).toBe('ERROR');
  });
  it('cannot select this contract using R1 evidence or telemetry metadata', () => {
    const m = matrix();
    Object.assign(m.buggy[0]!, {
      charges: null,
      requests: 0,
      metadata: { contract: config.contract },
    });
    expect(evaluateExternalEvidence(config, source, m).status).toBe('ERROR');
    expect(
      evaluateExternalEvidence({ metadata: { contract: config.contract } }, source, m).status,
    ).toBe('ERROR');
  });
  it('rejects source changes and unconditional throws independently of reporter claims', () => {
    const altered = "throw new Error('always');";
    const m = matrix();
    const r = evaluateExternalEvidence(bindSource(m, altered), altered, m);
    expect(r.status).not.toBe('VERIFIED');
    expect(r.checks.noSleepBasedTiming).toBe(false);
    expect(evaluateExternalEvidence(config, source + '// changed', matrix()).status).not.toBe(
      'VERIFIED',
    );
  });
  it.each(['timers', 'timers/promises', 'node:timers/promises'])(
    'rejects fully hash-bound sleep imports from %s',
    (module) => {
      const altered = `import timers from '${module}';\nawait timers.scheduler.wait(1000);`;
      const m = matrix();
      const r = evaluateExternalEvidence(bindSource(m, altered), altered, m);
      expect(r.checks.sameCandidate).toBe(true);
      expect(r.checks.noSleepBasedTiming).toBe(false);
      expect(r.status).not.toBe('VERIFIED');
    },
  );
  it('classifies missing images, abnormal exits and absent reports as ERROR', () => {
    const m = matrix();
    Object.assign(m.buggy[0]!, {
      executionStatus: 'ERROR',
      exitCode: null,
      reportJson: null,
      reportHash: null,
    });
    expect(evaluateExternalEvidence(config, source, m).status).toBe('ERROR');
  });
  it('requires a documented review exception for an official test exceeding 60 lines', () => {
    const long = source + '\n'.repeat(61);
    const m = matrix();
    expect(
      evaluateExternalEvidence({ ...config, candidateHash: hash(long) }, long, m).checks
        .reviewableTest,
    ).toBe(false);
  });
});
