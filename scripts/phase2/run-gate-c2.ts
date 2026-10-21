import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runExternalExecution,
  verifyQs33C2Expectations,
  QS33_BASE_COMMIT,
  QS33_FIXED_COMMIT,
} from '../../packages/runtime/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

export async function runGateC2(options?: { evidenceDir?: string; repoRoot?: string }) {
  const repoRoot = options?.repoRoot ?? path.resolve(__dirname, '..', '..');
  const liveEvidenceDir =
    options?.evidenceDir ??
    path.join(repoRoot, 'work', 'phase2', 'gate-c-runs', 'qs33-c2-live-01');
  await mkdir(liveEvidenceDir, { recursive: true });

  const buggyRunId = `c2-live-buggy-${Date.now()}`;
  console.log(`[Gate C2] Executing pinned buggy revision (${QS33_BASE_COMMIT}) as ${buggyRunId}...`);
  const buggyResult = await runExternalExecution({
    runId: buggyRunId,
    role: 'buggy',
    repoRoot,
    timeoutSeconds: 30,
    evidenceDir: path.join(liveEvidenceDir, 'evidence-buggy'),
  });

  const fixedRunId = `c2-live-fixed-${Date.now()}`;
  console.log(`[Gate C2] Executing pinned fixed revision (${QS33_FIXED_COMMIT}) as ${fixedRunId}...`);
  const fixedResult = await runExternalExecution({
    runId: fixedRunId,
    role: 'reference',
    repoRoot,
    timeoutSeconds: 30,
    evidenceDir: path.join(liveEvidenceDir, 'evidence-fixed'),
  });

  console.log('[Gate C2] Verifying positive expectations against live execution pair...');
  const verification = verifyQs33C2Expectations(buggyResult, fixedResult);
  if (!verification.passed) {
    console.error('C2 verification failed:', verification.errors);
    throw new Error(`C2 verification failed: ${verification.errors.join(', ')}`);
  }

  // Hash all artifacts in evidence-buggy and evidence-fixed
  const artifactHashes: Record<string, string> = {};
  for (const roleDir of ['evidence-buggy', 'evidence-fixed']) {
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

  const test40 = buggyResult.normalizedReport.parsedReport.tests.find(
    (t) => t.name === 'parse parses plain objects correctly',
  );
  const buggyPassed = buggyResult.normalizedReport.parsedReport.tests.filter(
    (t) => t.status === 'passed',
  );
  const fixedTests = fixedResult.normalizedReport.parsedReport.tests;

  const summary = {
    gate: 'Gate C2',
    timestamp: new Date().toISOString(),
    status: 'PASS',
    buggyRun: {
      runId: buggyRunId,
      commit: QS33_BASE_COMMIT,
      exitCode: buggyResult.execution.exitCode,
      testsTotal: buggyResult.normalizedReport.parsedReport.tests.length,
      testsPassed: buggyPassed.length,
      failingTest: test40?.name,
      failureType: test40?.failure?.type,
      failureFrame: test40?.failure?.topApplicationFrame,
      probePassed: buggyResult.probeReport.passed,
      probeError: buggyResult.probeReport.error?.type,
    },
    fixedRun: {
      runId: fixedRunId,
      commit: QS33_FIXED_COMMIT,
      exitCode: fixedResult.execution.exitCode,
      testsTotal: fixedTests.length,
      testsPassed: fixedTests.length,
      probePassed: fixedResult.probeReport.passed,
      probeOutput: fixedResult.probeReport.serializedOutput,
    },
    verification: verification.checks,
  };

  await writeFile(
    path.join(liveEvidenceDir, 'c2-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf8',
  );

  console.log('[Gate C2] Execution and evidence recording completed successfully.');
  return { buggyResult, fixedResult, verification, artifactHashes, summary };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runGateC2()
    .then((res) => {
      console.log('Recorded summary:');
      console.log(JSON.stringify(res.summary, null, 2));
    })
    .catch((err) => {
      console.error('Fatal error in run-gate-c2:', err);
      process.exit(1);
    });
}
