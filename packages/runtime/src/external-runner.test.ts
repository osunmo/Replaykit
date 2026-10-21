import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ExternalExecutionSchema,
  ExternalManifestSchema,
  OfficialReportSchema,
  type ExternalExecution,
} from '../../contracts/src/external.js';
import { evaluateExternalEvidence } from '../../judge/src/external.js';
import {
  createQs33Manifest,
  parseQs33ProbeReport,
  parseQs33TapReport,
  QS33_BASE_COMMIT,
  QS33_CANDIDATE_TEST,
  QS33_EXPECTED_FAILURE,
  QS33_FAIL_TO_PASS,
  QS33_FIXED_COMMIT,
  QS33_IMAGE,
  QS33_PASS_TO_PASS,
  QS33_SOURCE_FILES,
  QS33_TEST_FILE,
  QS33_TEST_FILE_HASH,
  QS33_TEST_PATCH_HASH,
  sha256,
  verifyQs33C2Expectations,
  verifyQs33C3Expectations,
  verifyQs33C4Expectations,
} from './adapters/qs33-adapter.js';
import {
  REFERENCE_PATCH,
  ALTERNATE_PATCH,
  DECOY_PATCH,
  REFERENCE_PATCH_HASH,
  ALTERNATE_PATCH_HASH,
  DECOY_PATCH_HASH,
  CANDIDATE_PATCH_HASHES,
  CANDIDATE_PATCHES,
} from './candidate-patches.js';
import {
  ALLOWED_PATCH_PATHS,
  applyCandidatePatch,
  parseUnifiedDiff,
  validatePatchPath,
} from './patch-applier.js';
import { runExternalExecution, type ExternalRunResult } from './external-runner.js';
import { runExternalContainer } from './external-supervisor.js';

