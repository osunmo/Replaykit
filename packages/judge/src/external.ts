import { createHash } from 'node:crypto';
import { builtinModules } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import {
  ExternalManifestSchema,
  ExternalMatrixSchema,
  OfficialReportSchema,
  type ExternalExecution,
  type ExternalManifest,
} from '../../contracts/src/external.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const emptyChecks = () => ({
  buggyFails: false,
  sameFailureIdentity: false,
  referenceFixPasses: false,
  alternateFixPasses: false,
  decoyFixStillFails: false,
  deterministicRuns: 0,
  deterministicFailures: 0,
  offlineExecution: false,
  isolatedExecution: false,
  freshState: false,
  noSleepBasedTiming: false,
  reviewableTest: false,
  sameCandidate: false,
});
export interface ExternalJudgeResult {
  contract: 'external-official-suite-v1';
  status: 'VERIFIED' | 'PARTIAL' | 'NOT_REPRODUCED' | 'ERROR';
  checks: ReturnType<typeof emptyChecks>;
  reasonCodes: string[];
}
function error(reason: string): ExternalJudgeResult {
  return {
    contract: 'external-official-suite-v1',
    status: 'ERROR',
    checks: emptyChecks(),
    reasonCodes: [reason],
  };
}

/** Official test source is reviewed separately from R1's SDK-specific imports. */
function inspect(source: string, config: ExternalManifest): boolean {
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
    'WebSocket',
    'XMLHttpRequest',
  ]);
  const safeNode = new Set(['test', 'assert', 'assert/strict']);
  const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, '')));
  let allowed = true;
  function visit(node: ts.Node): void {
    if (
      ts.isThrowStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isForStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isForInStatement(node)
    )
      allowed = false;
    if (ts.isIdentifier(node) && banned.has(node.text)) allowed = false;
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      allowed = false;
    if (ts.isImportDeclaration(node)) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) allowed = false;
      else {
        const name = node.moduleSpecifier.text;
        const bare = name.replace(/^node:/, '');
        if (
          ((name.startsWith('node:') || builtins.has(bare)) && !safeNode.has(bare)) ||
          name.startsWith('/') ||
          name.includes('\\')
        )
          allowed = false;
        if (name.startsWith('.')) {
          const target = path.posix.normalize(
            path.posix.join(path.posix.dirname(config.testFile), name),
          );
          if (target === '..' || target.startsWith('../')) allowed = false;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  const ast = ts.createSourceFile(
    config.testFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  visit(ast);
  return allowed;
}

/**
 * Trusted supervisor API only. Incident/telemetry data is not an argument and
 * cannot dispatch here; the R1 evaluator and its execution schema are untouched.
 */
export function evaluateExternalEvidence(
  rawConfig: unknown,
  source: string,
  rawMatrix: unknown,
): ExternalJudgeResult {
  const parsedConfig = ExternalManifestSchema.safeParse(rawConfig);
  const parsedMatrix = ExternalMatrixSchema.safeParse(rawMatrix);
  if (!parsedConfig.success || !parsedMatrix.success) return error('EVIDENCE_CONTRACT_INVALID');
  const config = parsedConfig.data;
  const matrix = parsedMatrix.data;
  const all = [...matrix.buggy, ...matrix.reference, ...matrix.alternate, matrix.decoy];
  const reports = new Map<ExternalExecution, ReturnType<typeof OfficialReportSchema.parse>>();
  let infrastructureError = false;
  for (const e of all) {
    if (e.executionStatus !== 'COMPLETED' || e.exitCode === null || ![0, 1].includes(e.exitCode))
      infrastructureError = true;
    if (e.reportJson === null || e.reportHash !== hash(e.reportJson)) {
      infrastructureError = true;
      continue;
    }
    try {
      const report = OfficialReportSchema.parse(JSON.parse(e.reportJson));
      if (new Set(report.tests.map((t) => t.name)).size !== report.tests.length) {
        infrastructureError = true;
        continue;
      }
      reports.set(e, report);
    } catch {
      infrastructureError = true;
    }
  }
  const inventory = (e: ExternalExecution) => {
    const tests = reports.get(e)?.tests ?? [];
    return (
      [...config.failToPass, ...config.passToPass].every((name) =>
        tests.some((t) => t.name === name),
      ) && tests.every((t) => t.status !== 'skipped')
    );
  };
  const hasStatus = (e: ExternalExecution, names: string[], status: 'passed' | 'failed') =>
    names.every((name) =>
      reports.get(e)?.tests.some((t) => t.name === name && t.status === status),
    );
  const bound = (e: ExternalExecution, patchHash: string) =>
    e.instanceId === config.instanceId &&
    e.baseCommit === config.baseCommit &&
    e.image === config.image &&
    e.patchHash === patchHash &&
    e.testPatchHash === config.testPatchHash &&
    e.candidateHash === config.candidateHash &&
    e.candidateHash === hash(source) &&
    e.sourceHashes[config.testFile] === config.testFileHash &&
    config.sourceFiles.every((name) => !!e.sourceHashes[name]) &&
    Object.keys(e.sourceHashes).every((name) => config.sourceFiles.includes(name));
  const realBug = (e: ExternalExecution, patchHash: string) =>
    e.executionStatus === 'COMPLETED' &&
    e.exitCode === 1 &&
    bound(e, patchHash) &&
    inventory(e) &&
    hasStatus(e, config.failToPass, 'failed') &&
    hasStatus(e, config.passToPass, 'passed') &&
    (reports
      .get(e)
      ?.tests.every((t) => config.failToPass.includes(t.name) || t.status === 'passed') ??
      false);
  const identity = (e: ExternalExecution) =>
    reports
      .get(e)
      ?.tests.some(
        (t) =>
          config.failToPass.includes(t.name) &&
          t.status === 'failed' &&
          t.failure?.type === config.expectedFailure.type &&
          t.failure.topApplicationFrame === config.expectedFailure.topApplicationFrame,
      ) ?? false;
  const validFix = (e: ExternalExecution, patchHash: string) =>
    e.executionStatus === 'COMPLETED' &&
    e.exitCode === 0 &&
    bound(e, patchHash) &&
    inventory(e) &&
    hasStatus(e, [...config.failToPass, ...config.passToPass], 'passed') &&
    (reports.get(e)?.tests.every((t) => t.status === 'passed' && t.failure === null) ?? false);
  const checks = {
    buggyFails:
      matrix.buggy.length === 10 && matrix.buggy.every((e) => realBug(e, config.patchHashes.buggy)),
    sameFailureIdentity: matrix.buggy.length > 0 && matrix.buggy.every(identity),
    referenceFixPasses:
      matrix.reference.length === 3 &&
      matrix.reference.every((e) => validFix(e, config.patchHashes.reference)),
    alternateFixPasses:
      matrix.alternate.length === 3 &&
      matrix.alternate.every((e) => validFix(e, config.patchHashes.alternate)),
    decoyFixStillFails: realBug(matrix.decoy, config.patchHashes.decoy),
    deterministicRuns: matrix.buggy.length,
    deterministicFailures: matrix.buggy.filter(
      (e) => realBug(e, config.patchHashes.buggy) && identity(e),
    ).length,
    offlineExecution: all.length > 0 && all.every((e) => e.isolation.networkMode === 'none'),
    isolatedExecution:
      all.length > 0 &&
      all.every((e) => {
        const i = e.isolation;
        return (
          /^(?:[1-9][0-9]*)(?::[0-9]+)?$/.test(i.user) &&
          (i.readonlyRoot || !!config.readonlyRootException) &&
          i.capDropAll &&
          i.noNewPrivileges &&
          i.cpus <= 1 &&
          i.memoryBytes <= 268435456 &&
          i.pidsLimit <= 64
        );
      }),
    freshState:
      new Set(all.map((e) => e.runId)).size === all.length && all.every((e) => e.freshWorkspace),
    noSleepBasedTiming: inspect(source, config),
    reviewableTest:
      source.trim().length > 0 &&
      source.length <= 32768 &&
      (source.split(/\r?\n/).length <= 60 || !!config.reviewException),
    sameCandidate:
      config.candidateHash === hash(source) && all.every((e) => e.candidateHash === hash(source)),
  };
  const reasonCodes = Object.entries(checks)
    .filter(([, value]) => value === false)
    .map(([name]) => name.replace(/[A-Z]/g, (letter) => '_' + letter).toUpperCase() + '_FAILED');
  if (infrastructureError) reasonCodes.push('EXECUTION_ERROR');
  const verified =
    !infrastructureError && !reasonCodes.length && checks.deterministicFailures === 10;
  return {
    contract: 'external-official-suite-v1',
    status: infrastructureError
      ? 'ERROR'
      : verified
        ? 'VERIFIED'
        : matrix.buggy.some((e) => realBug(e, config.patchHashes.buggy))
          ? 'PARTIAL'
          : 'NOT_REPRODUCED',
    checks,
    reasonCodes,
  };
}
