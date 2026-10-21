import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ExternalManifestSchema,
  OfficialReportSchema,
  type ExternalExecution,
  type ExternalManifest,
} from '../../../contracts/src/external.js';
import type { ExternalRunResult } from '../external-runner.js';
import type { SupervisorExecutionResult } from '../external-supervisor.js';
import {
  ALTERNATE_PATCH_HASH,
  CANDIDATE_PATCHES,
  DECOY_PATCH_HASH,
  REFERENCE_PATCH_HASH,
  type CandidateRole,
} from '../candidate-patches.js';
import { applyCandidatePatch } from '../patch-applier.js';

export const QS33_INSTANCE_ID = 'qs__issue-33';
export const QS33_BASE_COMMIT = '360e2b0b48548b9bfdb71f8c82a68c4f34ec0725';
export const QS33_FIXED_COMMIT = '6a97ad1d71d8a9069f5d6002cab3130752519ccb';
export const QS33_IMAGE =
  'node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392';
export const QS33_TEST_FILE = 'test/parse.js';
export const QS33_TEST_FILE_HASH =
  'be7137407c865b889674d1bb7a9a8317e8f605ff4ae189ef2a751feb0b9451a5';
export const QS33_TEST_PATCH_HASH =
  '76cd9fa01ecaf309f2c8bd4ea0f9e40ecb8ddba8a81189668eb1bc2973f11c27';

export const QS33_FAIL_TO_PASS = ['parse parses plain objects correctly'];

export const QS33_PASS_TO_PASS = [
  'parse parses a simple string',
  'parse parses a single nested string',
  'parse parses a double nested string',
  'parse defaults to a depth of 5',
  'parse only parses one level when depth = 1',
  'parse parses a simple array',
  'parse parses an explicit array',
  'parse parses a nested array',
  'parse allows to specify array indices',
  'parse limits specific array indices to 20',
  'parse supports encoded = signs',
  'parse is ok with url encoded strings',
  'parse allows brackets in the value',
  'parse allows empty values',
  'parse transforms arrays to objects',
  'parse correctly prunes undefined values when converting an array to an object',
  'parse supports malformed uri characters',
  'parse doesn\'t produce empty keys',
  'parse cannot override prototypes',
  'parse cannot access Object prototype',
  'parse parses arrays of objects',
  'parse allows for empty strings in arrays',
  'parse compacts sparse arrays',
  'parse parses semi-parsed strings',
  'parse parses buffers to strings',
  'parse continues parsing when no parent is found',
  'parse does not error when parsing a very long array',
  'parse should not throw when a native prototype has an enumerable property',
  'parse parses a string with an alternative string delimiter',
  'parse parses a string with an alternative RegExp delimiter',
  'parse does not use non-splittable objects as delimiters',
  'parse allows overriding parameter limit',
  'parse allows setting the parameter limit to Infinity',
  'parse allows overriding array limit',
  'parse parses an object',
  'parse parses an object and not child values',
  'parse does not blow up when Buffer global is missing',
  'parse does not crash when using invalid dot notation',
  'parse does not crash when parsing circular references',
  'stringify stringifies a querystring object',
  'stringify stringifies a nested object',
  'stringify stringifies an array value',
  'stringify stringifies a nested array value',
  'stringify stringifies an object inside an array',
  'stringify stringifies a complicated object',
  'stringify stringifies an empty value',
  'stringify drops keys with a value of undefined',
  'stringify url encodes values',
  'stringify stringifies a date',
  'stringify stringifies the weird object from qs',
  'stringify skips properties that are part of the object prototype',
  'stringify stringifies boolean values',
  'stringify stringifies buffer values',
  'stringify stringifies an object using an alternative delimiter',
  'stringify doesn\'t blow up when Buffer global is missing',
];

export const QS33_SOURCE_FILES = [
  '.gitignore',
  '.jshintignore',
  '.jshintrc',
  '.travis.yml',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'index.js',
  'lib/index.js',
  'lib/parse.js',
  'lib/stringify.js',
  'lib/utils.js',
  'LICENSE',
  'Makefile',
  'package.json',
  'README.md',
  'test/parse.js',
  'test/stringify.js',
];

export const QS33_EXPECTED_FAILURE = {
  type: 'TypeError',
  topApplicationFrame: 'at exports.clone (/case/lib/utils.js:47:20)',
};

export const QS33_CANDIDATE_TEST = `    it('parses plain objects correctly', function (done) {

        var a = Object.create(null);
        a.b = 'c';
        
        expect(Qs.parse({ a: a })).to.deep.equal({ a: { b: 'c' } });
        done();
    });`;

export const sha256 = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

/**
 * Normalizes raw TAP output and stderr from Lab 3.0.0 into an OfficialReport object.
 */
export function parseQs33TapReport(
  stdout: string,
  stderr: string,
): {
  reportJson: string;
  reportHash: string;
  parsedReport: ReturnType<typeof OfficialReportSchema.parse>;
} {
  const lines = stdout.split(/\r?\n/);
  const testResults: Array<{
    name: string;
    status: 'passed' | 'failed' | 'skipped';
    failure: { type: string; topApplicationFrame: string } | null;
  }> = [];

  // Extract failure identity from TAP stdout/stderr
  // In Lab TAP output, failure blocks look like:
  // not ok 40 parse parses plain objects correctly
  //   TypeError: source.hasOwnProperty is not a function
  //     at exports.clone (/case/lib/utils.js:47:20)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = /^(ok|not ok) (\d+) (.+)$/.exec(line);
    if (!match) continue;

    const [, okPrefix, , title] = match;
    const cleanTitle = title!.trim();
    const isOk = okPrefix === 'ok';

    if (isOk) {
      testResults.push({
        name: cleanTitle,
        status: 'passed',
        failure: null,
      });
    } else {
      // Failed test: search forward for error type and top stack frame
      let failureType = 'Error';
      let topFrame = '';

      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        const nextLine = lines[j]!;
        if (/^(?:ok|not ok) \d+/.test(nextLine)) break; // Reached next test
        if (/^#\s+/.test(nextLine)) break; // Reached summary section

        // Check for error header e.g. "TypeError: ..."
        const errMatch = /^\s*([A-Za-z0-9_]+Error):/.exec(nextLine);
        if (errMatch && failureType === 'Error') {
          failureType = errMatch[1]!;
        }

        // Check for stack frame e.g. "at exports.clone (/case/lib/utils.js:47:20)"
        const frameMatch = /^\s*at\s+([A-Za-z0-9_$.<>]+)\s+\(([^)]+)\)/.exec(nextLine);
        if (frameMatch && !topFrame) {
          topFrame = `at ${frameMatch[1]} (${frameMatch[2]})`;
        }
      }

      // If frame was not in stdout, check stderr
      if (!topFrame && stderr) {
        const errFrameMatch = /^\s*at\s+([A-Za-z0-9_$.<>]+)\s+\(([^)]+)\)/m.exec(stderr);
        if (errFrameMatch) {
          topFrame = `at ${errFrameMatch[1]} (${errFrameMatch[2]})`;
        }
      }

      testResults.push({
        name: cleanTitle,
        status: 'failed',
        failure: {
          type: failureType,
          topApplicationFrame: topFrame || 'unknown',
        },
      });
    }
  }

  const rawReport = {
    reporter: 'official-suite-normalized-v1' as const,
    tests: testResults,
  };

  const parsedReport = OfficialReportSchema.parse(rawReport);
  const reportJson = JSON.stringify(parsedReport);
  const reportHash = sha256(reportJson);

  return { reportJson, reportHash, parsedReport };
}