describe('External Supervisor & qs33 Adapter — Stage C1 & C2 Verification', () => {
  describe('Input Validation & Security Boundaries', () => {
    it('rejects malformed runId', async () => {
      await expect(
        runExternalContainer({
          runId: '../unsafe-escape',
          role: 'buggy',
          image: QS33_IMAGE,
          stagedDir: process.cwd(),
        }),
      ).rejects.toThrow('INVALID_RUN_ID');

      await expect(
        runExternalContainer({
          runId: '',
          role: 'buggy',
          image: QS33_IMAGE,
          stagedDir: process.cwd(),
        }),
      ).rejects.toThrow('INVALID_RUN_ID');
    });

    it('rejects malformed role', async () => {
      await expect(
        runExternalContainer({
          runId: 'valid-run-id',
          role: '../../etc/passwd',
          image: QS33_IMAGE,
          stagedDir: process.cwd(),
        }),
      ).rejects.toThrow('INVALID_ROLE');
    });

    it('rejects unauthorized host bind mounts', async () => {
      await expect(
        runExternalContainer({
          runId: 'valid-run-id',
          role: 'buggy',
          image: QS33_IMAGE,
          stagedDir: process.cwd(),
          hostBinds: ['/host/path:/container/path:rw'],
        }),
      ).rejects.toThrow('HOST_BINDS_FORBIDDEN');
    });

    it('rejects excessive resource limits exceeding security policy', async () => {
      await expect(
        runExternalContainer({
          runId: 'valid-run-id',
          role: 'buggy',
          image: QS33_IMAGE,
          stagedDir: process.cwd(),
          cpus: 2,
        }),
      ).rejects.toThrow('CPU_LIMIT_EXCEEDED');

      await expect(
        runExternalContainer({
          runId: 'valid-run-id',
          role: 'buggy',
          image: QS33_IMAGE,
          stagedDir: process.cwd(),
          memoryBytes: 512 * 1024 * 1024,
        }),
      ).rejects.toThrow('MEMORY_LIMIT_EXCEEDED');

      await expect(
        runExternalContainer({
          runId: 'valid-run-id',
          role: 'buggy',
          image: QS33_IMAGE,
          stagedDir: process.cwd(),
          pidsLimit: 128,
        }),
      ).rejects.toThrow('PIDS_LIMIT_EXCEEDED');
    });
  });

  describe('Manifest & Adapter Contracts', () => {
    it('generates an ExternalManifest satisfying ExternalManifestSchema', () => {
      const manifest = createQs33Manifest();
      expect(ExternalManifestSchema.safeParse(manifest).success).toBe(true);

      expect(manifest.contract).toBe('external-official-suite-v1');
      expect(manifest.instanceId).toBe('qs__issue-33');
      expect(manifest.baseCommit).toBe('360e2b0b48548b9bfdb71f8c82a68c4f34ec0725');
      expect(manifest.testFile).toBe(QS33_TEST_FILE);
      expect(manifest.testFileHash).toBe(QS33_TEST_FILE_HASH);
      expect(manifest.testPatchHash).toBe(QS33_TEST_PATCH_HASH);
      expect(manifest.failToPass).toEqual(QS33_FAIL_TO_PASS);
      expect(manifest.passToPass.length).toBe(55);
      expect(manifest.sourceFiles).toEqual(QS33_SOURCE_FILES);
      expect(manifest.expectedFailure).toEqual(QS33_EXPECTED_FAILURE);
    });

    it('normalizes buggy TAP output to OfficialReportSchema with failure identity', () => {
      const sampleBuggyTap = `1..56
ok 1 parse parses a simple string
ok 39 parse does not crash when parsing circular references
not ok 40 parse parses plain objects correctly
  TypeError: source.hasOwnProperty is not a function
    at exports.clone (/case/lib/utils.js:47:20)
    at exports.clone (/case/lib/utils.js:48:31)
    at module.exports [as parse] (/case/lib/parse.js:141:89)
ok 41 stringify stringifies a querystring object
ok 56 stringify doesn't blow up when Buffer global is missing
# tests 56
# pass 55
# fail 1
# skipped 0
# todo 0`;

      const { reportJson, reportHash, parsedReport } = parseQs33TapReport(sampleBuggyTap, '');
      expect(OfficialReportSchema.safeParse(parsedReport).success).toBe(true);
      expect(reportHash).toBe(sha256(reportJson));

      const failedTest = parsedReport.tests.find((t) => t.name === 'parse parses plain objects correctly');
      expect(failedTest).toBeDefined();
      expect(failedTest?.status).toBe('failed');
      expect(failedTest?.failure).toEqual({
        type: 'TypeError',
        topApplicationFrame: 'at exports.clone (/case/lib/utils.js:47:20)',
      });

      const passedTest = parsedReport.tests.find((t) => t.name === 'parse parses a simple string');
      expect(passedTest).toBeDefined();
      expect(passedTest?.status).toBe('passed');
      expect(passedTest?.failure).toBeNull();
    });

    it('normalizes fixed TAP output with all passing tests and null failure identities', () => {
      const sampleFixedTap = `1..56
ok 1 parse parses a simple string
ok 40 parse parses plain objects correctly
ok 56 stringify doesn't blow up when Buffer global is missing
# tests 56
# pass 56
# fail 0
# skipped 0
# todo 0`;

      const { reportJson, reportHash, parsedReport } = parseQs33TapReport(sampleFixedTap, '');
      expect(OfficialReportSchema.safeParse(parsedReport).success).toBe(true);
      expect(reportHash).toBe(sha256(reportJson));

      expect(parsedReport.tests.every((t) => t.status === 'passed' && t.failure === null)).toBe(true);
    });
  });

  describe('Stage C1 — Live Container Execution Vertical Slice', () => {
    it(
      'executes a real Docker container of the pinned buggy revision and collects authentic evidence',
      async () => {
        const runId = `c1-slice-${Date.now()}`;
        const result = await runExternalExecution({
          runId,
          role: 'buggy',
          timeoutSeconds: 30,
        });

        // 1. Process and execution status
        expect(result.supervisorResult.executionStatus).toBe('COMPLETED');
        expect(result.execution.executionStatus).toBe('COMPLETED');
        expect(result.execution.exitCode).toBe(1);
        expect(result.supervisorResult.exitCode).toBe(1);

        // 2. Verified Docker isolation
        const iso = result.execution.isolation;
        expect(iso.networkMode).toBe('none');
        expect(iso.user).toBe('1000:1000');
        expect(iso.readonlyRoot).toBe(true);
        expect(iso.capDropAll).toBe(true);
        expect(iso.noNewPrivileges).toBe(true);
        expect(iso.cpus).toBeLessThanOrEqual(1);
        expect(iso.memoryBytes).toBeLessThanOrEqual(268435456);
        expect(iso.pidsLimit).toBeLessThanOrEqual(64);
        expect(iso.mounts).toEqual([{ type: 'tmpfs', destination: '/tmp' }]);

        // 3. Artifact recovery and cleanup
        expect(result.supervisorResult.cleaned).toBe(true);
        expect(result.execution.freshWorkspace).toBe(true);
        expect(result.execution.durationMs).toBeGreaterThan(0);
        expect(result.execution.durationMs).toBeLessThan(30000);

        // 4. Test results: exactly 56 tests, 55 pass, only test 40 fails
        const tests = result.normalizedReport.parsedReport.tests;
        expect(tests.length).toBe(56);

        const test40 = tests.find((t) => t.name === 'parse parses plain objects correctly');
        expect(test40).toBeDefined();
        expect(test40?.status).toBe('failed');
        expect(test40?.failure?.type).toBe('TypeError');
        expect(test40?.failure?.topApplicationFrame).toBe('at exports.clone (/case/lib/utils.js:47:20)');

        const passedTests = tests.filter((t) => t.name !== 'parse parses plain objects correctly');
        expect(passedTests.length).toBe(55);
        expect(passedTests.every((t) => t.status === 'passed' && t.failure === null)).toBe(true);

        // 5. Schema validation of ExternalExecution
        expect(ExternalExecutionSchema.safeParse(result.execution).success).toBe(true);

        // 6. Evaluator integration: ensure single execution does NOT claim VERIFIED
        const manifest = createQs33Manifest({
          patchHashes: {
            buggy: result.execution.patchHash,
            reference: '0000000000000000000000000000000000000000000000000000000000000002',
            alternate: '0000000000000000000000000000000000000000000000000000000000000003',
            decoy: '0000000000000000000000000000000000000000000000000000000000000004',
          },
        });

        // Construct partial matrix with only this 1 buggy execution
        const partialMatrix = {
          buggy: [result.execution],
          reference: [],
          alternate: [],
          decoy: result.execution,
        };

        const judgeVerdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, partialMatrix);
        // Must NOT be VERIFIED (requires 10 buggy, 3 reference, 3 alternate, 1 decoy)
        expect(judgeVerdict.status).not.toBe('VERIFIED');
        expect(judgeVerdict.checks.deterministicRuns).toBe(1);
        expect(judgeVerdict.checks.deterministicFailures).toBe(1);
        expect(judgeVerdict.checks.sameFailureIdentity).toBe(true);
        expect(judgeVerdict.checks.offlineExecution).toBe(true);
        expect(judgeVerdict.checks.isolatedExecution).toBe(true);
      },
      120000,
    );
  });

  describe('Stage C2 — Live Sequential Execution of Pinned Buggy & Fixed Revisions', () => {
    it(
      'executes authentic pinned buggy and fixed revisions sequentially and satisfies all C2 expectations',
      async () => {
        const testEvidenceDir = await mkdtemp(path.join(os.tmpdir(), 'rk-c2-test-evidence-'));

        try {
          const buggyRunId = `c2-test-buggy-${Date.now()}`;
          const buggyResult = await runExternalExecution({
            runId: buggyRunId,
            role: 'buggy',
            timeoutSeconds: 30,
            evidenceDir: path.join(testEvidenceDir, 'evidence-buggy'),
          });

          const fixedRunId = `c2-test-fixed-${Date.now()}`;
          const fixedResult = await runExternalExecution({
            runId: fixedRunId,
            role: 'reference',
            timeoutSeconds: 30,
            evidenceDir: path.join(testEvidenceDir, 'evidence-fixed'),
          });

          // 1. Comprehensive C2 Expectations Verification
          const verification = verifyQs33C2Expectations(buggyResult, fixedResult);
          expect(verification.passed).toBe(true);
          expect(verification.errors).toEqual([]);

          // 2. Specific checks for Buggy Run
          expect(buggyResult.execution.baseCommit).toBe(QS33_BASE_COMMIT);
          expect(buggyResult.execution.executionStatus).toBe('COMPLETED');
          expect(buggyResult.execution.exitCode).toBe(1);

          const buggyTests = buggyResult.normalizedReport.parsedReport.tests;
          expect(buggyTests.length).toBe(56);
          const test40 = buggyTests.find((t) => t.name === 'parse parses plain objects correctly');
          expect(test40?.status).toBe('failed');
          expect(test40?.failure?.type).toBe('TypeError');
          expect(test40?.failure?.topApplicationFrame).toBe(
            'at exports.clone (/case/lib/utils.js:47:20)',
          );

          const buggyPassed = buggyTests.filter((t) => t.status === 'passed');
          expect(buggyPassed.length).toBe(55);

          // Buggy probe
          expect(buggyResult.probeReport.passed).toBe(false);
          expect(buggyResult.probeReport.error?.type).toBe('TypeError');
          expect(buggyResult.probeReport.error?.message).toBe(
            'source.hasOwnProperty is not a function',
          );
          expect(buggyResult.probeReport.error?.topApplicationFrame).toContain(
            '/case/lib/utils.js:47:20',
          );

          // 3. Specific checks for Fixed Run
          expect(fixedResult.execution.baseCommit).toBe(QS33_BASE_COMMIT);
          expect(fixedResult.execution.executionStatus).toBe('COMPLETED');
          expect(fixedResult.execution.exitCode).toBe(0);

          const fixedTests = fixedResult.normalizedReport.parsedReport.tests;
          expect(fixedTests.length).toBe(56);
          expect(fixedTests.every((t) => t.status === 'passed' && t.failure === null)).toBe(true);
          expect(fixedTests.map((t) => t.name)).toEqual(buggyTests.map((t) => t.name));

          // Fixed probe
          expect(fixedResult.probeReport.passed).toBe(true);
          expect(fixedResult.probeReport.error).toBeNull();
          expect(fixedResult.probeReport.serializedOutput).toBe('{"a":{"b":"c"}}');

          // 4. Docker isolation and cleanup on both
          for (const res of [buggyResult, fixedResult]) {
            expect(res.supervisorResult.cleaned).toBe(true);
            expect(res.execution.freshWorkspace).toBe(true);
            const iso = res.execution.isolation;
            expect(iso.networkMode).toBe('none');
            expect(iso.user).toBe('1000:1000');
            expect(iso.readonlyRoot).toBe(true);
            expect(iso.capDropAll).toBe(true);
            expect(iso.noNewPrivileges).toBe(true);
            expect(iso.cpus).toBeLessThanOrEqual(1);
            expect(iso.memoryBytes).toBeLessThanOrEqual(268435456);
            expect(iso.pidsLimit).toBeLessThanOrEqual(64);
            expect(iso.mounts).toEqual([{ type: 'tmpfs', destination: '/tmp' }]);
          }

          // 5. Attributable provenance
          expect(buggyResult.execution.patchHash).toBe(
            '0000000000000000000000000000000000000000000000000000000000000000',
          );
          expect([REFERENCE_PATCH_HASH, '6a97ad1d71d8a9069f5d6002cab3130752519ccb000000000000000000000001']).toContain(
            fixedResult.execution.patchHash,
          );
          expect(buggyResult.execution.sourceHashes['lib/utils.js']).not.toBe(
            fixedResult.execution.sourceHashes['lib/utils.js'],
          );
          expect(buggyResult.execution.sourceHashes['test/parse.js']).toBe(QS33_TEST_FILE_HASH);
          expect(fixedResult.execution.sourceHashes['test/parse.js']).toBe(QS33_TEST_FILE_HASH);

          // 6. Evaluator integration: ensure authentic records are consumed and partial matrix does NOT claim VERIFIED
          const manifest = createQs33Manifest();
          const partialMatrix = {
            buggy: [buggyResult.execution],
            reference: [fixedResult.execution],
            alternate: [],
            decoy: buggyResult.execution,
          };
          const judgeVerdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, partialMatrix);
          expect(judgeVerdict.status).not.toBe('VERIFIED');
          expect(judgeVerdict.status).toBe('PARTIAL');
          expect(judgeVerdict.checks.deterministicRuns).toBe(1);
          expect(judgeVerdict.checks.deterministicFailures).toBe(1);
          expect(judgeVerdict.checks.sameFailureIdentity).toBe(true);
          expect(judgeVerdict.checks.referenceFixPasses).toBe(false);
          expect(judgeVerdict.checks.offlineExecution).toBe(true);
          expect(judgeVerdict.checks.isolatedExecution).toBe(true);
        } finally {
          await rm(testEvidenceDir, { recursive: true, force: true }).catch(() => {});
        }
      },
      120000,
    );

    it('audits the authentic canonical Gate C2 evidence recorded in work/phase2/gate-c-runs/qs33-c2-live-01', async () => {
      const canonicalDir = path.join(
        process.cwd(),
        'work',
        'phase2',
        'gate-c-runs',
        'qs33-c2-live-01',
      );

      // 1. Verify summary exists and is PASS
      const summaryBuf = await readFile(path.join(canonicalDir, 'c2-summary.json'), 'utf8');
      const summary = JSON.parse(summaryBuf);
      expect(summary.gate).toBe('Gate C2');
      expect(summary.status).toBe('PASS');
      expect(summary.buggyRun.exitCode).toBe(1);
      expect(summary.fixedRun.exitCode).toBe(0);
      expect(summary.verification.buggyOnlyTest40Failed).toBe(true);
      expect(summary.verification.fixedProbeOutputMatch).toBe(true);
      expect(summary.verification.provenanceAttributable).toBe(true);

      // 2. Verify all 18 artifact files match recorded SHA-256 hashes
      const hashesBuf = await readFile(path.join(canonicalDir, 'artifact-sha256.json'), 'utf8');
      const expectedHashes: Record<string, string> = JSON.parse(hashesBuf);
      expect(Object.keys(expectedHashes).length).toBe(18);

      for (const [relPath, expectedHash] of Object.entries(expectedHashes)) {
        const fileBuf = await readFile(path.join(canonicalDir, relPath));
        expect(sha256(fileBuf)).toBe(expectedHash);
      }

      // 3. Confirm both probe.stderr files exist
      expect(expectedHashes['evidence-buggy/probe.stderr']).toBeDefined();
      expect(expectedHashes['evidence-fixed/probe.stderr']).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );

      // 4. Reconstruct and verify ExternalRunResult objects from recorded disk evidence
      const buggyExec: ExternalExecution = JSON.parse(
        await readFile(path.join(canonicalDir, 'evidence-buggy', 'execution.json'), 'utf8'),
      );
      const fixedExec: ExternalExecution = JSON.parse(
        await readFile(path.join(canonicalDir, 'evidence-fixed', 'execution.json'), 'utf8'),
      );
      const buggyReport = parseQs33TapReport(
        await readFile(path.join(canonicalDir, 'evidence-buggy', 'official.stdout'), 'utf8'),
        await readFile(path.join(canonicalDir, 'evidence-buggy', 'official.stderr'), 'utf8'),
      );
      const fixedReport = parseQs33TapReport(
        await readFile(path.join(canonicalDir, 'evidence-fixed', 'official.stdout'), 'utf8'),
        await readFile(path.join(canonicalDir, 'evidence-fixed', 'official.stderr'), 'utf8'),
      );
      const buggyProbe = parseQs33ProbeReport(
        await readFile(path.join(canonicalDir, 'evidence-buggy', 'probe.stdout'), 'utf8'),
        await readFile(path.join(canonicalDir, 'evidence-buggy', 'probe.stderr'), 'utf8'),
      );
      const fixedProbe = parseQs33ProbeReport(
        await readFile(path.join(canonicalDir, 'evidence-fixed', 'probe.stdout'), 'utf8'),
        await readFile(path.join(canonicalDir, 'evidence-fixed', 'probe.stderr'), 'utf8'),
      );

      const reconstructedBuggyResult: ExternalRunResult = {
        execution: buggyExec,
        supervisorResult: {
          runId: buggyExec.runId,
          role: 'buggy',
          containerId: 'reconstructed',
          exitCode: buggyExec.exitCode,
          executionStatus: buggyExec.executionStatus,
          stdout: await readFile(path.join(canonicalDir, 'evidence-buggy', 'official.stdout'), 'utf8'),
          stderr: await readFile(path.join(canonicalDir, 'evidence-buggy', 'official.stderr'), 'utf8'),
          durationMs: buggyExec.durationMs,
          artifacts: {
            'probe.json': await readFile(path.join(canonicalDir, 'evidence-buggy', 'probe.json')),
            'probe.stdout': await readFile(path.join(canonicalDir, 'evidence-buggy', 'probe.stdout')),
            'probe.stderr': await readFile(path.join(canonicalDir, 'evidence-buggy', 'probe.stderr')),
          },
          isolation: buggyExec.isolation,
          cleaned: true,
        },
        normalizedReport: buggyReport,
        probeReport: buggyProbe,
      };

      const reconstructedFixedResult: ExternalRunResult = {
        execution: fixedExec,
        supervisorResult: {
          runId: fixedExec.runId,
          role: 'reference',
          containerId: 'reconstructed',
          exitCode: fixedExec.exitCode,
          executionStatus: fixedExec.executionStatus,
          stdout: await readFile(path.join(canonicalDir, 'evidence-fixed', 'official.stdout'), 'utf8'),
          stderr: await readFile(path.join(canonicalDir, 'evidence-fixed', 'official.stderr'), 'utf8'),
          durationMs: fixedExec.durationMs,
          artifacts: {
            'probe.json': await readFile(path.join(canonicalDir, 'evidence-fixed', 'probe.json')),
            'probe.stdout': await readFile(path.join(canonicalDir, 'evidence-fixed', 'probe.stdout')),
            'probe.stderr': await readFile(path.join(canonicalDir, 'evidence-fixed', 'probe.stderr')),
          },
          isolation: fixedExec.isolation,
          cleaned: true,
        },
        normalizedReport: fixedReport,
        probeReport: fixedProbe,
      };

      const verification = verifyQs33C2Expectations(reconstructedBuggyResult, reconstructedFixedResult);
      expect(verification.passed).toBe(true);
      expect(verification.errors).toEqual([]);

      // 5. Evaluate partial matrix through evaluateExternalEvidence
      const manifest = createQs33Manifest();
      const partialMatrix = {
        buggy: [buggyExec],
        reference: [fixedExec],
        alternate: [],
        decoy: buggyExec,
      };
      const verdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, partialMatrix);
      expect(verdict.status).toBe('PARTIAL');
      expect(verdict.checks.deterministicRuns).toBe(1);
      expect(verdict.checks.deterministicFailures).toBe(1);
      expect(verdict.checks.sameFailureIdentity).toBe(true);
      expect(verdict.checks.referenceFixPasses).toBe(false);
    });
  });

  describe('Stage C2 — Targeted Negative Controls', () => {
    const validBuggyTap = `1..56
ok 1 parse parses a simple string
ok 39 parse does not crash when circular references
not ok 40 parse parses plain objects correctly
  TypeError: source.hasOwnProperty is not a function
      at exports.clone (/case/lib/utils.js:47:20)
ok 41 stringify stringifies a querystring object
# tests 56
# pass 55
# fail 1`;
    const validBuggyReport = parseQs33TapReport(validBuggyTap, '');

    const validFixedTap = `1..56
ok 1 parse parses a simple string
ok 39 parse does not crash when circular references
ok 40 parse parses plain objects correctly
ok 41 stringify stringifies a querystring object
# tests 56
# pass 56
# fail 0`;
    const validFixedReport = parseQs33TapReport(validFixedTap, '');

    // Helper to generate a valid baseline execution record
    const createSampleExecution = (role: 'buggy' | 'reference', overrides?: Partial<any>) => {
      const isBuggy = role === 'buggy';
      const rep = isBuggy ? validBuggyReport : validFixedReport;
      const allFiles: Record<string, string> = {};
      for (const f of QS33_SOURCE_FILES) {
        allFiles[f] = f === QS33_TEST_FILE ? QS33_TEST_FILE_HASH : 'a'.repeat(64);
      }
      return {
        contract: 'external-official-suite-v1' as const,
        instanceId: 'qs__issue-33',
        baseCommit: QS33_BASE_COMMIT,
        runId: `mock-${role}-${Date.now()}`,
        image: QS33_IMAGE,
        patchHash: isBuggy
          ? '0000000000000000000000000000000000000000000000000000000000000000'
          : '6a97ad1d71d8a9069f5d6002cab3130752519ccb000000000000000000000001',
        testPatchHash: QS33_TEST_PATCH_HASH,
        candidateHash: sha256(QS33_CANDIDATE_TEST),
        sourceHashes: allFiles,
        executionStatus: 'COMPLETED' as const,
        exitCode: isBuggy ? 1 : 0,
        reportJson: rep.reportJson,
        reportHash: rep.reportHash,
        freshWorkspace: true,
        durationMs: 5000,
        isolation: {
          networkMode: 'none',
          user: '1000:1000',
          readonlyRoot: true,
          capDropAll: true,
          noNewPrivileges: true,
          cpus: 1,
          memoryBytes: 256 * 1024 * 1024,
          pidsLimit: 64,
          mounts: [{ type: 'tmpfs' as const, destination: '/tmp' as const }],
        },
        ...overrides,
      };
    };

    it('rejects buggy execution that unexpectedly passes', () => {
      // Buggy execution with exitCode 0 and all passing tests
      const badBuggy = createSampleExecution('buggy', {
        exitCode: 0,
        reportJson: validFixedReport.reportJson,
        reportHash: validFixedReport.reportHash,
      });
      const manifest = createQs33Manifest();
      const matrix = {
        buggy: [badBuggy],
        reference: [],
        alternate: [],
        decoy: badBuggy,
      };
      const verdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, matrix);
      expect(verdict.checks.buggyFails).toBe(false);
      expect(verdict.reasonCodes).toContain('BUGGY_FAILS_FAILED');
    });

    it('rejects fixed execution with an unrelated failure', () => {
      // Fixed execution where a pass-to-pass test failed
      const badFixedTap = `1..56
not ok 1 parse parses a simple string
  Error: connection failed
      at something (/case/lib/utils.js:10:10)
ok 40 parse parses plain objects correctly
# tests 56
# pass 55
# fail 1`;
      const badFixedReport = parseQs33TapReport(badFixedTap, '');
      const badFixed = createSampleExecution('reference', {
        exitCode: 1,
        reportJson: badFixedReport.reportJson,
        reportHash: badFixedReport.reportHash,
      });

      const manifest = createQs33Manifest();
      const matrix = {
        buggy: [createSampleExecution('buggy')],
        reference: [badFixed, badFixed, badFixed],
        alternate: [],
        decoy: createSampleExecution('buggy'),
      };
      const verdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, matrix);
      expect(verdict.checks.referenceFixPasses).toBe(false);
      expect(verdict.reasonCodes).toContain('REFERENCE_FIX_PASSES_FAILED');
    });

    it('rejects missing test identities', () => {
      // TAP report with only 55 tests (missing failToPass test)
      const missingTap = `1..55
ok 1 parse parses a simple string
# tests 55
# pass 55
# fail 0`;
      const rep = parseQs33TapReport(missingTap, '');
      const exec = createSampleExecution('buggy', {
        reportJson: rep.reportJson,
        reportHash: rep.reportHash,
      });
      const manifest = createQs33Manifest();
      const matrix = {
        buggy: [exec],
        reference: [],
        alternate: [],
        decoy: exec,
      };
      const verdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, matrix);
      expect(verdict.checks.buggyFails).toBe(false);
    });

    it('rejects changed test identities', () => {
      // Test 1 name altered
      const alteredTap = `1..56
ok 1 parse parses an UNKNOWN string
not ok 40 parse parses plain objects correctly
  TypeError: source.hasOwnProperty is not a function
      at exports.clone (/case/lib/utils.js:47:20)
# tests 56
# pass 55
# fail 1`;
      const rep = parseQs33TapReport(alteredTap, '');
      const exec = createSampleExecution('buggy', {
        reportJson: rep.reportJson,
        reportHash: rep.reportHash,
      });
      const manifest = createQs33Manifest();
      const matrix = {
        buggy: [exec],
        reference: [],
        alternate: [],
        decoy: exec,
      };
      const verdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, matrix);
      expect(verdict.checks.buggyFails).toBe(false);
    });

    it('rejects missing or malformed raw evidence', () => {
      const manifest = createQs33Manifest();

      // Null reportJson
      const execNull = createSampleExecution('buggy', { reportJson: null, reportHash: null });
      const verdictNull = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
        buggy: [execNull],
        reference: [],
        alternate: [],
        decoy: execNull,
      });
      expect(verdictNull.status).toBe('ERROR');
      expect(verdictNull.reasonCodes).toContain('EXECUTION_ERROR');

      // Malformed JSON
      const execBadJson = createSampleExecution('buggy', {
        reportJson: '{"corrupted": true',
        reportHash: sha256('{"corrupted": true'),
      });
      const verdictBadJson = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
        buggy: [execBadJson],
        reference: [],
        alternate: [],
        decoy: execBadJson,
      });
      expect(verdictBadJson.status).toBe('ERROR');
    });

    it('rejects incorrect failure type or stack location', () => {
      const manifest = createQs33Manifest();

      // Incorrect failure type (AssertionError instead of TypeError)
      const wrongTypeTap = `1..56
not ok 40 parse parses plain objects correctly
  AssertionError: expected true to equal false
      at exports.clone (/case/lib/utils.js:47:20)
# tests 56
# pass 55
# fail 1`;
      const repWrongType = parseQs33TapReport(wrongTypeTap, '');
      const execWrongType = createSampleExecution('buggy', {
        reportJson: repWrongType.reportJson,
        reportHash: repWrongType.reportHash,
      });
      const verdictWrongType = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
        buggy: [execWrongType],
        reference: [],
        alternate: [],
        decoy: execWrongType,
      });
      expect(verdictWrongType.checks.sameFailureIdentity).toBe(false);
      expect(verdictWrongType.reasonCodes).toContain('SAME_FAILURE_IDENTITY_FAILED');

      // Incorrect stack frame (/case/lib/parse.js instead of /case/lib/utils.js)
      const wrongFrameTap = `1..56
not ok 40 parse parses plain objects correctly
  TypeError: source.hasOwnProperty is not a function
      at module.exports (/case/lib/parse.js:10:5)
# tests 56
# pass 55
# fail 1`;
      const repWrongFrame = parseQs33TapReport(wrongFrameTap, '');
      const execWrongFrame = createSampleExecution('buggy', {
        reportJson: repWrongFrame.reportJson,
        reportHash: repWrongFrame.reportHash,
      });
      const verdictWrongFrame = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
        buggy: [execWrongFrame],
        reference: [],
        alternate: [],
        decoy: execWrongFrame,
      });
      expect(verdictWrongFrame.checks.sameFailureIdentity).toBe(false);
      expect(verdictWrongFrame.reasonCodes).toContain('SAME_FAILURE_IDENTITY_FAILED');
    });

    it('rejects corrupted artifact hashes', () => {
      const manifest = createQs33Manifest();

      // Corrupted reportHash
      const execBadHash = createSampleExecution('buggy', {
        reportHash: '0000000000000000000000000000000000000000000000000000000000000099',
      });
      const verdictBadHash = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
        buggy: [execBadHash],
        reference: [],
        alternate: [],
        decoy: execBadHash,
      });
      expect(verdictBadHash.status).toBe('ERROR');

      // Corrupted testFileHash
      const badSourceHashes = { ...execBadHash.sourceHashes, [QS33_TEST_FILE]: 'f'.repeat(64) };
      const execBadSource = createSampleExecution('buggy', { sourceHashes: badSourceHashes });
      const verdictBadSource = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
        buggy: [execBadSource],
        reference: [],
        alternate: [],
        decoy: execBadSource,
      });
      expect(verdictBadSource.checks.buggyFails).toBe(false);

      // Missing source file in sourceHashes
      const missingSourceHashes = { ...execBadHash.sourceHashes };
      delete missingSourceHashes['lib/utils.js'];
      const execMissingSource = createSampleExecution('buggy', {
        sourceHashes: missingSourceHashes,
      });
      const verdictMissing = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
        buggy: [execMissingSource],
        reference: [],
        alternate: [],
        decoy: execMissingSource,
      });
      expect(verdictMissing.checks.buggyFails).toBe(false);
    });

    it('rejects cross-role or cross-run evidence substitution', () => {
      const manifest = createQs33Manifest();
      const validBuggy = createSampleExecution('buggy', { runId: 'run-1' });
      const validFixed = createSampleExecution('reference', { runId: 'run-2' });

      // Cross-role substitution: fixed substituted as buggy
      const verdictCross1 = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
        buggy: [validFixed],
        reference: [],
        alternate: [],
        decoy: validBuggy,
      });
      expect(verdictCross1.checks.buggyFails).toBe(false);

      // Cross-role substitution: buggy substituted as reference
      const verdictCross2 = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
        buggy: [validBuggy],
        reference: [validBuggy, validBuggy, validBuggy],
        alternate: [],
        decoy: validBuggy,
      });
      expect(verdictCross2.checks.referenceFixPasses).toBe(false);

      // Cross-run substitution: reused runId
      const reusedBuggy = createSampleExecution('buggy', { runId: 'reused-id' });
      const reusedFixed = createSampleExecution('reference', { runId: 'reused-id' });
      const verdictReused = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
        buggy: [reusedBuggy],
        reference: [reusedFixed],
        alternate: [],
        decoy: reusedBuggy,
      });
      expect(verdictReused.checks.freshState).toBe(false);
      expect(verdictReused.reasonCodes).toContain('FRESH_STATE_FAILED');
    });

    it('rejects timeout, missing watchdog, or incomplete cleanup', async () => {
      // 1. Process killed by timeout: exitCode null / status ERROR
      const manifest = createQs33Manifest();
      const timedOutExec = createSampleExecution('buggy', {
        executionStatus: 'ERROR',
        exitCode: null,
      });
      const verdictTimeout = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
        buggy: [timedOutExec],
        reference: [],
        alternate: [],
        decoy: timedOutExec,
      });
      expect(verdictTimeout.status).toBe('ERROR');
      expect(verdictTimeout.reasonCodes).toContain('EXECUTION_ERROR');

      // 2. Incomplete cleanup rejected by C2 verifier
      const dummyRunResult = (cleaned: boolean): any => ({
        supervisorResult: {
          runId: `run-${cleaned ? '1' : '2'}`,
          executionStatus: 'COMPLETED',
          cleaned,
          artifacts: {
            'probe.json': Buffer.from(JSON.stringify({ exitCode: 1 })),
          },
        },
        execution: createSampleExecution('buggy', { runId: `run-${cleaned ? '1' : '2'}` }),
        normalizedReport: validBuggyReport,
        probeReport: {
          passed: false,
          serializedOutput: null,
          error: {
            name: 'TypeError',
            type: 'TypeError',
            message: 'source.hasOwnProperty is not a function',
            topApplicationFrame: 'at exports.clone (/case/lib/utils.js:47:20)',
          },
        },
      });

      const uncleanedReport = verifyQs33C2Expectations(dummyRunResult(false), dummyRunResult(true));
      expect(uncleanedReport.passed).toBe(false);
      expect(uncleanedReport.errors).toContain('Cleanup must be verified for both executions');

      // 3. Security guards: host binds rejected
      await expect(
        runExternalContainer({
          runId: 'valid-run',
          role: 'buggy',
          image: QS33_IMAGE,
          stagedDir: process.cwd(),
          hostBinds: ['/etc:/case:ro'],
        }),
      ).rejects.toThrow('HOST_BINDS_FORBIDDEN');
    });
  });

  describe('Stage C3 — Candidate Patch Validation, Security Boundaries & Provenance', () => {
    it('audits the authentic canonical Gate C3 evidence recorded in work/phase2/gate-c-runs/qs33-c3-live-01', async () => {
      const canonicalDir = path.join(
        process.cwd(),
        'work',
        'phase2',
        'gate-c-runs',
        'qs33-c3-live-01',
      );

      // 1. Verify summary exists and is PASS
      const summaryBuf = await readFile(path.join(canonicalDir, 'c3-summary.json'), 'utf8');
      const summary = JSON.parse(summaryBuf);
      expect(summary.gate).toBe('Gate C3');
      expect(summary.status).toBe('PASS');
      expect(summary.referenceRun.exitCode).toBe(0);
      expect(summary.alternateRun.exitCode).toBe(0);
      expect(summary.decoyRun.exitCode).toBe(1);
      expect(summary.referenceRun.patchHash).toBe(REFERENCE_PATCH_HASH);
      expect(summary.alternateRun.patchHash).toBe(ALTERNATE_PATCH_HASH);
      expect(summary.decoyRun.patchHash).toBe(DECOY_PATCH_HASH);
      expect(summary.decoyRun.failingTest).toBe('parse parses plain objects correctly');
      expect(summary.decoyRun.failureType).toBe('AssertionError');
      expect(summary.decoyRun.probeOutput).toBe('{"a":{}}');
      expect(summary.decoyRun.probeError).toBe('AssertionError');
      expect(summary.verification.provenanceAttributable).toBe(true);

      // 2. Verify all 27 artifact files match recorded SHA-256 hashes
      const hashesBuf = await readFile(path.join(canonicalDir, 'artifact-sha256.json'), 'utf8');
      const expectedHashes: Record<string, string> = JSON.parse(hashesBuf);
      expect(Object.keys(expectedHashes).length).toBe(27);

      for (const [relPath, expectedHash] of Object.entries(expectedHashes)) {
        const fileBuf = await readFile(path.join(canonicalDir, relPath));
        expect(sha256(fileBuf)).toBe(expectedHash);
      }

      // 3. Confirm 0-byte stream frame integrity on reference and alternate, non-empty on decoy
      expect(expectedHashes['evidence-reference/probe.stderr']).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
      expect(expectedHashes['evidence-alternate/probe.stderr']).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
      expect(expectedHashes['evidence-decoy/probe.stderr']).not.toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );

      // 4. Reconstruct ExternalRunResult objects and verify expectations
      const loadRoleResult = async (roleDir: string, role: any): Promise<ExternalRunResult> => {
        const exec: ExternalExecution = JSON.parse(
          await readFile(path.join(canonicalDir, roleDir, 'execution.json'), 'utf8'),
        );
        const report = parseQs33TapReport(
          await readFile(path.join(canonicalDir, roleDir, 'official.stdout'), 'utf8'),
          await readFile(path.join(canonicalDir, roleDir, 'official.stderr'), 'utf8'),
        );
        const probe = parseQs33ProbeReport(
          await readFile(path.join(canonicalDir, roleDir, 'probe.stdout'), 'utf8'),
          await readFile(path.join(canonicalDir, roleDir, 'probe.stderr'), 'utf8'),
        );
        return {
          execution: exec,
          supervisorResult: {
            runId: exec.runId,
            role,
            containerId: 'reconstructed',
            exitCode: exec.exitCode,
            executionStatus: exec.executionStatus,
            stdout: await readFile(path.join(canonicalDir, roleDir, 'official.stdout'), 'utf8'),
            stderr: await readFile(path.join(canonicalDir, roleDir, 'official.stderr'), 'utf8'),
            durationMs: exec.durationMs,
            artifacts: {
              'probe.json': await readFile(path.join(canonicalDir, roleDir, 'probe.json')),
              'probe.stdout': await readFile(path.join(canonicalDir, roleDir, 'probe.stdout')),
              'probe.stderr': await readFile(path.join(canonicalDir, roleDir, 'probe.stderr')),
            },
            isolation: exec.isolation,
            cleaned: true,
          },
          normalizedReport: report,
          probeReport: probe,
        };
      };

      const refResult = await loadRoleResult('evidence-reference', 'reference');
      const altResult = await loadRoleResult('evidence-alternate', 'alternate');
      const decResult = await loadRoleResult('evidence-decoy', 'decoy');

      const verification = verifyQs33C3Expectations(refResult, altResult, decResult);
      expect(verification.passed).toBe(true);
      expect(verification.errors).toEqual([]);
    });

    it('verifies evaluator checks: referenceFixPasses, alternateFixPasses, decoyFixStillFails', async () => {
      const canonicalDir = path.join(
        process.cwd(),
        'work',
        'phase2',
        'gate-c-runs',
        'qs33-c3-live-01',
      );
      const c2Dir = path.join(
        process.cwd(),
        'work',
        'phase2',
        'gate-c-runs',
        'qs33-c2-live-01',
      );

      const refExec: ExternalExecution = JSON.parse(
        await readFile(path.join(canonicalDir, 'evidence-reference', 'execution.json'), 'utf8'),
      );
      const altExec: ExternalExecution = JSON.parse(
        await readFile(path.join(canonicalDir, 'evidence-alternate', 'execution.json'), 'utf8'),
      );
      const decExec: ExternalExecution = JSON.parse(
        await readFile(path.join(canonicalDir, 'evidence-decoy', 'execution.json'), 'utf8'),
      );
      const buggyExec: ExternalExecution = JSON.parse(
        await readFile(path.join(c2Dir, 'evidence-buggy', 'execution.json'), 'utf8'),
      );

      const manifest = createQs33Manifest();

      // Matrix satisfying C3 requirements
      const fullMatrix = {
        buggy: Array(10).fill(null).map((_, i) => ({ ...buggyExec, runId: `test-buggy-${i}` })),
        reference: [
          { ...refExec, runId: 'test-ref-0' },
          { ...refExec, runId: 'test-ref-1' },
          { ...refExec, runId: 'test-ref-2' },
        ],
        alternate: [
          { ...altExec, runId: 'test-alt-0' },
          { ...altExec, runId: 'test-alt-1' },
          { ...altExec, runId: 'test-alt-2' },
        ],
        decoy: decExec,
      };

      const verdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, fullMatrix);
      expect(verdict.checks.referenceFixPasses).toBe(true);
      expect(verdict.checks.alternateFixPasses).toBe(true);
      expect(verdict.checks.decoyFixStillFails).toBe(true);
      expect(verdict.checks.sameFailureIdentity).toBe(true);
      expect(verdict.checks.buggyFails).toBe(true);
      expect(verdict.checks.offlineExecution).toBe(true);
      expect(verdict.checks.isolatedExecution).toBe(true);
      expect(verdict.checks.freshState).toBe(true);
      expect(verdict.status).toBe('VERIFIED');
    });

    describe('Patch Applier Security & Integrity Boundaries', () => {
      it('rejects incorrect base commit', async () => {
        const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'patch-applier-test-'));
        try {
          // Explicit baseCommit mismatch
          await expect(
            applyCandidatePatch({
              stagingDir: tmpDir,
              patch: REFERENCE_PATCH,
              expectedPatchHash: REFERENCE_PATCH_HASH,
              baseCommit: 'wrong-commit-sha-00000000000000000000',
              expectedBaseCommit: QS33_BASE_COMMIT,
            }),
          ).rejects.toThrow('INCORRECT_BASE_COMMIT');

          // On-disk .git/HEAD commit mismatch
          await mkdir(path.join(tmpDir, '.git'), { recursive: true });
          await writeFile(
            path.join(tmpDir, '.git', 'HEAD'),
            '1111111111111111111111111111111111111111\n',
            'utf8',
          );
          await expect(
            applyCandidatePatch({
              stagingDir: tmpDir,
              patch: REFERENCE_PATCH,
              expectedPatchHash: REFERENCE_PATCH_HASH,
              expectedBaseCommit: QS33_BASE_COMMIT,
            }),
          ).rejects.toThrow('INCORRECT_BASE_COMMIT');
        } finally {
          await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        }
      });

      it('rejects tampered patch hash', async () => {
        const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'patch-applier-test-'));
        try {
          await expect(
            applyCandidatePatch({
              stagingDir: tmpDir,
              patch: REFERENCE_PATCH,
              expectedPatchHash: '0000000000000000000000000000000000000000000000000000000000000000',
              baseCommit: QS33_BASE_COMMIT,
            }),
          ).rejects.toThrow('TAMPERED_PATCH_HASH');
        } finally {
          await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        }
      });

      it('rejects unauthorized modified files (e.g. test/parse.js or package.json)', async () => {
        const unauthorizedPatches = [
          `diff --git a/test/parse.js b/test/parse.js
--- a/test/parse.js
+++ b/test/parse.js
@@ -1,3 +1,3 @@
-test
+hacked
`,
          `diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1,3 +1,3 @@
-test
+hacked
`,
          `diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -1,3 +1,3 @@
-test
+hacked
`,
        ];

        for (const badPatch of unauthorizedPatches) {
          expect(() => parseUnifiedDiff(badPatch, ALLOWED_PATCH_PATHS)).toThrow(
            'UNAUTHORIZED_MODIFIED_FILE',
          );
        }
      });

      it('rejects path traversal attempts', async () => {
        const traversalPatches = [
          `diff --git a/../escape.js b/../escape.js
--- a/../escape.js
+++ b/../escape.js
@@ -1,1 +1,1 @@
-a
+b
`,
          `diff --git a/lib/../../escape.js b/lib/../../escape.js
--- a/lib/../../escape.js
+++ b/lib/../../escape.js
@@ -1,1 +1,1 @@
-a
+b
`,
        ];

        for (const badPatch of traversalPatches) {
          expect(() => parseUnifiedDiff(badPatch, ALLOWED_PATCH_PATHS)).toThrow(
            'PATH_TRAVERSAL_DETECTED',
          );
        }

        expect(() => validatePatchPath('/absolute/path')).toThrow('ABSOLUTE_PATH_DETECTED');
        expect(() => validatePatchPath('\\windows\\path')).toThrow('ABSOLUTE_PATH_DETECTED');
      });

      it('rejects invalid patch syntax', async () => {
        const invalidPatches = [
          '',
          'not a patch at all',
          'diff --git a/lib/parse.js b/lib/parse.js\ngarbage line without hunks',
          'diff --git a/lib/parse.js b/lib/parse.js\n@@ invalid @@\n line',
        ];

        for (const badPatch of invalidPatches) {
          expect(() => parseUnifiedDiff(badPatch, ALLOWED_PATCH_PATHS)).toThrow(
            'INVALID_PATCH_SYNTAX',
          );
        }
      });

      it('rejects symbolic links in staging directory', async () => {
        const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'symlink-test-'));
        try {
          const symlinkTarget = path.join(tmpDir, 'lib', 'parse.js');
          await mkdir(path.join(tmpDir, 'lib'), { recursive: true });
          const realFile = path.join(tmpDir, 'real.js');
          await writeFile(realFile, 'real content', 'utf8');
          try {
            const { symlink } = await import('node:fs/promises');
            await symlink(realFile, symlinkTarget);
            await expect(
              applyCandidatePatch({
                stagingDir: tmpDir,
                patch: REFERENCE_PATCH,
                expectedPatchHash: REFERENCE_PATCH_HASH,
                baseCommit: QS33_BASE_COMMIT,
              }),
            ).rejects.toThrow('SYMLINK_FORBIDDEN');
          } catch (symlinkErr: any) {
            // On Windows non-elevated shells without Developer Mode, symlink creation may require privilege
            if (symlinkErr.code !== 'EPERM') throw symlinkErr;
          }
        } finally {
          await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        }
      });
    });

    describe('Stage C3 — Targeted Negative Controls', () => {
      const makeExecution = (
        role: 'reference' | 'alternate' | 'decoy',
        exitCode: number,
        passed: boolean,
        patchHash: string,
        overrides?: Partial<any>,
      ) => {
        const rep = passed
          ? parseQs33TapReport('1..56\n' + QS33_PASS_TO_PASS.map((n, i) => `ok ${i + 1} ${n}`).join('\n') + '\nok 56 parse parses plain objects correctly\n# tests 56\n# pass 56\n# fail 0', '')
          : parseQs33TapReport('1..56\n' + QS33_PASS_TO_PASS.map((n, i) => `ok ${i + 1} ${n}`).join('\n') + '\nnot ok 40 parse parses plain objects correctly\n  AssertionError: expected { a: {} } to deeply equal { a: { b: \'c\' } }\n# tests 56\n# pass 55\n# fail 1', '');

        const allFiles: Record<string, string> = {};
        for (const f of QS33_SOURCE_FILES) {
          allFiles[f] = f === QS33_TEST_FILE ? QS33_TEST_FILE_HASH : 'b'.repeat(64);
        }

        return {
          contract: 'external-official-suite-v1' as const,
          instanceId: 'qs__issue-33',
          baseCommit: QS33_BASE_COMMIT,
          runId: `mock-c3-${role}-${Date.now()}-${Math.random()}`,
          image: QS33_IMAGE,
          patchHash,
          testPatchHash: QS33_TEST_PATCH_HASH,
          candidateHash: sha256(QS33_CANDIDATE_TEST),
          sourceHashes: allFiles,
          executionStatus: 'COMPLETED' as const,
          exitCode,
          reportJson: rep.reportJson,
          reportHash: rep.reportHash,
          freshWorkspace: true,
          durationMs: 3000,
          isolation: {
            networkMode: 'none',
            user: '1000:1000',
            readonlyRoot: true,
            capDropAll: true,
            noNewPrivileges: true,
            cpus: 1,
            memoryBytes: 256 * 1024 * 1024,
            pidsLimit: 64,
            mounts: [{ type: 'tmpfs' as const, destination: '/tmp' as const }],
          },
          ...overrides,
        };
      };

      it('rejects correct output with unrelated regression failure (REFERENCE_FIX_PASSES_FAILED)', () => {
        const manifest = createQs33Manifest();
        // Reference fix with unrelated failure on Test 1
        const badRefTap = `1..56
not ok 1 parse parses a simple string
  Error: unexpected regression
      at /case/lib/parse.js:10:5
ok 40 parse parses plain objects correctly
# tests 56
# pass 55
# fail 1`;
        const badRefRep = parseQs33TapReport(badRefTap, '');
        const badRef = makeExecution('reference', 1, false, REFERENCE_PATCH_HASH, {
          reportJson: badRefRep.reportJson,
          reportHash: badRefRep.reportHash,
        });

        const matrix = {
          buggy: [makeExecution('decoy', 1, false, '0'.repeat(64))],
          reference: [badRef, badRef, badRef],
          alternate: [],
          decoy: makeExecution('decoy', 1, false, DECOY_PATCH_HASH),
        };
        const verdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, matrix);
        expect(verdict.checks.referenceFixPasses).toBe(false);
        expect(verdict.reasonCodes).toContain('REFERENCE_FIX_PASSES_FAILED');
      });

      it('rejects alternate fix failure with regression (ALTERNATE_FIX_PASSES_FAILED)', () => {
        const manifest = createQs33Manifest();
        const badAltTap = `1..56
not ok 1 parse parses a simple string
  Error: unexpected regression in alternate
      at /case/lib/parse.js:10:5
ok 40 parse parses plain objects correctly
# tests 56
# pass 55
# fail 1`;
        const badAltRep = parseQs33TapReport(badAltTap, '');
        const badAlt = makeExecution('alternate', 1, false, ALTERNATE_PATCH_HASH, {
          reportJson: badAltRep.reportJson,
          reportHash: badAltRep.reportHash,
        });

        const matrix = {
          buggy: [makeExecution('decoy', 1, false, '0'.repeat(64))],
          reference: [],
          alternate: [badAlt, badAlt, badAlt],
          decoy: makeExecution('decoy', 1, false, DECOY_PATCH_HASH),
        };
        const verdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, matrix);
        expect(verdict.checks.alternateFixPasses).toBe(false);
        expect(verdict.reasonCodes).toContain('ALTERNATE_FIX_PASSES_FAILED');
      });

      it('rejects decoy unexpectedly passing (DECOY_FIX_STILL_FAILS_FAILED)', () => {
        const manifest = createQs33Manifest();
        // Decoy unexpectedly passes Test 40 with exitCode 0
        const passingDecoy = makeExecution('decoy', 0, true, DECOY_PATCH_HASH);

        const matrix = {
          buggy: [makeExecution('decoy', 1, false, '0'.repeat(64))],
          reference: [],
          alternate: [],
          decoy: passingDecoy,
        };
        const verdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, matrix);
        expect(verdict.checks.decoyFixStillFails).toBe(false);
        expect(verdict.reasonCodes).toContain('DECOY_FIX_STILL_FAILS_FAILED');
      });

      it('rejects cross-candidate evidence substitution', () => {
        const manifest = createQs33Manifest();
        const validRef = makeExecution('reference', 0, true, REFERENCE_PATCH_HASH, { runId: 'ref-1' });
        const validDecoy = makeExecution('decoy', 1, false, DECOY_PATCH_HASH, { runId: 'dec-1' });

        // Substituting decoy as reference fix
        const verdict1 = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
          buggy: [],
          reference: [validDecoy, validDecoy, validDecoy],
          alternate: [],
          decoy: validDecoy,
        });
        expect(verdict1.checks.referenceFixPasses).toBe(false);

        // Substituting reference fix as decoy
        const verdict2 = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
          buggy: [],
          reference: [validRef, validRef, validRef],
          alternate: [],
          decoy: validRef,
        });
        expect(verdict2.checks.decoyFixStillFails).toBe(false);

        // verifyQs33C3Expectations rejection on substitution
        const dummyResult = (exec: any, probePassed: boolean, probeOutput: string, error: any = null): ExternalRunResult => ({
          execution: exec,
          supervisorResult: {
            runId: exec.runId,
            role: 'test',
            containerId: 'c1',
            exitCode: exec.exitCode,
            executionStatus: 'COMPLETED',
            stdout: '',
            stderr: '',
            durationMs: 1000,
            artifacts: {
              'probe.json': Buffer.from(JSON.stringify({ exitCode: exec.exitCode })),
            },
            isolation: exec.isolation,
            cleaned: true,
          },
          normalizedReport: parseQs33TapReport(exec.exitCode === 0 ? '1..56\nok 1 test' : '1..56\nnot ok 40 parse parses plain objects correctly', ''),
          probeReport: {
            passed: probePassed,
            serializedOutput: probeOutput,
            error,
          },
        });

        const unrefResult = dummyResult(validRef, true, '{"a":{"b":"c"}}');
        const undecResult = dummyResult(validDecoy, false, '{"a":{}}', { type: 'AssertionError' });

        // Substituted decoy into reference position in C3 verifier
        const substitutedVerify = verifyQs33C3Expectations(undecResult, unrefResult, undecResult);
        expect(substitutedVerify.passed).toBe(false);
      });

      it('rejects reused execution identity (FRESH_STATE_FAILED)', () => {
        const manifest = createQs33Manifest();
        const execA = makeExecution('reference', 0, true, REFERENCE_PATCH_HASH, { runId: 'shared-id' });
        const execB = makeExecution('alternate', 0, true, ALTERNATE_PATCH_HASH, { runId: 'shared-id' });
        const execDecoy = makeExecution('decoy', 1, false, DECOY_PATCH_HASH, { runId: 'shared-id' });

        const verdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
          buggy: [],
          reference: [execA],
          alternate: [execB],
          decoy: execDecoy,
        });
        expect(verdict.checks.freshState).toBe(false);
        expect(verdict.reasonCodes).toContain('FRESH_STATE_FAILED');
      });

      it('rejects corrupt artifact hashes in candidate executions', () => {
        const manifest = createQs33Manifest();
        // Corrupt reportHash
        const badHashExec = makeExecution('reference', 0, true, REFERENCE_PATCH_HASH, {
          reportHash: 'deadbeef'.repeat(8),
        });
        const verdictBadHash = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
          buggy: [],
          reference: [badHashExec, badHashExec, badHashExec],
          alternate: [],
          decoy: makeExecution('decoy', 1, false, DECOY_PATCH_HASH),
        });
        expect(verdictBadHash.status).toBe('ERROR');
        expect(verdictBadHash.reasonCodes).toContain('EXECUTION_ERROR');

        // Mismatched patchHash
        const badPatchExec = makeExecution('reference', 0, true, '12345678'.repeat(8));
        const verdictBadPatch = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
          buggy: [],
          reference: [badPatchExec, badPatchExec, badPatchExec],
          alternate: [],
          decoy: makeExecution('decoy', 1, false, DECOY_PATCH_HASH),
        });
        expect(verdictBadPatch.checks.referenceFixPasses).toBe(false);
      });

      it('rejects timeout, missing watchdog, or incomplete cleanup', async () => {
        const manifest = createQs33Manifest();
        const timedOutCandidate = makeExecution('reference', null as any, false, REFERENCE_PATCH_HASH, {
          executionStatus: 'ERROR',
          exitCode: null,
        });
        const verdictTimeout = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, {
          buggy: [],
          reference: [timedOutCandidate, timedOutCandidate, timedOutCandidate],
          alternate: [],
          decoy: makeExecution('decoy', 1, false, DECOY_PATCH_HASH),
        });
        expect(verdictTimeout.status).toBe('ERROR');
        expect(verdictTimeout.reasonCodes).toContain('EXECUTION_ERROR');

        // Incomplete cleanup in verifyQs33C3Expectations
        const dummyC3Result = (cleaned: boolean, patchHash: string, exitCode: number, probePassed: boolean, output: string): any => ({
          execution: makeExecution('reference', exitCode, probePassed, patchHash),
          supervisorResult: {
            runId: `run-${Date.now()}-${Math.random()}`,
            executionStatus: 'COMPLETED',
            cleaned,
            artifacts: {
              'probe.json': Buffer.from(JSON.stringify({ exitCode })),
            },
          },
          normalizedReport: parseQs33TapReport('1..56\nok 1 test', ''),
          probeReport: {
            passed: probePassed,
            serializedOutput: output,
            error: probePassed ? null : { type: 'AssertionError' },
          },
        });

        const uncleanedReport = verifyQs33C3Expectations(
          dummyC3Result(false, REFERENCE_PATCH_HASH, 0, true, '{"a":{"b":"c"}}'),
          dummyC3Result(true, ALTERNATE_PATCH_HASH, 0, true, '{"a":{"b":"c"}}'),
          dummyC3Result(true, DECOY_PATCH_HASH, 1, false, '{"a":{}}'),
        );
        expect(uncleanedReport.passed).toBe(false);
        expect(uncleanedReport.errors).toContain('Cleanup must be verified for all candidate executions');
      });
    });
  });

  describe('Stage C4 — Full 17-Run Matrix Execution, Evaluator Integration & Audit', () => {
    it('audits the authentic canonical Gate C4 evidence recorded in work/phase2/gate-c-runs/qs33-c4-live-01', async () => {
      const canonicalDir = path.join(
        process.cwd(),
        'work',
        'phase2',
        'gate-c-runs',
        'qs33-c4-live-01',
      );

      // 1. Verify summary exists and is VERIFIED
      const summaryBuf = await readFile(path.join(canonicalDir, 'c4-summary.json'), 'utf8');
      const summary = JSON.parse(summaryBuf);
      expect(summary.gate).toBe('Gate C4');
      expect(summary.status).toBe('VERIFIED');
      expect(summary.evaluatorVerdict.status).toBe('VERIFIED');
      expect(summary.matrixCounts).toEqual({
        buggy: 10,
        reference: 3,
        alternate: 3,
        decoy: 1,
        total: 17,
      });
      expect(summary.evaluatorVerdict.checks.buggyFails).toBe(true);
      expect(summary.evaluatorVerdict.checks.referenceFixPasses).toBe(true);
      expect(summary.evaluatorVerdict.checks.alternateFixPasses).toBe(true);
      expect(summary.evaluatorVerdict.checks.decoyFixStillFails).toBe(true);
      expect(summary.evaluatorVerdict.checks.deterministicRuns).toBe(10);
      expect(summary.evaluatorVerdict.checks.deterministicFailures).toBe(10);

      // 2. Verify all 153 artifact files match recorded SHA-256 hashes
      const hashesBuf = await readFile(path.join(canonicalDir, 'artifact-sha256.json'), 'utf8');
      const expectedHashes: Record<string, string> = JSON.parse(hashesBuf);
      expect(Object.keys(expectedHashes).length).toBe(153);

      for (const [relPath, expectedHash] of Object.entries(expectedHashes)) {
        const fileBuf = await readFile(path.join(canonicalDir, relPath));
        expect(sha256(fileBuf)).toBe(expectedHash);
      }

      // 3. Verify evidence index
      const indexBuf = await readFile(path.join(canonicalDir, 'evidence-index.json'), 'utf8');
      const evidenceIndex = JSON.parse(indexBuf);
      expect(evidenceIndex.totalExecutions).toBe(17);
      expect(evidenceIndex.executions.length).toBe(17);

      // Verify all 17 executions have unique runIds
      const indexedRunIds = evidenceIndex.executions.map((e: any) => e.runId);
      expect(new Set(indexedRunIds).size).toBe(17);

      // 4. Reconstruct ExternalRunResult objects from recorded disk evidence
      const loadRunResult = async (dirName: string, role: any): Promise<ExternalRunResult> => {
        const exec: ExternalExecution = JSON.parse(
          await readFile(path.join(canonicalDir, dirName, 'execution.json'), 'utf8'),
        );
        const report = parseQs33TapReport(
          await readFile(path.join(canonicalDir, dirName, 'official.stdout'), 'utf8'),
          await readFile(path.join(canonicalDir, dirName, 'official.stderr'), 'utf8'),
        );
        const probe = parseQs33ProbeReport(
          await readFile(path.join(canonicalDir, dirName, 'probe.stdout'), 'utf8'),
          await readFile(path.join(canonicalDir, dirName, 'probe.stderr'), 'utf8'),
        );
        return {
          execution: exec,
          supervisorResult: {
            runId: exec.runId,
            role,
            containerId: 'reconstructed',
            exitCode: exec.exitCode,
            executionStatus: exec.executionStatus,
            stdout: await readFile(path.join(canonicalDir, dirName, 'official.stdout'), 'utf8'),
            stderr: await readFile(path.join(canonicalDir, dirName, 'official.stderr'), 'utf8'),
            durationMs: exec.durationMs,
            artifacts: {
              'probe.json': await readFile(path.join(canonicalDir, dirName, 'probe.json')),
              'probe.stdout': await readFile(path.join(canonicalDir, dirName, 'probe.stdout')),
              'probe.stderr': await readFile(path.join(canonicalDir, dirName, 'probe.stderr')),
            },
            isolation: exec.isolation,
            cleaned: true,
          },
          normalizedReport: report,
          probeReport: probe,
        };
      };

      const buggyResults: ExternalRunResult[] = [];
      for (let i = 1; i <= 10; i++) {
        buggyResults.push(
          await loadRunResult(`evidence-buggy-${String(i).padStart(2, '0')}`, 'buggy'),
        );
      }

      const referenceResults: ExternalRunResult[] = [];
      for (let i = 1; i <= 3; i++) {
        referenceResults.push(
          await loadRunResult(`evidence-reference-${String(i).padStart(2, '0')}`, 'reference'),
        );
      }

      const alternateResults: ExternalRunResult[] = [];
      for (let i = 1; i <= 3; i++) {
        alternateResults.push(
          await loadRunResult(`evidence-alternate-${String(i).padStart(2, '0')}`, 'alternate'),
        );
      }

      const decoyResult = await loadRunResult('evidence-decoy-01', 'decoy');

      // 5. Run verifyQs33C4Expectations on reconstructed matrix
      const matrixResults = {
        buggy: buggyResults,
        reference: referenceResults,
        alternate: alternateResults,
        decoy: decoyResult,
      };
      const verification = verifyQs33C4Expectations(matrixResults);
      expect(verification.passed).toBe(true);
      expect(verification.errors).toEqual([]);

      // 6. Run evaluateExternalEvidence on reconstructed executions
      const manifest = createQs33Manifest();
      const externalMatrix = {
        buggy: buggyResults.map((r) => r.execution),
        reference: referenceResults.map((r) => r.execution),
        alternate: alternateResults.map((r) => r.execution),
        decoy: decoyResult.execution,
      };
      const verdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, externalMatrix);
      expect(verdict.status).toBe('VERIFIED');
      expect(verdict.reasonCodes).toEqual([]);
      expect(verdict.checks.deterministicRuns).toBe(10);
      expect(verdict.checks.deterministicFailures).toBe(10);
      expect(verdict.checks.buggyFails).toBe(true);
      expect(verdict.checks.sameFailureIdentity).toBe(true);
      expect(verdict.checks.referenceFixPasses).toBe(true);
      expect(verdict.checks.alternateFixPasses).toBe(true);
      expect(verdict.checks.decoyFixStillFails).toBe(true);
      expect(verdict.checks.offlineExecution).toBe(true);
      expect(verdict.checks.isolatedExecution).toBe(true);
      expect(verdict.checks.freshState).toBe(true);
    });

    describe('Stage C4 — Targeted Matrix Negative Controls', () => {
      const makeMockExec = (
        role: 'buggy' | 'reference' | 'alternate' | 'decoy',
        exitCode: number,
        passed: boolean,
        patchHash: string,
        overrides?: Partial<any>,
      ) => {
        const isBuggy = role === 'buggy';
        const rep = passed
          ? parseQs33TapReport(
              '1..56\n' +
                QS33_PASS_TO_PASS.map((n, i) => `ok ${i + 1} ${n}`).join('\n') +
                '\nok 56 parse parses plain objects correctly\n# tests 56\n# pass 56\n# fail 0',
              '',
            )
          : isBuggy
            ? parseQs33TapReport(
                '1..56\n' +
                  QS33_PASS_TO_PASS.map((n, i) => `ok ${i + 1} ${n}`).join('\n') +
                  '\nnot ok 40 parse parses plain objects correctly\n  TypeError: source.hasOwnProperty is not a function\n      at exports.clone (/case/lib/utils.js:47:20)\n# tests 56\n# pass 55\n# fail 1',
                '',
              )
            : parseQs33TapReport(
                '1..56\n' +
                  QS33_PASS_TO_PASS.map((n, i) => `ok ${i + 1} ${n}`).join('\n') +
                  '\nnot ok 40 parse parses plain objects correctly\n  AssertionError: expected { a: {} } to deeply equal { a: { b: \'c\' } }\n# tests 56\n# pass 55\n# fail 1',
                '',
              );

        const allFiles: Record<string, string> = {};
        for (const f of QS33_SOURCE_FILES) {
          allFiles[f] = f === QS33_TEST_FILE ? QS33_TEST_FILE_HASH : 'c'.repeat(64);
        }

        return {
          contract: 'external-official-suite-v1' as const,
          instanceId: 'qs__issue-33',
          baseCommit: QS33_BASE_COMMIT,
          runId: `mock-c4-${role}-${Date.now()}-${Math.random()}`,
          image: QS33_IMAGE,
          patchHash,
          testPatchHash: QS33_TEST_PATCH_HASH,
          candidateHash: sha256(QS33_CANDIDATE_TEST),
          sourceHashes: allFiles,
          executionStatus: 'COMPLETED' as const,
          exitCode,
          reportJson: rep.reportJson,
          reportHash: rep.reportHash,
          freshWorkspace: true,
          durationMs: 2000,
          isolation: {
            networkMode: 'none',
            user: '1000:1000',
            readonlyRoot: true,
            capDropAll: true,
            noNewPrivileges: true,
            cpus: 1,
            memoryBytes: 256 * 1024 * 1024,
            pidsLimit: 64,
            mounts: [{ type: 'tmpfs' as const, destination: '/tmp' as const }],
          },
          ...overrides,
        };
      };

      it('rejects incomplete buggy count (e.g. 9 instead of 10)', () => {
        const manifest = createQs33Manifest();
        const matrix = {
          buggy: Array(9)
            .fill(null)
            .map((_, i) =>
              makeMockExec('buggy', 1, false, '0'.repeat(64), { runId: `b-${i}` }),
            ),
          reference: Array(3)
            .fill(null)
            .map((_, i) =>
              makeMockExec('reference', 0, true, REFERENCE_PATCH_HASH, { runId: `r-${i}` }),
            ),
          alternate: Array(3)
            .fill(null)
            .map((_, i) =>
              makeMockExec('alternate', 0, true, ALTERNATE_PATCH_HASH, { runId: `a-${i}` }),
            ),
          decoy: makeMockExec('decoy', 1, false, DECOY_PATCH_HASH, { runId: 'd-1' }),
        };

        const verdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, matrix);
        expect(verdict.status).not.toBe('VERIFIED');
        expect(verdict.checks.buggyFails).toBe(false);
        expect(verdict.reasonCodes).toContain('BUGGY_FAILS_FAILED');
      });

      it('rejects incomplete reference count (e.g. 2 instead of 3)', () => {
        const manifest = createQs33Manifest();
        const matrix = {
          buggy: Array(10)
            .fill(null)
            .map((_, i) =>
              makeMockExec('buggy', 1, false, '0'.repeat(64), { runId: `b-${i}` }),
            ),
          reference: Array(2)
            .fill(null)
            .map((_, i) =>
              makeMockExec('reference', 0, true, REFERENCE_PATCH_HASH, { runId: `r-${i}` }),
            ),
          alternate: Array(3)
            .fill(null)
            .map((_, i) =>
              makeMockExec('alternate', 0, true, ALTERNATE_PATCH_HASH, { runId: `a-${i}` }),
            ),
          decoy: makeMockExec('decoy', 1, false, DECOY_PATCH_HASH, { runId: 'd-1' }),
        };

        const verdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, matrix);
        expect(verdict.status).not.toBe('VERIFIED');
        expect(verdict.checks.referenceFixPasses).toBe(false);
        expect(verdict.reasonCodes).toContain('REFERENCE_FIX_PASSES_FAILED');
      });

      it('rejects incomplete alternate count (e.g. 2 instead of 3)', () => {
        const manifest = createQs33Manifest();
        const matrix = {
          buggy: Array(10)
            .fill(null)
            .map((_, i) =>
              makeMockExec('buggy', 1, false, '0'.repeat(64), { runId: `b-${i}` }),
            ),
          reference: Array(3)
            .fill(null)
            .map((_, i) =>
              makeMockExec('reference', 0, true, REFERENCE_PATCH_HASH, { runId: `r-${i}` }),
            ),
          alternate: Array(2)
            .fill(null)
            .map((_, i) =>
              makeMockExec('alternate', 0, true, ALTERNATE_PATCH_HASH, { runId: `a-${i}` }),
            ),
          decoy: makeMockExec('decoy', 1, false, DECOY_PATCH_HASH, { runId: 'd-1' }),
        };

        const verdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, matrix);
        expect(verdict.status).not.toBe('VERIFIED');
        expect(verdict.checks.alternateFixPasses).toBe(false);
        expect(verdict.reasonCodes).toContain('ALTERNATE_FIX_PASSES_FAILED');
      });

      it('verifyQs33C4Expectations rejects matrix with fewer than 10 buggy runs', () => {
        const dummyResult = (role: string, exitCode: number, passed: boolean, patchHash: string): any => ({
          execution: makeMockExec(role as any, exitCode, passed, patchHash),
          supervisorResult: {
            runId: `run-${Math.random()}`,
            role,
            containerId: 'c1',
            exitCode,
            executionStatus: 'COMPLETED',
            stdout: '',
            stderr: '',
            durationMs: 1000,
            artifacts: { 'probe.json': Buffer.from(JSON.stringify({ exitCode })) },
            isolation: {
              networkMode: 'none',
              user: '1000:1000',
              readonlyRoot: true,
              capDropAll: true,
              noNewPrivileges: true,
              cpus: 1,
              memoryBytes: 256 * 1024 * 1024,
              pidsLimit: 64,
              mounts: [{ type: 'tmpfs', destination: '/tmp' }],
            },
            cleaned: true,
          },
          normalizedReport: parseQs33TapReport(
            exitCode === 0
              ? '1..56\n' + QS33_PASS_TO_PASS.map((n, i) => `ok ${i + 1} ${n}`).join('\n') + '\nok 56 parse parses plain objects correctly'
              : '1..56\n' + QS33_PASS_TO_PASS.map((n, i) => `ok ${i + 1} ${n}`).join('\n') + '\nnot ok 40 parse parses plain objects correctly\n  TypeError: source.hasOwnProperty is not a function\n      at exports.clone (/case/lib/utils.js:47:20)',
            '',
          ),
          probeReport: {
            passed,
            serializedOutput: passed ? '{"a":{"b":"c"}}' : null,
            error: passed ? null : { type: 'TypeError', message: 'source.hasOwnProperty is not a function', topApplicationFrame: 'at exports.clone (/case/lib/utils.js:47:20)' },
          },
        });

        const shortMatrix = {
          buggy: Array(9).fill(null).map(() => dummyResult('buggy', 1, false, '0'.repeat(64))),
          reference: Array(3).fill(null).map(() => dummyResult('reference', 0, true, REFERENCE_PATCH_HASH)),
          alternate: Array(3).fill(null).map(() => dummyResult('alternate', 0, true, ALTERNATE_PATCH_HASH)),
          decoy: dummyResult('decoy', 1, false, DECOY_PATCH_HASH),
        };

        const rep = verifyQs33C4Expectations(shortMatrix);
        expect(rep.passed).toBe(false);
        expect(rep.errors).toContain('Total executions must be exactly 17, got 16');
        expect(rep.errors).toContain('Buggy executions count must be 10, got 9');
      });

      it('verifyQs33C4Expectations rejects matrix with tampered or substituted test identities', () => {
        const failTestName: string = QS33_FAIL_TO_PASS[0]!;
        const dummyResult = (role: string, exitCode: number, passed: boolean, patchHash: string, customTests?: string[]): any => ({
          execution: makeMockExec(role as any, exitCode, passed, patchHash),
          supervisorResult: {
            runId: `run-${Math.random()}`,
            role,
            containerId: 'c1',
            exitCode,
            executionStatus: 'COMPLETED',
            stdout: '',
            stderr: '',
            durationMs: 1000,
            artifacts: { 'probe.json': Buffer.from(JSON.stringify({ exitCode })) },
            isolation: {
              networkMode: 'none',
              user: '1000:1000',
              readonlyRoot: true,
              capDropAll: true,
              noNewPrivileges: true,
              cpus: 1,
              memoryBytes: 256 * 1024 * 1024,
              pidsLimit: 64,
              mounts: [{ type: 'tmpfs', destination: '/tmp' }],
            },
            cleaned: true,
          },
          normalizedReport: {
            reportJson: '{}',
            reportHash: 'a'.repeat(64),
            parsedReport: {
              reporter: 'official-suite-normalized-v1' as const,
              tests: (customTests ?? [...QS33_PASS_TO_PASS.slice(0, 39), failTestName, ...QS33_PASS_TO_PASS.slice(39)]).map((name, i) => ({
                name,
                status: (exitCode === 0 || i !== 39 ? 'passed' : 'failed') as any,
                failure: exitCode === 0 || i !== 39 ? null : { type: 'TypeError', topApplicationFrame: 'at exports.clone (/case/lib/utils.js:47:20)' },
              })),
            },
          },
          probeReport: {
            passed,
            serializedOutput: passed ? '{"a":{"b":"c"}}' : null,
            error: passed ? null : { type: 'TypeError', message: 'source.hasOwnProperty is not a function', topApplicationFrame: 'at exports.clone (/case/lib/utils.js:47:20)' },
          },
        });

        // Matrix where an authentic test identity is replaced with an unauthorized test name
        const tamperedNames: string[] = [...QS33_PASS_TO_PASS.slice(0, 38), 'unauthorized rogue test', failTestName, ...QS33_PASS_TO_PASS.slice(39)];
        const tamperedMatrix = {
          buggy: Array(10).fill(null).map(() => dummyResult('buggy', 1, false, '0'.repeat(64), tamperedNames)),
          reference: Array(3).fill(null).map(() => dummyResult('reference', 0, true, REFERENCE_PATCH_HASH, tamperedNames)),
          alternate: Array(3).fill(null).map(() => dummyResult('alternate', 0, true, ALTERNATE_PATCH_HASH, tamperedNames)),
          decoy: dummyResult('decoy', 1, false, DECOY_PATCH_HASH, tamperedNames),
        };

        const rep = verifyQs33C4Expectations(tamperedMatrix);
        expect(rep.passed).toBe(false);
        expect(rep.errors).toContain('Official 56 test identities and ordering must match across all 17 executions');
      });

      it('verifyQs33C4Expectations rejects matrix with corrupted patch hash', () => {
        const failTestName: string = QS33_FAIL_TO_PASS[0]!;
        const dummyResult = (role: string, exitCode: number, passed: boolean, patchHash: string): any => ({
          execution: makeMockExec(role as any, exitCode, passed, patchHash),
          supervisorResult: {
            runId: `run-${Math.random()}`,
            role,
            containerId: 'c1',
            exitCode,
            executionStatus: 'COMPLETED',
            stdout: '',
            stderr: '',
            durationMs: 1000,
            artifacts: { 'probe.json': Buffer.from(JSON.stringify({ exitCode })) },
            isolation: {
              networkMode: 'none',
              user: '1000:1000',
              readonlyRoot: true,
              capDropAll: true,
              noNewPrivileges: true,
              cpus: 1,
              memoryBytes: 256 * 1024 * 1024,
              pidsLimit: 64,
              mounts: [{ type: 'tmpfs', destination: '/tmp' }],
            },
            cleaned: true,
          },
          normalizedReport: {
            reportJson: '{}',
            reportHash: 'a'.repeat(64),
            parsedReport: {
              reporter: 'official-suite-normalized-v1' as const,
              tests: [...QS33_PASS_TO_PASS.slice(0, 39), failTestName, ...QS33_PASS_TO_PASS.slice(39)].map((name, i) => ({
                name,
                status: (exitCode === 0 || i !== 39 ? 'passed' : 'failed') as any,
                failure: exitCode === 0 || i !== 39 ? null : { type: 'TypeError', topApplicationFrame: 'at exports.clone (/case/lib/utils.js:47:20)' },
              })),
            },
          },
          probeReport: {
            passed,
            serializedOutput: passed ? '{"a":{"b":"c"}}' : null,
            error: passed ? null : { type: 'TypeError', message: 'source.hasOwnProperty is not a function', topApplicationFrame: 'at exports.clone (/case/lib/utils.js:47:20)' },
          },
        });

        const corruptedMatrix = {
          buggy: Array(10).fill(null).map(() => dummyResult('buggy', 1, false, '0'.repeat(64))),
          reference: Array(3).fill(null).map(() => dummyResult('reference', 0, true, 'badbeef'.repeat(9) + 'bad')),
          alternate: Array(3).fill(null).map(() => dummyResult('alternate', 0, true, ALTERNATE_PATCH_HASH)),
          decoy: dummyResult('decoy', 1, false, DECOY_PATCH_HASH),
        };

        const rep = verifyQs33C4Expectations(corruptedMatrix);
        expect(rep.passed).toBe(false);
        expect(rep.errors.some((e) => e.includes('REFERENCE_PATCH_HASH'))).toBe(true);
      });

      it('verifyQs33C4Expectations rejects matrix with compromised isolation', () => {
        const failTestName: string = QS33_FAIL_TO_PASS[0]!;
        const dummyResult = (role: string, exitCode: number, passed: boolean, patchHash: string, networkMode = 'none'): any => ({
          execution: makeMockExec(role as any, exitCode, passed, patchHash, {
            isolation: {
              networkMode,
              user: '1000:1000',
              readonlyRoot: true,
              capDropAll: true,
              noNewPrivileges: true,
              cpus: 1,
              memoryBytes: 256 * 1024 * 1024,
              pidsLimit: 64,
              mounts: [{ type: 'tmpfs', destination: '/tmp' }],
            },
          }),
          supervisorResult: {
            runId: `run-${Math.random()}`,
            role,
            containerId: 'c1',
            exitCode,
            executionStatus: 'COMPLETED',
            stdout: '',
            stderr: '',
            durationMs: 1000,
            artifacts: { 'probe.json': Buffer.from(JSON.stringify({ exitCode })) },
            isolation: {
              networkMode,
              user: '1000:1000',
              readonlyRoot: true,
              capDropAll: true,
              noNewPrivileges: true,
              cpus: 1,
              memoryBytes: 256 * 1024 * 1024,
              pidsLimit: 64,
              mounts: [{ type: 'tmpfs', destination: '/tmp' }],
            },
            cleaned: true,
          },
          normalizedReport: {
            reportJson: '{}',
            reportHash: 'a'.repeat(64),
            parsedReport: {
              reporter: 'official-suite-normalized-v1' as const,
              tests: [...QS33_PASS_TO_PASS.slice(0, 39), failTestName, ...QS33_PASS_TO_PASS.slice(39)].map((name, i) => ({
                name,
                status: (exitCode === 0 || i !== 39 ? 'passed' : 'failed') as any,
                failure: exitCode === 0 || i !== 39 ? null : { type: 'TypeError', topApplicationFrame: 'at exports.clone (/case/lib/utils.js:47:20)' },
              })),
            },
          },
          probeReport: {
            passed,
            serializedOutput: passed ? '{"a":{"b":"c"}}' : null,
            error: passed ? null : { type: 'TypeError', message: 'source.hasOwnProperty is not a function', topApplicationFrame: 'at exports.clone (/case/lib/utils.js:47:20)' },
          },
        });

        const compromisedMatrix = {
          buggy: Array(10).fill(null).map((_, i) => dummyResult('buggy', 1, false, '0'.repeat(64), i === 0 ? 'bridge' : 'none')),
          reference: Array(3).fill(null).map(() => dummyResult('reference', 0, true, REFERENCE_PATCH_HASH)),
          alternate: Array(3).fill(null).map(() => dummyResult('alternate', 0, true, ALTERNATE_PATCH_HASH)),
          decoy: dummyResult('decoy', 1, false, DECOY_PATCH_HASH),
        };

        const rep = verifyQs33C4Expectations(compromisedMatrix);
        expect(rep.passed).toBe(false);
        expect(rep.errors).toContain('Offline isolation (--network none) must be enforced for all 17 executions');
      });
    });
  });
});


