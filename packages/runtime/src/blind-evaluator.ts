import { createHash, randomBytes } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ALTERNATE_PATCH_HASH,
  CANDIDATE_PATCHES,
  DECOY_PATCH_HASH,
  REFERENCE_PATCH_HASH,
  type CandidateRole,
} from './candidate-patches.js';
import {
  runExternalContainer,
  type SupervisorExecutionResult,
} from './external-supervisor.js';
import { applyCandidatePatch } from './patch-applier.js';
import { scrubTest40FromParseJs } from './sanitizer.js';

export const QS33_IMAGE =
  'node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392';
export const QS33_BASE_COMMIT = '360e2b0b48548b9bfdb71f8c82a68c4f34ec0725';

const sha256 = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

export interface ParsedTapTest {
  name: string;
  status: 'passed' | 'failed';
  failure?: {
    type: string;
    message?: string;
    topApplicationFrame?: string;
  };
}

export interface ParsedTapSummary {
  tests: ParsedTapTest[];
  total: number;
  passed: number;
  failed: number;
}

export function parseTapOutput(stdout: string, stderr: string): ParsedTapSummary {
  const lines = stdout.split(/\r?\n/);
  const tests: ParsedTapTest[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = /^(ok|not ok) (\d+) (.+)$/.exec(line);
    if (!match) continue;

    const [, okPrefix, , title] = match;
    const cleanTitle = title!.trim();
    const isOk = okPrefix === 'ok';

    if (isOk) {
      tests.push({ name: cleanTitle, status: 'passed' });
    } else {
      let failureType = 'Error';
      let topFrame = '';
      let failureMessage = '';

      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        const nextLine = lines[j]!;
        if (/^(?:ok|not ok) \d+/.test(nextLine)) break;
        if (/^#\s+/.test(nextLine)) break;

        const errMatch = /^\s*([A-Za-z0-9_]+Error):\s*(.*)$/.exec(nextLine);
        if (errMatch && failureType === 'Error') {
          failureType = errMatch[1]!;
          failureMessage = errMatch[2]!.trim();
        }

        const frameMatch = /^\s*at\s+([A-Za-z0-9_$.<>]+)\s+\(([^)]+)\)/.exec(nextLine);
        if (frameMatch && !topFrame) {
          topFrame = `at ${frameMatch[1]} (${frameMatch[2]})`;
        }
      }

      if (!topFrame && stderr) {
        const frameMatch = /^\s*at\s+([A-Za-z0-9_$.<>]+)\s+\(([^)]+)\)/m.exec(stderr);
        if (frameMatch) {
          topFrame = `at ${frameMatch[1]} (${frameMatch[2]})`;
        }
      }

      tests.push({
        name: cleanTitle,
        status: 'failed',
        failure: {
          type: failureType,
          message: failureMessage,
          topApplicationFrame: topFrame,
        },
      });
    }
  }

  const passed = tests.filter((t) => t.status === 'passed').length;
  const failed = tests.filter((t) => t.status === 'failed').length;

  return {
    tests,
    total: tests.length,
    passed,
    failed,
  };
}

export interface TargetExecutionResult {
  role: 'buggy' | 'reference' | 'alternate' | 'decoy';
  runId: string;
  exitCode: number | null;
  patchHash: string;
  supervisorResult: SupervisorExecutionResult;
  generatedRun: {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    tap: ParsedTapSummary;
  };
  suiteRun: {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    tap: ParsedTapSummary;
  };
  evidenceDir: string;
}

export interface FourTargetEvaluationVerdict {
  verdict: 'SUCCESS' | 'DECOY_MISSED' | 'FIX_FAILED' | 'FALSE_POSITIVE' | 'EVALUATION_ERROR';
  generatedTestSha256: string;
  checks: {
    buggyFails: boolean;
    buggyFailureType: string;
    buggyTopFrame: string;
    referenceFixPasses: boolean;
    alternateFixPasses: boolean;
    decoyRejectedByGeneratedTest: boolean;
    decoyFailureType: string;
    nonRegressionBaselinePasses: boolean;
    offlineEnforced: boolean;
    isolationEnforced: boolean;
    cleanupEnforced: boolean;
  };
  targets: Record<'buggy' | 'reference' | 'alternate' | 'decoy', TargetExecutionResult>;
  errors: string[];
}