export interface Qs33ProbeReport {
  passed: boolean;
  serializedOutput: string | null;
  error: {
    name: string;
    type: string;
    message: string;
    topApplicationFrame: string;
  } | null;
}

/**
 * Parses stdout and stderr from gate-b-probe.cjs into a typed Qs33ProbeReport.
 */
export function parseQs33ProbeReport(stdout: string, stderr: string): Qs33ProbeReport {
  let passed = false;
  let serializedOutput: string | null = null;
  let error: {
    name: string;
    type: string;
    message: string;
    topApplicationFrame: string;
  } | null = null;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.event === 'issue33-output' && parsed.output) {
        serializedOutput = JSON.stringify(parsed.output);
      }
      if (parsed.event === 'issue33-assertion' && parsed.passed === true) {
        passed = true;
      }
      if (parsed.event === 'issue33-error') {
        const stackStr = parsed.stack || stderr;
        let topFrame = '';
        const frameMatch = /^\s*at\s+([A-Za-z0-9_$.<>]+)\s+\(([^)]+)\)/m.exec(stackStr);
        if (frameMatch) {
          topFrame = `at ${frameMatch[1]} (${frameMatch[2]})`;
        }
        error = {
          name: parsed.name ?? 'Error',
          type: parsed.type ?? 'Error',
          message: parsed.message ?? '',
          topApplicationFrame: topFrame,
        };
      }
    } catch {
      // ignore
    }
  }

  // Fallback to stderr if error event wasn't present in stdout
  if (!error && stderr.trim()) {
    const errMatch = /^\s*([A-Za-z0-9_]+Error):\s*(.+)/m.exec(stderr);
    const frameMatch = /^\s*at\s+([A-Za-z0-9_$.<>]+)\s+\(([^)]+)\)/m.exec(stderr);
    if (errMatch) {
      error = {
        name: errMatch[1]!,
        type: errMatch[1]!,
        message: errMatch[2]!.trim(),
        topApplicationFrame: frameMatch ? `at ${frameMatch[1]} (${frameMatch[2]})` : '',
      };
    }
  }

  return { passed, serializedOutput, error };
}

/**
 * Creates an ExternalManifest for qs issue 33.
 */
export function createQs33Manifest(options?: {
  patchHashes?: {
    buggy: string;
    reference: string;
    alternate: string;
    decoy: string;
  };
  candidateSource?: string;
}): ExternalManifest {
  const candidate = options?.candidateSource ?? QS33_CANDIDATE_TEST;
  const candidateHash = sha256(candidate);

  const manifest: ExternalManifest = {
    contract: 'external-official-suite-v1',
    instanceId: QS33_INSTANCE_ID,
    baseCommit: QS33_BASE_COMMIT,
    image: QS33_IMAGE,
    testPatchHash: QS33_TEST_PATCH_HASH,
    candidateHash,
    testFile: QS33_TEST_FILE,
    testFileHash: QS33_TEST_FILE_HASH,
    sourceFiles: QS33_SOURCE_FILES,
    failToPass: QS33_FAIL_TO_PASS,
    passToPass: QS33_PASS_TO_PASS,
    expectedFailure: QS33_EXPECTED_FAILURE,
    patchHashes: options?.patchHashes ?? {
      buggy: '0000000000000000000000000000000000000000000000000000000000000000',
      reference: REFERENCE_PATCH_HASH,
      alternate: ALTERNATE_PATCH_HASH,
      decoy: DECOY_PATCH_HASH,
    },
  };

  return ExternalManifestSchema.parse(manifest);
}

/**
 * Stages the payload directory for a given qs33 role execution.
 */
