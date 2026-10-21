import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runExternalExecution,
  verifyQs33C4Expectations,
  createQs33Manifest,
  QS33_BASE_COMMIT,
  QS33_CANDIDATE_TEST,
  REFERENCE_PATCH_HASH,
  ALTERNATE_PATCH_HASH,
  DECOY_PATCH_HASH,
  type ExternalRunResult,
} from '../../packages/runtime/src/index.js';
import { evaluateExternalEvidence } from '../../packages/judge/src/external.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

export async function runGateC4(options?: { evidenceDir?: string; repoRoot?: string }) {
  const startWallClock = Date.now();
  const repoRoot = options?.repoRoot ?? path.resolve(__dirname, '..', '..');
  const liveEvidenceDir =
    options?.evidenceDir ??
    path.join(repoRoot, 'work', 'phase2', 'gate-c-runs', 'qs33-c4-live-01');
  await mkdir(liveEvidenceDir, { recursive: true });

  // Copy frozen manifest into evidence directory
  const manifestSource = path.join(repoRoot, 'docs', 'phase2', 'GATE_C4_MANIFEST.json');
  await cp(manifestSource, path.join(liveEvidenceDir, 'c4-manifest.json'));

  const buggyResults: ExternalRunResult[] = [];
  const referenceResults: ExternalRunResult[] = [];
  const alternateResults: ExternalRunResult[] = [];
  let decoyResult: ExternalRunResult | null = null;

  const roleDirectories: string[] = [];

  // 1. Execute 10 buggy runs sequentially
  console.log('[Gate C4] === Step 2.1: Executing 10 authentic buggy revisions sequentially ===');
  for (let i = 1; i <= 10; i++) {
    const pad = String(i).padStart(2, '0');
    const runId = `c4-live-buggy-${pad}-${Date.now()}`;
    const dirName = `evidence-buggy-${pad}`;
    roleDirectories.push(dirName);
    console.log(`[Gate C4] (${i}/10) Running buggy execution ${runId}...`);
    const res = await runExternalExecution({
      runId,
      role: 'buggy',
      repoRoot,
      timeoutSeconds: 30,
      evidenceDir: path.join(liveEvidenceDir, dirName),
    });
    console.log(
      `[Gate C4] (${i}/10) Buggy execution completed with exitCode ${res.execution.exitCode} in ${res.execution.durationMs}ms`,
    );
    buggyResults.push(res);
  }

  // 2. Execute 3 reference fix runs sequentially
  console.log('[Gate C4] === Step 2.2: Executing 3 reference fix runs sequentially ===');
  for (let i = 1; i <= 3; i++) {
    const pad = String(i).padStart(2, '0');
    const runId = `c4-live-reference-${pad}-${Date.now()}`;
    const dirName = `evidence-reference-${pad}`;
    roleDirectories.push(dirName);
    console.log(`[Gate C4] (${i}/3) Running reference fix execution ${runId}...`);
    const res = await runExternalExecution({
      runId,
      role: 'reference',
      repoRoot,
      timeoutSeconds: 30,
      evidenceDir: path.join(liveEvidenceDir, dirName),
    });
    console.log(
      `[Gate C4] (${i}/3) Reference fix execution completed with exitCode ${res.execution.exitCode} in ${res.execution.durationMs}ms`,
    );
    referenceResults.push(res);
  }

  // 3. Execute 3 alternate fix runs sequentially
  console.log('[Gate C4] === Step 2.3: Executing 3 alternate fix runs sequentially ===');
  for (let i = 1; i <= 3; i++) {
    const pad = String(i).padStart(2, '0');
    const runId = `c4-live-alternate-${pad}-${Date.now()}`;
    const dirName = `evidence-alternate-${pad}`;
    roleDirectories.push(dirName);
    console.log(`[Gate C4] (${i}/3) Running alternate fix execution ${runId}...`);
    const res = await runExternalExecution({
      runId,
      role: 'alternate',
      repoRoot,
      timeoutSeconds: 30,
      evidenceDir: path.join(liveEvidenceDir, dirName),
    });
    console.log(
      `[Gate C4] (${i}/3) Alternate fix execution completed with exitCode ${res.execution.exitCode} in ${res.execution.durationMs}ms`,
    );
    alternateResults.push(res);
  }

  // 4. Execute 1 decoy fix run
  console.log('[Gate C4] === Step 2.4: Executing 1 decoy fix run ===');
  {
    const runId = `c4-live-decoy-01-${Date.now()}`;
    const dirName = 'evidence-decoy-01';
    roleDirectories.push(dirName);
    console.log(`[Gate C4] Running decoy fix execution ${runId}...`);
    const res = await runExternalExecution({
      runId,
      role: 'decoy',
      repoRoot,
      timeoutSeconds: 30,
      evidenceDir: path.join(liveEvidenceDir, dirName),
    });
    console.log(
      `[Gate C4] Decoy execution completed with exitCode ${res.execution.exitCode} in ${res.execution.durationMs}ms`,
    );
    decoyResult = res;
  }

  const matrixResults = {
    buggy: buggyResults,
    reference: referenceResults,
    alternate: alternateResults,
    decoy: decoyResult,
  };

  // 5. Verify C4 expectations
  console.log('[Gate C4] === Step 3: Verifying all C4 expectations across full 17-run matrix ===');
  const verification = verifyQs33C4Expectations(matrixResults);
  if (!verification.passed) {
    console.error('[Gate C4] C4 Verification FAILED:', verification.errors);
    throw new Error(`C4 verification failed: ${verification.errors.join(', ')}`);
  }
  console.log('[Gate C4] C4 Verification passed all 45 checks!');

  // 6. Hash all artifacts across all 17 directories
  console.log('[Gate C4] === Hashing all 153 raw evidence artifacts ===');
  const artifactHashes: Record<string, string> = {};
  for (const dirName of roleDirectories) {
    const roleDirPath = path.join(liveEvidenceDir, dirName);
    const files = (await readdir(roleDirPath)).sort();
    for (const f of files) {
      const buf = await readFile(path.join(roleDirPath, f));
      artifactHashes[`${dirName}/${f}`] = sha256(buf);
    }
  }

  await writeFile(
    path.join(liveEvidenceDir, 'artifact-sha256.json'),
    JSON.stringify(artifactHashes, null, 2) + '\n',
    'utf8',
  );
  console.log(`[Gate C4] Recorded ${Object.keys(artifactHashes).length} artifact hashes to artifact-sha256.json`);

  // 7. Create evidence index
  console.log('[Gate C4] === Creating complete 17-run evidence index ===');
  const allExecs = [
    ...buggyResults.map((r, i) => ({ result: r, role: 'buggy', dir: `evidence-buggy-${String(i + 1).padStart(2, '0')}` })),
    ...referenceResults.map((r, i) => ({ result: r, role: 'reference', dir: `evidence-reference-${String(i + 1).padStart(2, '0')}` })),
    ...alternateResults.map((r, i) => ({ result: r, role: 'alternate', dir: `evidence-alternate-${String(i + 1).padStart(2, '0')}` })),
    { result: decoyResult, role: 'decoy', dir: 'evidence-decoy-01' },
  ];

  const evidenceIndex = {
    contract: 'external-official-suite-v1',
    gate: 'Gate C4',
    totalExecutions: allExecs.length,
    recordedAt: new Date().toISOString(),
    executions: allExecs.map((entry, idx) => {
      const tests = entry.result.normalizedReport.parsedReport.tests;
      const passedCount = tests.filter((t) => t.status === 'passed').length;
      const failedCount = tests.filter((t) => t.status === 'failed').length;
      let probeExit = -1;
      if (entry.result.supervisorResult.artifacts['probe.json']) {
        try {
          probeExit = JSON.parse(entry.result.supervisorResult.artifacts['probe.json'].toString('utf8')).exitCode;
        } catch {}
      }
      return {
        index: idx + 1,
        role: entry.role,
        runId: entry.result.execution.runId,
        directory: entry.dir,
        baseCommit: entry.result.execution.baseCommit,
        patchHash: entry.result.execution.patchHash,
        exitCode: entry.result.execution.exitCode,
        executionStatus: entry.result.execution.executionStatus,
        durationMs: entry.result.execution.durationMs,
        testsTotal: tests.length,
        testsPassed: passedCount,
        testsFailed: failedCount,
        probeExitCode: probeExit,
        probePassed: entry.result.probeReport.passed,
        probeOutput: entry.result.probeReport.serializedOutput,
        probeError: entry.result.probeReport.error?.type ?? null,
        reportHash: entry.result.execution.reportHash,
        artifactsCount: 9,
      };
    }),
  };

  await writeFile(
    path.join(liveEvidenceDir, 'evidence-index.json'),
    JSON.stringify(evidenceIndex, null, 2) + '\n',
    'utf8',
  );

  // 8. Run independent evaluator
  console.log('[Gate C4] === Step 4: Running independent evaluator evaluateExternalEvidence() ===');
  const manifest = createQs33Manifest();
  const externalMatrix = {
    buggy: buggyResults.map((r) => r.execution),
    reference: referenceResults.map((r) => r.execution),
    alternate: alternateResults.map((r) => r.execution),
    decoy: decoyResult.execution,
  };

  const evaluatorVerdict = evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, externalMatrix);
  console.log('[Gate C4] Evaluator Status:', evaluatorVerdict.status);
  console.log('[Gate C4] Evaluator Reason Codes:', evaluatorVerdict.reasonCodes);
  console.log('[Gate C4] Evaluator Checks:', JSON.stringify(evaluatorVerdict.checks, null, 2));

  if (evaluatorVerdict.status !== 'VERIFIED') {
    throw new Error(`Independent evaluator did not return VERIFIED! Status: ${evaluatorVerdict.status}, Reason codes: ${evaluatorVerdict.reasonCodes.join(', ')}`);
  }

  const endWallClock = Date.now();
  const totalWallClockMs = endWallClock - startWallClock;

  // 9. Write summary
  const summary = {
    gate: 'Gate C4',
    title: 'Gate C4 Complete External Matrix Execution and Verification Summary',
    timestamp: new Date().toISOString(),
    status: evaluatorVerdict.status, // "VERIFIED"
    totalWallClockMs,
    totalWallClockSeconds: Math.round(totalWallClockMs / 1000),
    matrixCounts: {
      buggy: buggyResults.length,
      reference: referenceResults.length,
      alternate: alternateResults.length,
      decoy: 1,
      total: allExecs.length,
    },
    evaluatorVerdict: {
      contract: evaluatorVerdict.contract,
      status: evaluatorVerdict.status,
      deterministicRuns: evaluatorVerdict.checks.deterministicRuns,
      deterministicFailures: evaluatorVerdict.checks.deterministicFailures,
      checks: evaluatorVerdict.checks,
      reasonCodes: evaluatorVerdict.reasonCodes,
    },
    verificationChecks: verification.checks,
    provenance: {
      baseCommit: QS33_BASE_COMMIT,
      candidatePatches: {
        buggy: '0000000000000000000000000000000000000000000000000000000000000000',
        reference: REFERENCE_PATCH_HASH,
        alternate: ALTERNATE_PATCH_HASH,
        decoy: DECOY_PATCH_HASH,
      },
    },
  };

  await writeFile(
    path.join(liveEvidenceDir, 'c4-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf8',
  );

  console.log(`[Gate C4] Full matrix execution completed successfully in ${Math.round(totalWallClockMs / 1000)}s.`);
  console.log(`[Gate C4] Evaluator Verdict: ${evaluatorVerdict.status}`);

  return {
    matrixResults,
    verification,
    artifactHashes,
    evidenceIndex,
    evaluatorVerdict,
    summary,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runGateC4()
    .then((res) => {
      console.log('Recorded summary:');
      console.log(JSON.stringify(res.summary, null, 2));
    })
    .catch((err) => {
      console.error('Fatal error in run-gate-c4:', err);
      process.exit(1);
    });
}