/**
 * Stages a clean target tree with the generated test and candidate patch
 */
export async function stageBlindTarget(options: {
  targetDir: string;
  role: 'buggy' | 'reference' | 'alternate' | 'decoy';
  repoRoot: string;
  generatedTestSource: string;
}): Promise<{
  stagedDir: string;
  patchHash: string;
  sourceHashes: Record<string, string>;
}> {
  const { targetDir, role, repoRoot, generatedTestSource } = options;
  await mkdir(targetDir, { recursive: true });

  const sourceBuggy = path.join(
    repoRoot,
    'work',
    'phase2',
    'gate-b-runs',
    'qs33-gateb-local-06',
    'source-buggy',
  );
  const labBundle = path.join(
    repoRoot,
    'work',
    'phase2',
    'gate-b-runs',
    'qs33-gateb-local-06',
    'lab-bundle',
  );

  // 1. Copy source tree
  await cp(sourceBuggy, targetDir, { recursive: true });

  // 2. Remove test #40 from test/parse.js so that only the 55 baseline tests exist
  const rawParseJs = await readFile(path.join(targetDir, 'test', 'parse.js'), 'utf8');
  const scrubbedParseJs = scrubTest40FromParseJs(rawParseJs);
  await writeFile(path.join(targetDir, 'test', 'parse.js'), scrubbedParseJs, 'utf8');

  // 3. Copy lab-bundle/node_modules
  await cp(path.join(labBundle, 'node_modules'), path.join(targetDir, 'node_modules'), {
    recursive: true,
  });

  // 4. Copy Lab adaptation
  await cp(
    path.join(repoRoot, 'scripts', 'phase2', 'gate-b-lab-adaptation.cjs'),
    path.join(targetDir, 'gate-b-lab-adaptation.cjs'),
  );

  // 5. Write the generated test file into test/repro.test.js
  await writeFile(path.join(targetDir, 'test', 'repro.test.js'), generatedTestSource, 'utf8');

  // 6. Write container supervisor script that runs:
  //    - Standalone generated test (repro.test.js)
  //    - Combined official test suite (test/parse.js + test/stringify.js + test/repro.test.js)
  const containerSupervisorScript = `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function exportBytes(name, bytes, append) {
  process.stdout.write(JSON.stringify({
    event: 'artifact',
    path: name,
    append: !!append,
    base64: bytes.toString('base64')
  }) + '\\n');
}

async function run(name, args) {
  const record = { argv: [process.execPath, ...args], exitCode: null, signal: null };
  exportBytes(name + '.stdout', Buffer.alloc(0), false);
  exportBytes(name + '.stderr', Buffer.alloc(0), false);
  await new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: '/case',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (bytes) => exportBytes(name + '.stdout', bytes, true));
    child.stderr.on('data', (bytes) => exportBytes(name + '.stderr', bytes, true));
    child.on('close', (code, signal) => {
      record.exitCode = code;
      record.signal = signal;
      resolve();
    });
  });
  exportBytes(name + '.json', Buffer.from(JSON.stringify(record, null, 2) + '\\n'), false);
  return record;
}

(async () => {
  // 1. Run standalone generated test
  const generated = await run('generated', [
    '--require', '/case/gate-b-lab-adaptation.cjs',
    'node_modules/lab/bin/lab', 'test/repro.test.js', '-r', 'tap'
  ]);

  // 2. Run combined suite (baseline 55 tests + generated test = 56 tests)
  const suite = await run('suite', [
    '--require', '/case/gate-b-lab-adaptation.cjs',
    'node_modules/lab/bin/lab', '-r', 'tap'
  ]);

  // Exit code reflects generated test result
  process.exitCode = generated.exitCode ?? suite.exitCode ?? 0;
})().catch((err) => {
  process.stderr.write(String(err?.stack || err) + '\\n');
  process.exitCode = 2;
});
`;
  await writeFile(path.join(targetDir, 'gate-c-supervisor.cjs'), containerSupervisorScript, 'utf8');

  // 7. Apply candidate patch if role is not buggy
  let patchHash = '0000000000000000000000000000000000000000000000000000000000000000';
  let sourceHashes: Record<string, string> = {};

  if (role !== 'buggy') {
    const candidateDef = CANDIDATE_PATCHES[role as CandidateRole];
    const patchResult = await applyCandidatePatch({
      stagingDir: targetDir,
      patch: candidateDef.patch,
      expectedPatchHash: candidateDef.sha256,
      baseCommit: QS33_BASE_COMMIT,
      expectedBaseCommit: QS33_BASE_COMMIT,
    });
    patchHash = patchResult.patchHash;
    sourceHashes = patchResult.sourceHashes;
  } else {
    sourceHashes['lib/utils.js'] = sha256(await readFile(path.join(targetDir, 'lib', 'utils.js')));
    sourceHashes['lib/parse.js'] = sha256(await readFile(path.join(targetDir, 'lib', 'parse.js')));
    sourceHashes['test/parse.js'] = sha256(await readFile(path.join(targetDir, 'test', 'parse.js')));
  }

  return { stagedDir: targetDir, patchHash, sourceHashes };
}

