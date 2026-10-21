import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runExternalExecution,
  verifyQs33C3Expectations,
  QS33_BASE_COMMIT,
  REFERENCE_PATCH_HASH,
  ALTERNATE_PATCH_HASH,
  DECOY_PATCH_HASH,
} from '../../packages/runtime/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

export async function runGateC3(options?: { evidenceDir?: string; repoRoot?: string }) {
  const repoRoot = options?.repoRoot ?? path.resolve(__dirname, '..', '..');
  const liveEvidenceDir =
    options?.evidenceDir ??
    path.join(repoRoot, 'work', 'phase2', 'gate-c-runs', 'qs33-c3-live-01');
  await mkdir(liveEvidenceDir, { recursive: true });

  const referenceRunId = `c3-live-reference-${Date.now()}`;
  console.log(`[Gate C3] Executing authentic reference fix (${REFERENCE_PATCH_HASH}) as ${referenceRunId}...`);
  const referenceResult = await runExternalExecution({
    runId: referenceRunId,
    role: 'reference',
    repoRoot,
    timeoutSeconds: 30,
    evidenceDir: path.join(liveEvidenceDir, 'evidence-reference'),
  });

  const alternateRunId = `c3-live-alternate-${Date.now()}`;
  console.log(`[Gate C3] Executing alternate correct fix (${ALTERNATE_PATCH_HASH}) as ${alternateRunId}...`);
  const alternateResult = await runExternalExecution({
    runId: alternateRunId,
    role: 'alternate',
    repoRoot,
    timeoutSeconds: 30,
    evidenceDir: path.join(liveEvidenceDir, 'evidence-alternate'),
  });

  const decoyRunId = `c3-live-decoy-${Date.now()}`;
  console.log(`[Gate C3] Executing incorrect decoy fix (${DECOY_PATCH_HASH}) as ${decoyRunId}...`);
  const decoyResult = await runExternalExecution({
    runId: decoyRunId,
    role: 'decoy',
    repoRoot,
    timeoutSeconds: 30,
    evidenceDir: path.join(liveEvidenceDir, 'evidence-decoy'),
  });

  console.log('[Gate C3] Verifying positive expectations against live candidate triplet...');
  const verification = verifyQs33C3Expectations(referenceResult, alternateResult, decoyResult);
  if (!verification.passed) {
    console.error('C3 verification failed:', verification.errors);
    throw new Error(`C3 verification failed: ${verification.errors.join(', ')}`);
  }

  // Hash all 27 artifacts in evidence-reference, evidence-alternate, evidence-decoy
  const artifactHashes: Record<string, string> = {};
  for (const roleDir of ['evidence-reference', 'evidence-alternate', 'evidence-decoy']) {
    const roleDirPath = path.join(liveEvidenceDir, roleDir);
    const files = (await readdir(roleDirPath)).sort();
    for (const f of files) {
      const buf = await readFile(path.join(roleDirPath, f));
      artifactHashes[`${roleDir}/${f}`] = sha256(buf);
    }
  }

  await writeFile(
    path.join(liveEvidenceDir, 'artifact-sha256.json'),
    JSON.stringify(artifactHashes, null, 2) + '\n',
    'utf8',
  );

  const decTest40 = decoyResult.normalizedReport.parsedReport.tests.find(
    (t) => t.name === 'parse parses plain objects correctly',
  );
  const decPassed = decoyResult.normalizedReport.parsedReport.tests.filter(
    (t) => t.status === 'passed',
  );

  const summary = {
    gate: 'Gate C3',
    timestamp: new Date().toISOString(),
    status: 'PASS',
    referenceRun: {
      runId: referenceRunId,
      baseCommit: QS33_BASE_COMMIT,
      patchHash: referenceResult.execution.patchHash,
      exitCode: referenceResult.execution.exitCode,
      testsTotal: referenceResult.normalizedReport.parsedReport.tests.length,
      testsPassed: referenceResult.normalizedReport.parsedReport.tests.length,
      probePassed: referenceResult.probeReport.passed,
      probeOutput: referenceResult.probeReport.serializedOutput,
    },
    alternateRun: {
      runId: alternateRunId,
      baseCommit: QS33_BASE_COMMIT,
      patchHash: alternateResult.execution.patchHash,
      exitCode: alternateResult.execution.exitCode,
      testsTotal: alternateResult.normalizedReport.parsedReport.tests.length,
      testsPassed: alternateResult.normalizedReport.parsedReport.tests.length,
      probePassed: alternateResult.probeReport.passed,
      probeOutput: alternateResult.probeReport.serializedOutput,
    },
    decoyRun: {
      runId: decoyRunId,
      baseCommit: QS33_BASE_COMMIT,
      patchHash: decoyResult.execution.patchHash,
      exitCode: decoyResult.execution.exitCode,
      testsTotal: decoyResult.normalizedReport.parsedReport.tests.length,
      testsPassed: decPassed.length,
      failingTest: decTest40?.name,
      failureType: decTest40?.failure?.type,
      failureFrame: decTest40?.failure?.topApplicationFrame,
      probePassed: decoyResult.probeReport.passed,
      probeOutput: decoyResult.probeReport.serializedOutput,
      probeError: decoyResult.probeReport.error?.type,
    },
    verification: verification.checks,
  };

  await writeFile(
    path.join(liveEvidenceDir, 'c3-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf8',
  );

  console.log('[Gate C3] Execution and evidence recording completed successfully.');
  return { referenceResult, alternateResult, decoyResult, verification, artifactHashes, summary };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runGateC3()
    .then((res) => {
      console.log('Recorded summary:');
      console.log(JSON.stringify(res.summary, null, 2));
    })
    .catch((err) => {
      console.error('Fatal error in run-gate-c3:', err);
      process.exit(1);
    });
}