export async function stageQs33Payload(
  targetDir: string,
  role: 'buggy' | 'reference' | 'fixed' | 'alternate' | 'decoy',
  repoRoot: string,
  options?: { candidateSource?: string },
): Promise<{
  stagedDir: string;
  sourceHashes: Record<string, string>;
  patchHash: string;
  testPatchHash: string;
  candidateHash: string;
}> {
  await mkdir(targetDir, { recursive: true });

  const isCandidate = role === 'reference' || role === 'alternate' || role === 'decoy';
  const isLegacyFixed = role === 'fixed';
  // Candidate roles ('reference', 'alternate', 'decoy') and 'buggy' start from source-buggy.
  // Legacy role 'fixed' uses pre-patched source-fixed.
  const local06Source = path.join(
    repoRoot,
    'work',
    'phase2',
    'gate-b-runs',
    'qs33-gateb-local-06',
    isLegacyFixed ? 'source-fixed' : 'source-buggy',
  );
  const labBundle = path.join(
    repoRoot,
    'work',
    'phase2',
    'gate-b-runs',
    'qs33-gateb-local-06',
    'lab-bundle',
  );

  // Copy base source files into staging
  await cp(local06Source, targetDir, { recursive: true });

  // Copy lab-bundle/node_modules into staging
  await cp(path.join(labBundle, 'node_modules'), path.join(targetDir, 'node_modules'), {
    recursive: true,
  });

  // Copy Lab adaptation and probe
  await cp(
    path.join(repoRoot, 'scripts', 'phase2', 'gate-b-lab-adaptation.cjs'),
    path.join(targetDir, 'gate-b-lab-adaptation.cjs'),
  );
  await cp(
    path.join(repoRoot, 'scripts', 'phase2', 'gate-b-probe.cjs'),
    path.join(targetDir, 'gate-b-probe.cjs'),
  );

  // Write container supervisor script
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
  const official = await run('official', [
    '--require', '/case/gate-b-lab-adaptation.cjs',
    'node_modules/lab/bin/lab', '-r', 'tap'
  ]);
  await run('probe', ['gate-b-probe.cjs']);
  process.exitCode = official.exitCode ?? 0;
})().catch((err) => {
  process.stderr.write(String(err?.stack || err) + '\\n');
  process.exitCode = 2;
});
`;
  await writeFile(path.join(targetDir, 'gate-c-supervisor.cjs'), containerSupervisorScript, 'utf8');

  const candidate = options?.candidateSource ?? QS33_CANDIDATE_TEST;
  const candidateHash = sha256(candidate);

  let patchHash = '0000000000000000000000000000000000000000000000000000000000000000';
  let sourceHashes: Record<string, string> = {};

  if (isCandidate) {
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
    if (isLegacyFixed) {
      patchHash = '6a97ad1d71d8a9069f5d6002cab3130752519ccb000000000000000000000001';
    }
    for (const file of QS33_SOURCE_FILES) {
      const filePath = path.join(targetDir, ...file.split('/'));
      const content = await readFile(filePath);
      sourceHashes[file] = sha256(content);
    }
  }

  return {
    stagedDir: targetDir,
    sourceHashes,
    patchHash,
    testPatchHash: QS33_TEST_PATCH_HASH,
    candidateHash,
  };
}

/**
 * Builds an ExternalExecution object from supervisor result, staging info, and normalized report.
 */
export function buildQs33ExecutionRecord(
  supervisorResult: SupervisorExecutionResult,
  stagingInfo: {
    sourceHashes: Record<string, string>;
    patchHash: string;
    testPatchHash: string;
    candidateHash: string;
  },
  normalizedReport: {
    reportJson: string;
    reportHash: string;
  },
): ExternalExecution {
  return {
    contract: 'external-official-suite-v1',
    instanceId: QS33_INSTANCE_ID,
    baseCommit: QS33_BASE_COMMIT,
    runId: supervisorResult.runId,
    image: QS33_IMAGE,
    patchHash: stagingInfo.patchHash,
    testPatchHash: stagingInfo.testPatchHash,
    candidateHash: stagingInfo.candidateHash,
    sourceHashes: stagingInfo.sourceHashes,
    executionStatus: supervisorResult.executionStatus,
    exitCode: supervisorResult.exitCode,
    reportJson: normalizedReport.reportJson,
    reportHash: normalizedReport.reportHash,
    freshWorkspace: true,
    durationMs: supervisorResult.durationMs,
    isolation: supervisorResult.isolation,
  };
}

export interface C2VerificationReport {
  passed: boolean;
  checks: {
    sequentialRuns: boolean;
    buggyStatusCompleted: boolean;
    buggyExitCode1: boolean;
    buggyTestCount56: boolean;
    buggyPassCount55: boolean;
    buggyFailCount1: boolean;
    buggyOnlyTest40Failed: boolean;
    buggyFailureTypeMatch: boolean;
    buggyFailureFrameMatch: boolean;
    buggyProbeExitCode1: boolean;
    buggyProbeErrorMatch: boolean;
    fixedStatusCompleted: boolean;
    fixedExitCode0: boolean;
    fixedTestCount56: boolean;
    fixedPassCount56: boolean;
    fixedFailCount0: boolean;
    fixedProbeExitCode0: boolean;
    fixedProbeOutputMatch: boolean;
    fixedIdentitiesMatchBuggy: boolean;
    offlineEnforced: boolean;
    isolationEnforced: boolean;
    cleanupEnforced: boolean;
    provenanceAttributable: boolean;
  };
  errors: string[];
}

/**
 * Verifies that a live sequential buggy/fixed execution pair satisfies all Gate C2 expectations.
 */
export function verifyQs33C2Expectations(
  buggy: ExternalRunResult,
  fixed: ExternalRunResult,
): C2VerificationReport {
  const errors: string[] = [];

  // 1. Sequential & distinct runs
  const sequentialRuns = buggy.supervisorResult.runId !== fixed.supervisorResult.runId;
  if (!sequentialRuns) errors.push('Run IDs must be distinct and sequential');

  // 2. Buggy official suite
  const buggyStatusCompleted = buggy.supervisorResult.executionStatus === 'COMPLETED';
  if (!buggyStatusCompleted) errors.push('Buggy execution status must be COMPLETED');

  const buggyExitCode1 = buggy.execution.exitCode === 1;
  if (!buggyExitCode1) errors.push('Buggy execution exit code must be 1');

  const buggyTests = buggy.normalizedReport.parsedReport.tests;
  const buggyTestCount56 = buggyTests.length === 56;
  if (!buggyTestCount56) errors.push(`Buggy tests count must be 56, observed ${buggyTests.length}`);

  const buggyPasses = buggyTests.filter((t) => t.status === 'passed');
  const buggyPassCount55 = buggyPasses.length === 55;
  if (!buggyPassCount55) errors.push(`Buggy passed tests must be 55, observed ${buggyPasses.length}`);

  const buggyFails = buggyTests.filter((t) => t.status === 'failed');
  const buggyFailCount1 = buggyFails.length === 1;
  if (!buggyFailCount1) errors.push(`Buggy failed tests must be 1, observed ${buggyFails.length}`);

  const test40 = buggyTests.find((t) => t.name === 'parse parses plain objects correctly');
  const buggyOnlyTest40Failed = buggyFails.length === 1 && test40?.status === 'failed';
  if (!buggyOnlyTest40Failed) errors.push('Only test 40 (parse parses plain objects correctly) must fail');

  const buggyFailureTypeMatch = test40?.failure?.type === 'TypeError';
  if (!buggyFailureTypeMatch) errors.push(`Buggy failure type must be TypeError, observed ${test40?.failure?.type}`);

  const buggyFailureFrameMatch =
    test40?.failure?.topApplicationFrame === 'at exports.clone (/case/lib/utils.js:47:20)';
  if (!buggyFailureFrameMatch)
    errors.push(`Buggy failure frame mismatch: ${test40?.failure?.topApplicationFrame}`);

  // 3. Buggy probe
  let buggyProbeExit = -1;
  if (buggy.supervisorResult.artifacts['probe.json']) {
    try {
      const probeJson = JSON.parse(buggy.supervisorResult.artifacts['probe.json'].toString('utf8'));
      buggyProbeExit = probeJson.exitCode;
    } catch {}
  }
  const buggyProbeExitCode1 = buggyProbeExit === 1;
  if (!buggyProbeExitCode1) errors.push(`Buggy probe exit code must be 1, observed ${buggyProbeExit}`);

  const buggyProbeErrorMatch =
    buggy.probeReport.passed === false &&
    buggy.probeReport.error?.type === 'TypeError' &&
    buggy.probeReport.error?.message === 'source.hasOwnProperty is not a function' &&
    (buggy.probeReport.error?.topApplicationFrame.includes('/case/lib/utils.js:47:20') ?? false);
  if (!buggyProbeErrorMatch) errors.push('Buggy probe must exhibit native TypeError at /case/lib/utils.js:47:20');

  // 4. Fixed official suite
  const fixedStatusCompleted = fixed.supervisorResult.executionStatus === 'COMPLETED';
  if (!fixedStatusCompleted) errors.push('Fixed execution status must be COMPLETED');

  const fixedExitCode0 = fixed.execution.exitCode === 0;
  if (!fixedExitCode0) errors.push('Fixed execution exit code must be 0');

  const fixedTests = fixed.normalizedReport.parsedReport.tests;
  const fixedTestCount56 = fixedTests.length === 56;
  if (!fixedTestCount56) errors.push(`Fixed tests count must be 56, observed ${fixedTests.length}`);

  const fixedPasses = fixedTests.filter((t) => t.status === 'passed' && t.failure === null);
  const fixedPassCount56 = fixedPasses.length === 56;
  if (!fixedPassCount56) errors.push(`Fixed passed tests must be 56, observed ${fixedPasses.length}`);

  const fixedFails = fixedTests.filter((t) => t.status === 'failed' || t.status === 'skipped');
  const fixedFailCount0 = fixedFails.length === 0;
  if (!fixedFailCount0) errors.push(`Fixed failures/skips must be 0, observed ${fixedFails.length}`);

  const fixedIdentitiesMatchBuggy =
    buggyTests.length === fixedTests.length &&
    buggyTests.every((bt, idx) => fixedTests[idx]?.name === bt.name);
  if (!fixedIdentitiesMatchBuggy) errors.push('Fixed test identities must match buggy identities in exact order');

  // 5. Fixed probe
  let fixedProbeExit = -1;
  if (fixed.supervisorResult.artifacts['probe.json']) {
    try {
      const probeJson = JSON.parse(fixed.supervisorResult.artifacts['probe.json'].toString('utf8'));
      fixedProbeExit = probeJson.exitCode;
    } catch {}
  }
  const fixedProbeExitCode0 = fixedProbeExit === 0;
  if (!fixedProbeExitCode0) errors.push(`Fixed probe exit code must be 0, observed ${fixedProbeExit}`);

  const fixedProbeOutputMatch =
    fixed.probeReport.passed === true &&
    fixed.probeReport.error === null &&
    fixed.probeReport.serializedOutput === '{"a":{"b":"c"}}';
  if (!fixedProbeOutputMatch) errors.push('Fixed probe must pass with exact output {"a":{"b":"c"}}');

  // 6. Security & Isolation
  const offlineEnforced =
    buggy.execution.isolation.networkMode === 'none' &&
    fixed.execution.isolation.networkMode === 'none';
  if (!offlineEnforced) errors.push('Offline isolation (--network none) must be enforced for both');

  const isIsolated = (iso: ExternalExecution['isolation']) =>
    iso.user === '1000:1000' &&
    iso.readonlyRoot === true &&
    iso.capDropAll === true &&
    iso.noNewPrivileges === true &&
    iso.cpus <= 1 &&
    iso.memoryBytes <= 268435456 &&
    iso.pidsLimit <= 64;

  const isolationEnforced = isIsolated(buggy.execution.isolation) && isIsolated(fixed.execution.isolation);
  if (!isolationEnforced) errors.push('Resource limits and isolation guarantees must be enforced for both');

  const cleanupEnforced = buggy.supervisorResult.cleaned && fixed.supervisorResult.cleaned;
  if (!cleanupEnforced) errors.push('Cleanup must be verified for both executions');

  // 7. Provenance & Attribution
  const provenanceAttributable =
    buggy.execution.baseCommit === QS33_BASE_COMMIT &&
    fixed.execution.baseCommit === QS33_BASE_COMMIT &&
    buggy.execution.sourceHashes['lib/utils.js'] !== fixed.execution.sourceHashes['lib/utils.js'] &&
    buggy.execution.sourceHashes['test/parse.js'] === QS33_TEST_FILE_HASH &&
    fixed.execution.sourceHashes['test/parse.js'] === QS33_TEST_FILE_HASH &&
    buggy.execution.patchHash === '0000000000000000000000000000000000000000000000000000000000000000' &&
    (fixed.execution.patchHash === '6a97ad1d71d8a9069f5d6002cab3130752519ccb000000000000000000000001' ||
     fixed.execution.patchHash === REFERENCE_PATCH_HASH);
  if (!provenanceAttributable) errors.push('Source identity and provenance must be attributable to the correct roles');

  const passed = errors.length === 0;

  return {
    passed,
    checks: {
      sequentialRuns,
      buggyStatusCompleted,
      buggyExitCode1,
      buggyTestCount56,
      buggyPassCount55,
      buggyFailCount1,
      buggyOnlyTest40Failed,
      buggyFailureTypeMatch,
      buggyFailureFrameMatch,
      buggyProbeExitCode1,
      buggyProbeErrorMatch,
      fixedStatusCompleted,
      fixedExitCode0,
      fixedTestCount56,
      fixedPassCount56,
      fixedFailCount0,
      fixedProbeExitCode0,
      fixedProbeOutputMatch,
      fixedIdentitiesMatchBuggy,
      offlineEnforced,
      isolationEnforced,
      cleanupEnforced,
      provenanceAttributable,
    },
    errors,
  };
}

export interface C3VerificationReport {
  passed: boolean;
  checks: {
    sequentialRuns: boolean;
    referenceStatusCompleted: boolean;
    referenceExitCode0: boolean;
    referenceTestCount56: boolean;
    referencePassCount56: boolean;
    referenceProbeExitCode0: boolean;
    referenceProbePassed: boolean;
    referenceProbeOutputMatch: boolean;
    referencePatchHashMatch: boolean;
    alternateStatusCompleted: boolean;
    alternateExitCode0: boolean;
    alternateTestCount56: boolean;
    alternatePassCount56: boolean;
    alternateProbeExitCode0: boolean;
    alternateProbePassed: boolean;
    alternateProbeOutputMatch: boolean;
    alternatePatchHashMatch: boolean;
    decoyStatusCompleted: boolean;
    decoyExitCode1: boolean;
    decoyTestCount56: boolean;
    decoyPassCount55: boolean;
    decoyFailCount1: boolean;
    decoyTest40Failed: boolean;
    decoyProbeExitCode1: boolean;
    decoyProbeFailed: boolean;
    decoyProbeOutputMatch: boolean;
    decoyProbeErrorMatch: boolean;
    decoyPatchHashMatch: boolean;
    offlineEnforced: boolean;
    isolationEnforced: boolean;
    cleanupEnforced: boolean;
    provenanceAttributable: boolean;
  };
  errors: string[];
}

/**
 * Validates that candidate executions (reference, alternate, decoy) satisfy Stage C3 requirements.
 */
export function verifyQs33C3Expectations(
  reference: ExternalRunResult,
  alternate: ExternalRunResult,
  decoy: ExternalRunResult,
): C3VerificationReport {
  const errors: string[] = [];

  const runIds = [
    reference.execution.runId,
    alternate.execution.runId,
    decoy.execution.runId,
  ];
  const sequentialRuns =
    new Set(runIds).size === 3 &&
    reference.execution.freshWorkspace &&
    alternate.execution.freshWorkspace &&
    decoy.execution.freshWorkspace;
  if (!sequentialRuns) {
    errors.push('Each candidate execution must possess a fresh workspace and unique runId');
  }

  // 1. Reference Fix
  const referenceStatusCompleted = reference.supervisorResult.executionStatus === 'COMPLETED';
  if (!referenceStatusCompleted) errors.push('Reference execution status must be COMPLETED');

  const referenceExitCode0 = reference.execution.exitCode === 0;
  if (!referenceExitCode0) errors.push(`Reference execution exit code must be 0, got ${reference.execution.exitCode}`);

  const refTests = reference.normalizedReport.parsedReport.tests;
  const referenceTestCount56 = refTests.length === 56;
  if (!referenceTestCount56) errors.push(`Reference tests count must be 56, observed ${refTests.length}`);

  const refPasses = refTests.filter((t) => t.status === 'passed' && t.failure === null);
  const referencePassCount56 = refPasses.length === 56;
  if (!referencePassCount56) errors.push(`Reference passed tests must be 56, observed ${refPasses.length}`);

  let referenceProbeExit = -1;
  if (reference.supervisorResult.artifacts['probe.json']) {
    try {
      const probeJson = JSON.parse(reference.supervisorResult.artifacts['probe.json'].toString('utf8'));
      referenceProbeExit = probeJson.exitCode;
    } catch {}
  }
  const referenceProbeExitCode0 = referenceProbeExit === 0;
  if (!referenceProbeExitCode0) errors.push(`Reference probe exit code must be 0, observed ${referenceProbeExit}`);

  const referenceProbePassed = reference.probeReport.passed === true && reference.probeReport.error === null;
  if (!referenceProbePassed) errors.push('Reference probe must pass without error');

  const referenceProbeOutputMatch = reference.probeReport.serializedOutput === '{"a":{"b":"c"}}';
  if (!referenceProbeOutputMatch) errors.push(`Reference probe serialized output must be {"a":{"b":"c"}}, got ${reference.probeReport.serializedOutput}`);

  const referencePatchHashMatch = reference.execution.patchHash === REFERENCE_PATCH_HASH;
  if (!referencePatchHashMatch) errors.push(`Reference patch hash mismatch: ${reference.execution.patchHash}`);

  // 2. Alternate Fix
  const alternateStatusCompleted = alternate.supervisorResult.executionStatus === 'COMPLETED';
  if (!alternateStatusCompleted) errors.push('Alternate execution status must be COMPLETED');

  const alternateExitCode0 = alternate.execution.exitCode === 0;
  if (!alternateExitCode0) errors.push(`Alternate execution exit code must be 0, got ${alternate.execution.exitCode}`);

  const altTests = alternate.normalizedReport.parsedReport.tests;
  const alternateTestCount56 = altTests.length === 56;
  if (!alternateTestCount56) errors.push(`Alternate tests count must be 56, observed ${altTests.length}`);

  const altPasses = altTests.filter((t) => t.status === 'passed' && t.failure === null);
  const alternatePassCount56 = altPasses.length === 56;
  if (!alternatePassCount56) errors.push(`Alternate passed tests must be 56, observed ${altPasses.length}`);

  let alternateProbeExit = -1;
  if (alternate.supervisorResult.artifacts['probe.json']) {
    try {
      const probeJson = JSON.parse(alternate.supervisorResult.artifacts['probe.json'].toString('utf8'));
      alternateProbeExit = probeJson.exitCode;
    } catch {}
  }
  const alternateProbeExitCode0 = alternateProbeExit === 0;
  if (!alternateProbeExitCode0) errors.push(`Alternate probe exit code must be 0, observed ${alternateProbeExit}`);

  const alternateProbePassed = alternate.probeReport.passed === true && alternate.probeReport.error === null;
  if (!alternateProbePassed) errors.push('Alternate probe must pass without error');

  const alternateProbeOutputMatch = alternate.probeReport.serializedOutput === '{"a":{"b":"c"}}';
  if (!alternateProbeOutputMatch) errors.push(`Alternate probe serialized output must be {"a":{"b":"c"}}, got ${alternate.probeReport.serializedOutput}`);

  const alternatePatchHashMatch = alternate.execution.patchHash === ALTERNATE_PATCH_HASH;
  if (!alternatePatchHashMatch) errors.push(`Alternate patch hash mismatch: ${alternate.execution.patchHash}`);

  // 3. Decoy
  const decoyStatusCompleted = decoy.supervisorResult.executionStatus === 'COMPLETED';
  if (!decoyStatusCompleted) errors.push('Decoy execution status must be COMPLETED');

  const decoyExitCode1 = decoy.execution.exitCode === 1;
  if (!decoyExitCode1) errors.push(`Decoy execution exit code must be 1, got ${decoy.execution.exitCode}`);

  const decTests = decoy.normalizedReport.parsedReport.tests;
  const decoyTestCount56 = decTests.length === 56;
  if (!decoyTestCount56) errors.push(`Decoy tests count must be 56, observed ${decTests.length}`);

  const decPasses = decTests.filter((t) => t.status === 'passed');
  const decoyPassCount55 = decPasses.length === 55;
  if (!decoyPassCount55) errors.push(`Decoy passed tests must be 55, observed ${decPasses.length}`);

  const decFails = decTests.filter((t) => t.status === 'failed');
  const decoyFailCount1 = decFails.length === 1;
  if (!decoyFailCount1) errors.push(`Decoy failed tests must be 1, observed ${decFails.length}`);

  const decTest40 = decTests.find((t) => t.name === 'parse parses plain objects correctly');
  const decoyTest40Failed = decFails.length === 1 && decTest40?.status === 'failed';
  if (!decoyTest40Failed) errors.push('Only test 40 (parse parses plain objects correctly) must fail in decoy');

  let decoyProbeExit = -1;
  if (decoy.supervisorResult.artifacts['probe.json']) {
    try {
      const pJson = JSON.parse(decoy.supervisorResult.artifacts['probe.json'].toString('utf8'));
      decoyProbeExit = pJson.exitCode;
    } catch {}
  }
  const decoyProbeExitCode1 = decoyProbeExit === 1;
  if (!decoyProbeExitCode1) errors.push(`Decoy probe exit code must be 1, observed ${decoyProbeExit}`);

  const decoyProbeFailed = decoy.probeReport.passed === false;
  if (!decoyProbeFailed) errors.push('Decoy probe must fail');

  const decoyProbeOutputMatch = decoy.probeReport.serializedOutput === '{"a":{}}';
  if (!decoyProbeOutputMatch) errors.push(`Decoy probe output must drop null-prototype properties and produce {"a":{}}, got ${decoy.probeReport.serializedOutput}`);

  const decoyProbeErrorMatch = decoy.probeReport.error?.type === 'AssertionError';
  if (!decoyProbeErrorMatch) errors.push(`Decoy probe error must be AssertionError, got ${decoy.probeReport.error?.type}`);

  const decoyPatchHashMatch = decoy.execution.patchHash === DECOY_PATCH_HASH;
  if (!decoyPatchHashMatch) errors.push(`Decoy patch hash mismatch: ${decoy.execution.patchHash}`);

  // 4. Security & Isolation
  const allExecs = [reference.execution, alternate.execution, decoy.execution];
  const offlineEnforced = allExecs.every((e) => e.isolation.networkMode === 'none');
  if (!offlineEnforced) errors.push('Offline isolation (--network none) must be enforced for all candidates');

  const isIsolated = (iso: ExternalExecution['isolation']) =>
    iso.user === '1000:1000' &&
    iso.readonlyRoot === true &&
    iso.capDropAll === true &&
    iso.noNewPrivileges === true &&
    iso.cpus <= 1 &&
    iso.memoryBytes <= 268435456 &&
    iso.pidsLimit <= 64;

  const isolationEnforced = allExecs.every((e) => isIsolated(e.isolation));
  if (!isolationEnforced) errors.push('Resource limits and isolation guarantees must be enforced for all candidates');

  const cleanupEnforced =
    reference.supervisorResult.cleaned &&
    alternate.supervisorResult.cleaned &&
    decoy.supervisorResult.cleaned;
  if (!cleanupEnforced) errors.push('Cleanup must be verified for all candidate executions');

  // 5. Provenance & Attribution
  const provenanceAttributable =
    allExecs.every((e) => e.baseCommit === QS33_BASE_COMMIT) &&
    allExecs.every((e) => e.sourceHashes['test/parse.js'] === QS33_TEST_FILE_HASH) &&
    reference.execution.patchHash === REFERENCE_PATCH_HASH &&
    alternate.execution.patchHash === ALTERNATE_PATCH_HASH &&
    decoy.execution.patchHash === DECOY_PATCH_HASH &&
    reference.execution.sourceHashes['lib/utils.js'] !== alternate.execution.sourceHashes['lib/utils.js'] &&
    reference.execution.sourceHashes['lib/utils.js'] !== decoy.execution.sourceHashes['lib/utils.js'];
  if (!provenanceAttributable) errors.push('Provenance must be strictly attributable across candidate executions');

  const passed = errors.length === 0;

  return {
    passed,
    checks: {
      sequentialRuns,
      referenceStatusCompleted,
      referenceExitCode0,
      referenceTestCount56,
      referencePassCount56,
      referenceProbeExitCode0,
      referenceProbePassed,
      referenceProbeOutputMatch,
      referencePatchHashMatch,
      alternateStatusCompleted,
      alternateExitCode0,
      alternateTestCount56,
      alternatePassCount56,
      alternateProbeExitCode0,
      alternateProbePassed,
      alternateProbeOutputMatch,
      alternatePatchHashMatch,
      decoyStatusCompleted,
      decoyExitCode1,
      decoyTestCount56,
      decoyPassCount55,
      decoyFailCount1,
      decoyTest40Failed,
      decoyProbeExitCode1,
      decoyProbeFailed,
      decoyProbeOutputMatch,
      decoyProbeErrorMatch,
      decoyPatchHashMatch,
      offlineEnforced,
      isolationEnforced,
      cleanupEnforced,
      provenanceAttributable,
    },
    errors,
  };
}

export interface C4MatrixResults {
  buggy: ExternalRunResult[];
  reference: ExternalRunResult[];
  alternate: ExternalRunResult[];
  decoy: ExternalRunResult;
}

export interface C4VerificationReport {
  passed: boolean;
  checks: {
    matrixExecutionCount17: boolean;
    buggyExecutionCount10: boolean;
    referenceExecutionCount3: boolean;
    alternateExecutionCount3: boolean;
    uniqueRunIds: boolean;
    freshWorkspaces: boolean;
    buggyAllCompletedExit1: boolean;
    buggyAllTestCount56: boolean;
    buggyAllPassCount55: boolean;
    buggyAllFailCount1: boolean;
    buggyAllOnlyTest40Failed: boolean;
    buggyAllFailureTypeMatch: boolean;
    buggyAllFailureFrameMatch: boolean;
    buggyAllProbeExitCode1: boolean;
    buggyAllProbeErrorMatch: boolean;
    referenceAllCompletedExit0: boolean;
    referenceAllTestCount56: boolean;
    referenceAllPassCount56: boolean;
    referenceAllFailCount0: boolean;
    referenceAllProbeExitCode0: boolean;
    referenceAllProbePassed: boolean;
    referenceAllProbeOutputMatch: boolean;
    referenceAllPatchHashMatch: boolean;
    alternateAllCompletedExit0: boolean;
    alternateAllTestCount56: boolean;
    alternateAllPassCount56: boolean;
    alternateAllFailCount0: boolean;
    alternateAllProbeExitCode0: boolean;
    alternateAllProbePassed: boolean;
    alternateAllProbeOutputMatch: boolean;
    alternateAllPatchHashMatch: boolean;
    decoyCompletedExit1: boolean;
    decoyTestCount56: boolean;
    decoyPassCount55: boolean;
    decoyFailCount1: boolean;
    decoyTest40Failed: boolean;
    decoyProbeExitCode1: boolean;
    decoyProbeFailed: boolean;
    decoyProbeOutputMatch: boolean;
    decoyProbeErrorMatch: boolean;
    decoyPatchHashMatch: boolean;
    allTestIdentitiesPreserved: boolean;
    offlineEnforcedAll: boolean;
    isolationEnforcedAll: boolean;
    cleanupEnforcedAll: boolean;
    provenanceAttributableAll: boolean;
  };
  errors: string[];
}

/**
 * Validates that the full 17-run matrix (10 buggy, 3 reference, 3 alternate, 1 decoy)
 * satisfies all Gate C4 reproduction, determinism, isolation, and counterfactual requirements.
 */
export function verifyQs33C4Expectations(
  matrix: C4MatrixResults,
): C4VerificationReport {
  const errors: string[] = [];

  const allExecResults = [
    ...matrix.buggy,
    ...matrix.reference,
    ...matrix.alternate,
    matrix.decoy,
  ];

  // 1. Matrix counts
  const matrixExecutionCount17 = allExecResults.length === 17;
  if (!matrixExecutionCount17) {
    errors.push(`Total executions must be exactly 17, got ${allExecResults.length}`);
  }

  const buggyExecutionCount10 = matrix.buggy.length === 10;
  if (!buggyExecutionCount10) {
    errors.push(`Buggy executions count must be 10, got ${matrix.buggy.length}`);
  }

  const referenceExecutionCount3 = matrix.reference.length === 3;
  if (!referenceExecutionCount3) {
    errors.push(`Reference executions count must be 3, got ${matrix.reference.length}`);
  }

  const alternateExecutionCount3 = matrix.alternate.length === 3;
  if (!alternateExecutionCount3) {
    errors.push(`Alternate executions count must be 3, got ${matrix.alternate.length}`);
  }

  // 2. Identity and workspace freshness
  const runIds = allExecResults.map((r) => r.execution.runId);
  const uniqueRunIds = new Set(runIds).size === 17;
  if (!uniqueRunIds) {
    errors.push(`All 17 run IDs must be unique, observed ${new Set(runIds).size} unique IDs`);
  }

  const freshWorkspaces = allExecResults.every((r) => r.execution.freshWorkspace === true);
  if (!freshWorkspaces) {
    errors.push('All 17 executions must be executed with fresh workspaces');
  }

  // Helper for probe exit code
  const getProbeExit = (res: ExternalRunResult): number => {
    if (res.supervisorResult.artifacts['probe.json']) {
      try {
        const p = JSON.parse(res.supervisorResult.artifacts['probe.json'].toString('utf8'));
        return p.exitCode;
      } catch {}
    }
    return -1;
  };

  // 3. Buggy executions (10/10)
  const buggyAllCompletedExit1 = matrix.buggy.every(
    (b) => b.supervisorResult.executionStatus === 'COMPLETED' && b.execution.exitCode === 1,
  );
  if (!buggyAllCompletedExit1) {
    errors.push('All 10 buggy executions must have status COMPLETED and exit code 1');
  }

  const buggyAllTestCount56 = matrix.buggy.every(
    (b) => b.normalizedReport.parsedReport.tests.length === 56,
  );
  if (!buggyAllTestCount56) {
    errors.push('All 10 buggy executions must execute exactly 56 test identities');
  }

  const buggyAllPassCount55 = matrix.buggy.every(
    (b) => b.normalizedReport.parsedReport.tests.filter((t) => t.status === 'passed').length === 55,
  );
  if (!buggyAllPassCount55) {
    errors.push('All 10 buggy executions must have exactly 55 passing tests');
  }

  const buggyAllFailCount1 = matrix.buggy.every(
    (b) => b.normalizedReport.parsedReport.tests.filter((t) => t.status === 'failed').length === 1,
  );
  if (!buggyAllFailCount1) {
    errors.push('All 10 buggy executions must have exactly 1 failing test');
  }

  const buggyAllOnlyTest40Failed = matrix.buggy.every((b) => {
    const t40 = b.normalizedReport.parsedReport.tests.find(
      (t) => t.name === 'parse parses plain objects correctly',
    );
    const fails = b.normalizedReport.parsedReport.tests.filter((t) => t.status === 'failed');
    return fails.length === 1 && t40?.status === 'failed';
  });
  if (!buggyAllOnlyTest40Failed) {
    errors.push('All 10 buggy executions must fail only test 40 (parse parses plain objects correctly)');
  }

  const buggyAllFailureTypeMatch = matrix.buggy.every((b) => {
    const t40 = b.normalizedReport.parsedReport.tests.find(
      (t) => t.name === 'parse parses plain objects correctly',
    );
    return t40?.failure?.type === 'TypeError';
  });
  if (!buggyAllFailureTypeMatch) {
    errors.push('All 10 buggy executions must fail with TypeError on test 40');
  }

  const buggyAllFailureFrameMatch = matrix.buggy.every((b) => {
    const t40 = b.normalizedReport.parsedReport.tests.find(
      (t) => t.name === 'parse parses plain objects correctly',
    );
    return t40?.failure?.topApplicationFrame === 'at exports.clone (/case/lib/utils.js:47:20)';
  });
  if (!buggyAllFailureFrameMatch) {
    errors.push('All 10 buggy executions must exhibit top frame at exports.clone (/case/lib/utils.js:47:20)');
  }

  const buggyAllProbeExitCode1 = matrix.buggy.every((b) => getProbeExit(b) === 1);
  if (!buggyAllProbeExitCode1) {
    errors.push('All 10 buggy probe runs must exit with code 1');
  }

  const buggyAllProbeErrorMatch = matrix.buggy.every(
    (b) =>
      b.probeReport.passed === false &&
      b.probeReport.error?.type === 'TypeError' &&
      b.probeReport.error?.message === 'source.hasOwnProperty is not a function' &&
      (b.probeReport.error?.topApplicationFrame.includes('/case/lib/utils.js:47:20') ?? false),
  );
  if (!buggyAllProbeErrorMatch) {
    errors.push('All 10 buggy probe runs must reproduce native TypeError at /case/lib/utils.js:47:20');
  }

  // 4. Reference Fix executions (3/3)
  const referenceAllCompletedExit0 = matrix.reference.every(
    (r) => r.supervisorResult.executionStatus === 'COMPLETED' && r.execution.exitCode === 0,
  );
  if (!referenceAllCompletedExit0) {
    errors.push('All 3 reference executions must have status COMPLETED and exit code 0');
  }

  const referenceAllTestCount56 = matrix.reference.every(
    (r) => r.normalizedReport.parsedReport.tests.length === 56,
  );
  if (!referenceAllTestCount56) {
    errors.push('All 3 reference executions must execute exactly 56 test identities');
  }

  const referenceAllPassCount56 = matrix.reference.every(
    (r) =>
      r.normalizedReport.parsedReport.tests.filter((t) => t.status === 'passed' && t.failure === null)
        .length === 56,
  );
  if (!referenceAllPassCount56) {
    errors.push('All 3 reference executions must pass exactly 56/56 tests');
  }

  const referenceAllFailCount0 = matrix.reference.every(
    (r) =>
      r.normalizedReport.parsedReport.tests.filter(
        (t) => t.status === 'failed' || t.status === 'skipped',
      ).length === 0,
  );
  if (!referenceAllFailCount0) {
    errors.push('All 3 reference executions must have 0 failures and 0 skips');
  }

  const referenceAllProbeExitCode0 = matrix.reference.every((r) => getProbeExit(r) === 0);
  if (!referenceAllProbeExitCode0) {
    errors.push('All 3 reference probe runs must exit with code 0');
  }

  const referenceAllProbePassed = matrix.reference.every(
    (r) => r.probeReport.passed === true && r.probeReport.error === null,
  );
  if (!referenceAllProbePassed) {
    errors.push('All 3 reference probe runs must pass with no error');
  }

  const referenceAllProbeOutputMatch = matrix.reference.every(
    (r) => r.probeReport.serializedOutput === '{"a":{"b":"c"}}',
  );
  if (!referenceAllProbeOutputMatch) {
    errors.push('All 3 reference probe runs must serialize {"a":{"b":"c"}}');
  }

  const referenceAllPatchHashMatch = matrix.reference.every(
    (r) => r.execution.patchHash === REFERENCE_PATCH_HASH,
  );
  if (!referenceAllPatchHashMatch) {
    errors.push('All 3 reference executions must match REFERENCE_PATCH_HASH');
  }

  // 5. Alternate Fix executions (3/3)
  const alternateAllCompletedExit0 = matrix.alternate.every(
    (a) => a.supervisorResult.executionStatus === 'COMPLETED' && a.execution.exitCode === 0,
  );
  if (!alternateAllCompletedExit0) {
    errors.push('All 3 alternate executions must have status COMPLETED and exit code 0');
  }

  const alternateAllTestCount56 = matrix.alternate.every(
    (a) => a.normalizedReport.parsedReport.tests.length === 56,
  );
  if (!alternateAllTestCount56) {
    errors.push('All 3 alternate executions must execute exactly 56 test identities');
  }

  const alternateAllPassCount56 = matrix.alternate.every(
    (a) =>
      a.normalizedReport.parsedReport.tests.filter((t) => t.status === 'passed' && t.failure === null)
        .length === 56,
  );
  if (!alternateAllPassCount56) {
    errors.push('All 3 alternate executions must pass exactly 56/56 tests');
  }

  const alternateAllFailCount0 = matrix.alternate.every(
    (a) =>
      a.normalizedReport.parsedReport.tests.filter(
        (t) => t.status === 'failed' || t.status === 'skipped',
      ).length === 0,
  );
  if (!alternateAllFailCount0) {
    errors.push('All 3 alternate executions must have 0 failures and 0 skips');
  }

  const alternateAllProbeExitCode0 = matrix.alternate.every((a) => getProbeExit(a) === 0);
  if (!alternateAllProbeExitCode0) {
    errors.push('All 3 alternate probe runs must exit with code 0');
  }

  const alternateAllProbePassed = matrix.alternate.every(
    (a) => a.probeReport.passed === true && a.probeReport.error === null,
  );
  if (!alternateAllProbePassed) {
    errors.push('All 3 alternate probe runs must pass with no error');
  }

  const alternateAllProbeOutputMatch = matrix.alternate.every(
    (a) => a.probeReport.serializedOutput === '{"a":{"b":"c"}}',
  );
  if (!alternateAllProbeOutputMatch) {
    errors.push('All 3 alternate probe runs must serialize {"a":{"b":"c"}}');
  }

  const alternateAllPatchHashMatch = matrix.alternate.every(
    (a) => a.execution.patchHash === ALTERNATE_PATCH_HASH,
  );
  if (!alternateAllPatchHashMatch) {
    errors.push('All 3 alternate executions must match ALTERNATE_PATCH_HASH');
  }

  // 6. Decoy Fix execution (1/1)
  const decoyCompletedExit1 =
    matrix.decoy.supervisorResult.executionStatus === 'COMPLETED' && matrix.decoy.execution.exitCode === 1;
  if (!decoyCompletedExit1) {
    errors.push('Decoy execution must have status COMPLETED and exit code 1');
  }

  const decTests = matrix.decoy.normalizedReport.parsedReport.tests;
  const decoyTestCount56 = decTests.length === 56;
  if (!decoyTestCount56) {
    errors.push(`Decoy execution must have 56 tests, got ${decTests.length}`);
  }

  const decPasses = decTests.filter((t) => t.status === 'passed');
  const decoyPassCount55 = decPasses.length === 55;
  if (!decoyPassCount55) {
    errors.push(`Decoy execution must have 55 passes, got ${decPasses.length}`);
  }

  const decFails = decTests.filter((t) => t.status === 'failed');
  const decoyFailCount1 = decFails.length === 1;
  if (!decoyFailCount1) {
    errors.push(`Decoy execution must have 1 failure, got ${decFails.length}`);
  }

  const decTest40 = decTests.find((t) => t.name === 'parse parses plain objects correctly');
  const decoyTest40Failed = decFails.length === 1 && decTest40?.status === 'failed';
  if (!decoyTest40Failed) {
    errors.push('Only test 40 must fail in decoy execution');
  }

  const decoyProbeExitCode1 = getProbeExit(matrix.decoy) === 1;
  if (!decoyProbeExitCode1) {
    errors.push(`Decoy probe must exit with code 1, got ${getProbeExit(matrix.decoy)}`);
  }

  const decoyProbeFailed = matrix.decoy.probeReport.passed === false;
  if (!decoyProbeFailed) {
    errors.push('Decoy probe must fail');
  }

  const decoyProbeOutputMatch = matrix.decoy.probeReport.serializedOutput === '{"a":{}}';
  if (!decoyProbeOutputMatch) {
    errors.push(`Decoy probe must serialize {"a":{}}, got ${matrix.decoy.probeReport.serializedOutput}`);
  }

  const decoyProbeErrorMatch = matrix.decoy.probeReport.error?.type === 'AssertionError';
  if (!decoyProbeErrorMatch) {
    errors.push(`Decoy probe error type must be AssertionError, got ${matrix.decoy.probeReport.error?.type}`);
  }

  const decoyPatchHashMatch = matrix.decoy.execution.patchHash === DECOY_PATCH_HASH;
  if (!decoyPatchHashMatch) {
    errors.push(`Decoy patch hash mismatch: ${matrix.decoy.execution.patchHash}`);
  }

  // 7. Official Test Identities Preserved Across All 17 Runs
  const baselineNames = matrix.buggy[0]?.normalizedReport.parsedReport.tests.map((t) => t.name) ?? [];
  const expectedAllIdentities = [...QS33_FAIL_TO_PASS, ...QS33_PASS_TO_PASS];
  const allTestIdentitiesPreserved =
    baselineNames.length === 56 &&
    expectedAllIdentities.every((expectedName) => baselineNames.includes(expectedName)) &&
    allExecResults.every((r) => {
      const names = r.normalizedReport.parsedReport.tests.map((t) => t.name);
      return names.length === 56 && names.every((n, idx) => n === baselineNames[idx]);
    });
  if (!allTestIdentitiesPreserved) {
    errors.push('Official 56 test identities and ordering must match across all 17 executions');
  }

  // 8. Isolation & Security Across All 17 Runs
  const offlineEnforcedAll = allExecResults.every((r) => r.execution.isolation.networkMode === 'none');
  if (!offlineEnforcedAll) {
    errors.push('Offline isolation (--network none) must be enforced for all 17 executions');
  }

  const isIsolated = (iso: ExternalExecution['isolation']) =>
    iso.user === '1000:1000' &&
    iso.readonlyRoot === true &&
    iso.capDropAll === true &&
    iso.noNewPrivileges === true &&
    iso.cpus <= 1 &&
    iso.memoryBytes <= 268435456 &&
    iso.pidsLimit <= 64;

  const isolationEnforcedAll = allExecResults.every((r) => isIsolated(r.execution.isolation));
  if (!isolationEnforcedAll) {
    errors.push('Resource limits and isolation guarantees must be enforced for all 17 executions');
  }

  const cleanupEnforcedAll = allExecResults.every((r) => r.supervisorResult.cleaned === true);
  if (!cleanupEnforcedAll) {
    errors.push('Guaranteed cleanup must be verified for all 17 executions');
  }

  // 9. Provenance & Attribution Across All 17 Runs
  const provenanceAttributableAll =
    allExecResults.every(
      (r) =>
        r.execution.baseCommit === QS33_BASE_COMMIT &&
        r.execution.sourceHashes['test/parse.js'] === QS33_TEST_FILE_HASH &&
        r.execution.candidateHash === sha256(QS33_CANDIDATE_TEST),
    ) &&
    matrix.buggy.every(
      (b) =>
        b.execution.patchHash ===
        '0000000000000000000000000000000000000000000000000000000000000000',
    ) &&
    matrix.reference.every((r) => r.execution.patchHash === REFERENCE_PATCH_HASH) &&
    matrix.alternate.every((a) => a.execution.patchHash === ALTERNATE_PATCH_HASH) &&
    matrix.decoy.execution.patchHash === DECOY_PATCH_HASH;
  if (!provenanceAttributableAll) {
    errors.push('Source provenance and patch hash binding must be attributable across all roles');
  }

  const passed = errors.length === 0;

  return {
    passed,
    checks: {
      matrixExecutionCount17,
      buggyExecutionCount10,
      referenceExecutionCount3,
      alternateExecutionCount3,
      uniqueRunIds,
      freshWorkspaces,
      buggyAllCompletedExit1,
      buggyAllTestCount56,
      buggyAllPassCount55,
      buggyAllFailCount1,
      buggyAllOnlyTest40Failed,
      buggyAllFailureTypeMatch,
      buggyAllFailureFrameMatch,
      buggyAllProbeExitCode1,
      buggyAllProbeErrorMatch,
      referenceAllCompletedExit0,
      referenceAllTestCount56,
      referenceAllPassCount56,
      referenceAllFailCount0,
      referenceAllProbeExitCode0,
      referenceAllProbePassed,
      referenceAllProbeOutputMatch,
      referenceAllPatchHashMatch,
      alternateAllCompletedExit0,
      alternateAllTestCount56,
      alternateAllPassCount56,
      alternateAllFailCount0,
      alternateAllProbeExitCode0,
      alternateAllProbePassed,
      alternateAllProbeOutputMatch,
      alternateAllPatchHashMatch,
      decoyCompletedExit1,
      decoyTestCount56,
      decoyPassCount55,
      decoyFailCount1,
      decoyTest40Failed,
      decoyProbeExitCode1,
      decoyProbeFailed,
      decoyProbeOutputMatch,
      decoyProbeErrorMatch,
      decoyPatchHashMatch,
      allTestIdentitiesPreserved,
      offlineEnforcedAll,
      isolationEnforcedAll,
      cleanupEnforcedAll,
      provenanceAttributableAll,
    },
    errors,
  };
}