/**
 * Executes a single role under Docker supervisor and captures artifacts
 */
export async function executeBlindTarget(options: {
  role: 'buggy' | 'reference' | 'alternate' | 'decoy';
  repoRoot: string;
  generatedTestSource: string;
  evidenceDir: string;
  runIdSuffix?: string;
}): Promise<TargetExecutionResult> {
  const { role, repoRoot, generatedTestSource, evidenceDir } = options;
  const token = randomBytes(4).toString('hex');
  const runId = `phase3-${role}-${options.runIdSuffix ?? token}`;
  const stagingDir = path.join(evidenceDir, `staging-${role}`);

  try {
    const stagingInfo = await stageBlindTarget({
      targetDir: stagingDir,
      role,
      repoRoot,
      generatedTestSource,
    });

    const supervisorResult = await runExternalContainer({
      runId,
      role,
      image: QS33_IMAGE,
      stagedDir: stagingInfo.stagedDir,
      timeoutSeconds: 30,
    });

    const targetEvidenceDir = path.join(evidenceDir, role);
    await mkdir(targetEvidenceDir, { recursive: true });

    for (const [name, buffer] of Object.entries(supervisorResult.artifacts)) {
      await writeFile(path.join(targetEvidenceDir, name), buffer);
    }

    const genStdout = supervisorResult.artifacts['generated.stdout']?.toString('utf8') ?? '';
    const genStderr = supervisorResult.artifacts['generated.stderr']?.toString('utf8') ?? '';
    let genExitCode: number | null = null;
    if (supervisorResult.artifacts['generated.json']) {
      try {
        const meta = JSON.parse(supervisorResult.artifacts['generated.json'].toString('utf8'));
        genExitCode = meta.exitCode;
      } catch {}
    }

    const suiteStdout = supervisorResult.artifacts['suite.stdout']?.toString('utf8') ?? '';
    const suiteStderr = supervisorResult.artifacts['suite.stderr']?.toString('utf8') ?? '';
    let suiteExitCode: number | null = null;
    if (supervisorResult.artifacts['suite.json']) {
      try {
        const meta = JSON.parse(supervisorResult.artifacts['suite.json'].toString('utf8'));
        suiteExitCode = meta.exitCode;
      } catch {}
    }

    const generatedTap = parseTapOutput(genStdout, genStderr);
    const suiteTap = parseTapOutput(suiteStdout, suiteStderr);

    const execSummary = {
      runId,
      role,
      exitCode: supervisorResult.exitCode,
      patchHash: stagingInfo.patchHash,
      generatedRun: {
        exitCode: genExitCode,
        tap: generatedTap,
      },
      suiteRun: {
        exitCode: suiteExitCode,
        tap: suiteTap,
      },
      durationMs: supervisorResult.durationMs,
      isolation: supervisorResult.isolation,
      cleaned: supervisorResult.cleaned,
    };

    await writeFile(
      path.join(targetEvidenceDir, 'target-summary.json'),
      JSON.stringify(execSummary, null, 2) + '\n',
      'utf8',
    );

    return {
      role,
      runId,
      exitCode: supervisorResult.exitCode,
      patchHash: stagingInfo.patchHash,
      supervisorResult,
      generatedRun: {
        exitCode: genExitCode,
        stdout: genStdout,
        stderr: genStderr,
        tap: generatedTap,
      },
      suiteRun: {
        exitCode: suiteExitCode,
        stdout: suiteStdout,
        stderr: suiteStderr,
        tap: suiteTap,
      },
      evidenceDir: targetEvidenceDir,
    };
  } finally {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Runs the complete four-target evaluation matrix (buggy, reference, alternate, decoy)
 * and produces a formal verdict.
 */
export async function evaluateFourTargets(options: {
  repoRoot: string;
  generatedTestSource: string;
  evidenceDir: string;
  runPrefix?: string;
}): Promise<FourTargetEvaluationVerdict> {
  const { repoRoot, generatedTestSource, evidenceDir } = options;
  const generatedTestSha256 = sha256(generatedTestSource);
  await mkdir(evidenceDir, { recursive: true });

  const prefix = options.runPrefix ?? Date.now().toString().slice(-6);

  // Execute 4 targets sequentially in isolated fresh containers
  const buggy = await executeBlindTarget({
    role: 'buggy',
    repoRoot,
    generatedTestSource,
    evidenceDir,
    runIdSuffix: prefix,
  });

  const reference = await executeBlindTarget({
    role: 'reference',
    repoRoot,
    generatedTestSource,
    evidenceDir,
    runIdSuffix: prefix,
  });

  const alternate = await executeBlindTarget({
    role: 'alternate',
    repoRoot,
    generatedTestSource,
    evidenceDir,
    runIdSuffix: prefix,
  });

  const decoy = await executeBlindTarget({
    role: 'decoy',
    repoRoot,
    generatedTestSource,
    evidenceDir,
    runIdSuffix: prefix,
  });

  const errors: string[] = [];

  // Check 1: Buggy source must FAIL with TypeError
  const buggyGenFailed = buggy.generatedRun.exitCode === 1;
  const buggyFailedTest = buggy.generatedRun.tap.tests.find((t) => t.status === 'failed');
  const buggyFailureType = buggyFailedTest?.failure?.type ?? 'unknown';
  const buggyTopFrame = buggyFailedTest?.failure?.topApplicationFrame ?? '';
  const buggyFails =
    buggyGenFailed &&
    buggyFailureType === 'TypeError' &&
    (buggyTopFrame.includes('/case/lib/utils.js:47:20') ||
      buggy.generatedRun.stderr.includes('/case/lib/utils.js:47:20') ||
      buggy.generatedRun.stdout.includes('source.hasOwnProperty is not a function'));
  if (!buggyFails) {
    errors.push(
      `Buggy execution must fail with TypeError at /case/lib/utils.js:47:20. Exit code: ${buggy.generatedRun.exitCode}, error: ${buggyFailureType}`,
    );
  }

  // Check 2: Reference fix must PASS (exit 0, 0 assertion errors)
  const referenceFixPasses =
    reference.generatedRun.exitCode === 0 &&
    reference.generatedRun.tap.failed === 0 &&
    reference.generatedRun.tap.passed >= 1 &&
    reference.suiteRun.exitCode === 0;
  if (!referenceFixPasses) {
    errors.push(
      `Reference fix must pass with exit code 0. Got generated exit: ${reference.generatedRun.exitCode}, suite exit: ${reference.suiteRun.exitCode}`,
    );
  }

  // Check 3: Alternate fix must PASS (exit 0, 0 assertion errors)
  const alternateFixPasses =
    alternate.generatedRun.exitCode === 0 &&
    alternate.generatedRun.tap.failed === 0 &&
    alternate.generatedRun.tap.passed >= 1 &&
    alternate.suiteRun.exitCode === 0;
  if (!alternateFixPasses) {
    errors.push(
      `Alternate fix must pass with exit code 0. Got generated exit: ${alternate.generatedRun.exitCode}, suite exit: ${alternate.suiteRun.exitCode}`,
    );
  }

  // Check 4: Decoy fix must FAIL on semantic correctness (AssertionError)
  const decoyGenFailed = decoy.generatedRun.exitCode === 1;
  const decoyFailedTest = decoy.generatedRun.tap.tests.find((t) => t.status === 'failed');
  const decoyFailureType = decoyFailedTest?.failure?.type ?? 'unknown';
  const decoyRejectedByGeneratedTest =
    decoyGenFailed &&
    (decoyFailureType === 'AssertionError' ||
      decoy.generatedRun.stdout.includes('AssertionError') ||
      decoy.generatedRun.stderr.includes('AssertionError') ||
      decoy.generatedRun.stdout.includes('expected') ||
      decoy.generatedRun.stderr.includes('expected'));
  if (!decoyRejectedByGeneratedTest) {
    errors.push(
      `Decoy fix must be rejected by generated test with AssertionError (exit code 1). Got exit: ${decoy.generatedRun.exitCode}, error: ${decoyFailureType}`,
    );
  }

  // Check 5: Non-regression check: The 55 baseline tests pass on all 4 targets
  const nonRegressionBaselinePasses =
    buggy.suiteRun.tap.passed >= 55 &&
    reference.suiteRun.tap.passed >= 56 &&
    alternate.suiteRun.tap.passed >= 56 &&
    decoy.suiteRun.tap.passed >= 55;
  if (!nonRegressionBaselinePasses) {
    errors.push(
      `Baseline test non-regression check failed: buggy passed ${buggy.suiteRun.tap.passed}, ref passed ${reference.suiteRun.tap.passed}, alt passed ${alternate.suiteRun.tap.passed}, decoy passed ${decoy.suiteRun.tap.passed}`,
    );
  }

  // Security checks across all 4 targets
  const allTargets = [buggy, reference, alternate, decoy];
  const offlineEnforced = allTargets.every((t) => t.supervisorResult.isolation.networkMode === 'none');
  const isolationEnforced = allTargets.every(
    (t) =>
      t.supervisorResult.isolation.user === '1000:1000' &&
      t.supervisorResult.isolation.readonlyRoot === true &&
      t.supervisorResult.isolation.capDropAll === true &&
      t.supervisorResult.isolation.noNewPrivileges === true,
  );
  const cleanupEnforced = allTargets.every((t) => t.supervisorResult.cleaned === true);

  if (!offlineEnforced) errors.push('Offline isolation failed on one or more targets');
  if (!isolationEnforced) errors.push('Resource isolation limits failed on one or more targets');
  if (!cleanupEnforced) errors.push('Guaranteed cleanup failed on one or more targets');

  let verdict: FourTargetEvaluationVerdict['verdict'] = 'SUCCESS';
  if (errors.length > 0) {
    if (!buggyFails) verdict = 'FALSE_POSITIVE';
    else if (!referenceFixPasses || !alternateFixPasses) verdict = 'FIX_FAILED';
    else if (!decoyRejectedByGeneratedTest) verdict = 'DECOY_MISSED';
    else verdict = 'EVALUATION_ERROR';
  }

  const checks = {
    buggyFails,
    buggyFailureType,
    buggyTopFrame,
    referenceFixPasses,
    alternateFixPasses,
    decoyRejectedByGeneratedTest,
    decoyFailureType,
    nonRegressionBaselinePasses,
    offlineEnforced,
    isolationEnforced,
    cleanupEnforced,
  };

  const finalVerdict: FourTargetEvaluationVerdict = {
    verdict,
    generatedTestSha256,
    checks,
    targets: { buggy, reference, alternate, decoy },
    errors,
  };

  // Write evaluation verdict and artifact hash index
  await writeFile(
    path.join(evidenceDir, 'evaluation-verdict.json'),
    JSON.stringify(
      {
        verdict: finalVerdict.verdict,
        generatedTestSha256: finalVerdict.generatedTestSha256,
        checks: finalVerdict.checks,
        errors: finalVerdict.errors,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  return finalVerdict;
}
