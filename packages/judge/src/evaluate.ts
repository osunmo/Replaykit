import { createHash, randomUUID } from 'node:crypto';
import ts from 'typescript';
import {
  ExecutionEvidenceSchema,
  IncidentSchema,
  JudgeResultSchema,
  ReplayPlanSchema,
  type ExecutionEvidence,
  type JudgeResult,
} from '../../contracts/src/index.js';

export interface ExecutionMatrix {
  buggy: ExecutionEvidence[];
  reference: ExecutionEvidence[];
  alternate: ExecutionEvidence[];
  decoy: ExecutionEvidence;
}
export function inspectTest(source: string): { allowed: boolean; reasons: string[] } {
  const reasons = new Set<string>();
  if (source.split(/\r?\n/).length > 60 || source.length > 32768 || !source.trim())
    reasons.add('TEST_NOT_REVIEWABLE');
  const allowedImports = new Set(['node:test', 'node:assert/strict', '/sdk/replay-fixture.mjs']);
  const banned = new Set([
    'process',
    'globalThis',
    'global',
    'fetch',
    'require',
    'eval',
    'Function',
    'setTimeout',
    'setInterval',
    'setImmediate',
    'SharedArrayBuffer',
    'Atomics',
    'WebAssembly',
  ]);
  const file = ts.createSourceFile(
    'repro.test.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      (!ts.isStringLiteral(node.moduleSpecifier) || !allowedImports.has(node.moduleSpecifier.text))
    )
      reasons.add('PROHIBITED_IMPORT');
    if (ts.isThrowStatement(node)) reasons.add('PROHIBITED_THROW');
    if (
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isForStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isForInStatement(node)
    )
      reasons.add('PROHIBITED_LOOP');
    if (ts.isIdentifier(node) && banned.has(node.text)) reasons.add('PROHIBITED_GLOBAL');
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      reasons.add('PROHIBITED_IMPORT');
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { allowed: reasons.size === 0, reasons: [...reasons] };
}

export function evaluateEvidence(
  rawIncident: unknown,
  rawPlan: unknown,
  matrix: ExecutionMatrix,
): JudgeResult {
  const incident = IncidentSchema.parse(rawIncident);
  const plan = ReplayPlanSchema.parse(rawPlan);
  if (!Array.isArray(matrix.reference) || !Array.isArray(matrix.alternate))
    throw new TypeError('Reference and alternate evidence must be arrays of executions');
  const all = [...matrix.buggy, ...matrix.reference, ...matrix.alternate, matrix.decoy].map((e) =>
    ExecutionEvidenceSchema.parse(e),
  );
  const uniqueExecutionIds = new Set(all.map((e) => e.runId)).size === all.length;
  const source = plan.testSource ?? '';
  const policy = inspectTest(source);
  const hash = createHash('sha256').update(source).digest('hex');
  const completed = (e: ExecutionEvidence) => e.executionStatus === 'COMPLETED';
  const realBug = (e: ExecutionEvidence) =>
    completed(e) &&
    e.exitCode === 1 &&
    e.failure !== null &&
    (e.charges ?? 0) > 1 &&
    e.requests >= 2;
  const identity = (e: ExecutionEvidence) =>
    e.failure?.type === incident.exception.type &&
    e.failure?.topApplicationFrame === incident.exception.topApplicationFrame;
  const validFix = (e: ExecutionEvidence) =>
    completed(e) && e.exitCode === 0 && e.failure === null && e.charges === 1 && e.requests >= 2;
  const checks = {
    buggyFails: matrix.buggy.length === 10 && matrix.buggy.every(realBug),
    sameFailureIdentity: matrix.buggy.length > 0 && matrix.buggy.every(identity),
    referenceFixPasses: matrix.reference.length === 3 && matrix.reference.every(validFix),
    alternateFixPasses: matrix.alternate.length === 3 && matrix.alternate.every(validFix),
    decoyFixStillFails:
      completed(matrix.decoy) &&
      matrix.decoy.exitCode === 1 &&
      (matrix.decoy.charges ?? 0) > 1 &&
      matrix.decoy.requests >= 2,
    deterministicRuns: matrix.buggy.length,
    deterministicFailures: matrix.buggy.filter((e) => realBug(e) && identity(e)).length,
    offlineExecution: all.every((e) => e.offline),
    isolatedExecution: all.every((e) => e.isolated),
    freshState: uniqueExecutionIds && all.every((e) => e.cleanDatabase),
    noSleepBasedTiming: policy.allowed,
    reviewableTest: source.split(/\r?\n/).length <= 60 && source.trim().length > 0,
    sameCandidate: all.every((e) => e.candidateHash === hash),
  };
  const reasonCodes = Object.entries(checks)
    .filter(([, value]) => value === false)
    .map(([key]) => key.replace(/[A-Z]/g, (s) => `_${s}`).toUpperCase() + '_FAILED');
  reasonCodes.push(...policy.reasons);
  if (!uniqueExecutionIds) reasonCodes.push('REUSED_EXECUTION_ID');
  const infrastructureError = all.some(
    (e) => !completed(e) || e.exitCode === null || ![0, 1].includes(e.exitCode),
  );
  if (infrastructureError) reasonCodes.push('EXECUTION_ERROR');
  const verified =
    !infrastructureError &&
    policy.allowed &&
    reasonCodes.length === 0 &&
    checks.deterministicFailures === 10;
  const status = infrastructureError
    ? 'ERROR'
    : verified
      ? 'VERIFIED'
      : matrix.buggy.some(realBug)
        ? 'PARTIAL'
        : 'NOT_REPRODUCED';
  return JudgeResultSchema.parse({
    schemaVersion: 1,
    incidentId: incident.id,
    runId: randomUUID(),
    status,
    telemetryTier: incident.telemetryTier,
    failureMatch: {
      type: incident.exception.type,
      topApplicationFrame: incident.exception.topApplicationFrame,
    },
    checks,
    missingEvidence: plan.missingEvidence,
    reasonCodes: [...new Set(reasonCodes)],
    testArtifact: plan.testSource ? 'repro.test.ts' : null,
    durationMs: all.reduce((sum, e) => sum + e.durationMs, 0),
    tokens: null,
    metadata: {
      evaluator: 'r1-strict-v2',
      candidateHash: hash,
      incidentHash: plan.sourceHash,
      referenceFixAttempts: matrix.reference.length,
      referenceFixSuccesses: matrix.reference.filter(validFix).length,
      alternateFixAttempts: matrix.alternate.length,
      alternateFixSuccesses: matrix.alternate.filter(validFix).length,
      executionRunIds: all.map((e) => e.runId),
      variantHashes: all.map((e) => e.variantHash),
    },
  });
}
