import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProductionIncidentContext } from '../../packages/contracts/src/incident-context.js';
import {
  createFastifyPreset,
  normalizeGenericTestOutput,
  stageGenericPayload,
} from '../../packages/runtime/src/adapters/generic-adapter.js';
import { generateRegressionTest } from '../../packages/runtime/src/ai-generator.js';
import { runExternalContainer, type SupervisorExecutionResult } from '../../packages/runtime/src/external-supervisor.js';

const sha256 = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

const REPO_ROOT = process.cwd();
const PHASE4_WORK_DIR = path.join(REPO_ROOT, 'work', 'phase4');
const SANITIZED_WORKSPACE_DIR = path.join(PHASE4_WORK_DIR, 'sanitized-buggy-workspace');
const BUNDLE_MODULES_DIR = path.join(PHASE4_WORK_DIR, 'fastify-bundle', 'node_modules');
const INCIDENT_DIR = path.join(PHASE4_WORK_DIR, 'incident-context');
const GENERATOR_DIR = path.join(PHASE4_WORK_DIR, 'generator-runs');
const CONTROL_DIR = path.join(PHASE4_WORK_DIR, 'control-runs');
const EVALUATOR_DIR = path.join(PHASE4_WORK_DIR, 'evaluator-runs');
const PATCHES_DIR = path.join(REPO_ROOT, 'packages', 'runtime', 'src', 'patches', 'fastify4807');

async function main() {
  console.log('=== ReplayKit Phase 4: Blind AI Test-Generation & Real-World Generalization ===\n');

  await mkdir(PHASE4_WORK_DIR, { recursive: true });
  await mkdir(INCIDENT_DIR, { recursive: true });
  await mkdir(GENERATOR_DIR, { recursive: true });
  await mkdir(CONTROL_DIR, { recursive: true });
  await mkdir(EVALUATOR_DIR, { recursive: true });

  // -------------------------------------------------------------
  // STAGE S2: Prepare Production Incident Evidence
  // -------------------------------------------------------------
  console.log('--- Stage S2: Preparing Incident Evidence ---');

  const baseCommit = '61b86760019c85afbef6cc0f175c75870381ed04';

  // 1. Contract-Conditioned Incident Context
  const contractConditionedIncident: ProductionIncidentContext = {
    schemaVersion: 'incident-context-v1',
    incidentId: 'f4807-61b86760-4826-40e8-88ab-c215d2a93170',
    createdAt: '2026-10-20T12:00:00Z',
    sourceRevision: {
      gitSha: baseCommit,
      repository: 'https://github.com/fastify/fastify.git',
      branch: 'main',
    },
    error: {
      type: 'TypeError',
      value: "Cannot read properties of undefined (reading 'config')",
      topApplicationFrame: 'at Request.get (/case/lib/request.js:204:55)',
      frames: [
        {
          filename: '/case/lib/request.js',
          function: 'Request.get routeConfig',
          lineno: 204,
          colno: 55,
          inApp: true,
          contextLine: '      return this[kRouteContext][kPublicRouteContext].config',
        },
        {
          filename: '/case/fastify.js',
          function: 'onBadUrl',
          lineno: 699,
          colno: 14,
          inApp: true,
        },
      ],
      handled: false,
    },
    request: {
      method: 'GET',
      url: 'http://localhost/test/%world',
      path: '/test/%world',
      headers: {
        accept: 'text/plain',
      },
      bodySanitized: null,
    },
    breadcrumbs: [
      {
        timestamp: '2026-10-20T11:59:58Z',
        category: 'http',
        level: 'error',
        message:
          'Triggering input: GET /test/%world sent with malformed URI component, triggering frameworkErrors handler where req.routeConfig is accessed before routing completes',
      },
    ],
    runtime: {
      nodeVersion: 'v22.23.3',
      os: 'linux',
      arch: 'x64',
      containerImageDigest:
        'node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392',
      environmentVariables: {
        NODE_ENV: { valueRedacted: 'production', isSecret: false },
      },
    },
    oracle: {
      sourceType: 'upstream_issue_spec',
      confidence: 'definitive',
      expectedOutcome: {
        shouldThrow: false,
        expectedReturnValue: undefined,
      },
      specification:
        'Upstream API Specification: When a request fails early due to an invalid URL or framework error before routing completes, req.routeConfig, req.routerPath, and req.routerMethod must return undefined rather than throwing an unhandled TypeError. A custom frameworkErrors handler must be able to inspect req.routeConfig (which evaluates strictly to undefined) and safely return an HTTP error response.',
    },
    sufficiency: {
      status: 'SUFFICIENT',
      missingFields: [],
      blockingReason: null,
    },
  };

  // 2. Insufficient-Oracle Negative Control Context
  const insufficientOracleIncident: ProductionIncidentContext = {
    ...contractConditionedIncident,
    incidentId: 'f4807-control-insufficient-oracle-b052',
    oracle: {
      sourceType: 'inferred',
      confidence: 'ambiguous',
      expectedOutcome: {
        shouldThrow: false,
      },
    },
    sufficiency: {
      status: 'INSUFFICIENT_ORACLE',
      missingFields: ['oracle.specification', 'expectedOutcome.expectedReturnValue'],
      blockingReason:
        'No documented contract specifies whether routeConfig should evaluate to undefined, null, throw RouteNotFoundError, or return an empty object {}. Without a behavioral contract, expected output cannot be derived.',
    },
  };

  const contractConditionedJson = JSON.stringify(contractConditionedIncident, null, 2) + '\n';
  const insufficientOracleJson = JSON.stringify(insufficientOracleIncident, null, 2) + '\n';

  await writeFile(path.join(INCIDENT_DIR, 'contract-conditioned-incident.json'), contractConditionedJson);
  await writeFile(path.join(INCIDENT_DIR, 'insufficient-oracle-incident.json'), insufficientOracleJson);

  console.log('Saved incident payloads to work/phase4/incident-context/');
  console.log(`Contract-Conditioned Hash: ${sha256(contractConditionedJson)}`);
  console.log(`Insufficient-Oracle Hash:   ${sha256(insufficientOracleJson)}\n`);

  // -------------------------------------------------------------
  // STAGE S1: Blinding Audit of Sanitized Buggy Workspace
  // -------------------------------------------------------------
  console.log('--- Stage S1: Blinding Audit of Sanitized Buggy Workspace ---');

  const leakTokens = [
    'c2b89732d583a0e0d8e0a666b2eb9b62610edf34',
    'PR #4826',
    'pull/4826',
    'issues/4807',
  ];

  const auditedFiles: Array<{ path: string; sha256: string }> = [];
  const leakFindings: Array<{ file: string; token: string }> = [];

  async function scanDir(dir: string, relBase = '') {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await scanDir(full, rel);
      } else if (ent.isFile()) {
        const content = await readFile(full);
        auditedFiles.push({ path: rel, sha256: sha256(content) });
        const text = content.toString('utf8');
        for (const token of leakTokens) {
          if (text.includes(token)) {
            leakFindings.push({ file: rel, token });
          }
        }
      }
    }
  }

  await scanDir(SANITIZED_WORKSPACE_DIR);

  const blindingAudit = {
    auditedFilesCount: auditedFiles.length,
    leakFindingsCount: leakFindings.length,
    leakFindings,
    passed: leakFindings.length === 0,
    timestamp: new Date().toISOString(),
  };

  const manifest = {
    workspace: 'fastify-sanitized-buggy-v1',
    baseCommit,
    filesCount: auditedFiles.length,
    files: auditedFiles,
  };

  await writeFile(
    path.join(PHASE4_WORK_DIR, 'sanitized-workspace-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  await writeFile(
    path.join(PHASE4_WORK_DIR, 'blinding-audit.json'),
    JSON.stringify(blindingAudit, null, 2) + '\n',
  );

  console.log(`Audited ${blindingAudit.auditedFilesCount} files in sanitized workspace.`);
  console.log(`Leak Findings: ${blindingAudit.leakFindingsCount}`);
  console.log(`Blinding Audit Passed: ${blindingAudit.passed}\n`);

  if (!blindingAudit.passed) {
    throw new Error('BLINDING_AUDIT_FAILED: Cannot proceed with generation.');
  }

  // -------------------------------------------------------------
  // STAGE S3: AI Regression Test Generation (Qwen2.5-Coder via Ollama)
  // -------------------------------------------------------------
  console.log('--- Stage S3: AI Regression Test Generation (Qwen2.5-Coder via Ollama) ---');

  // Control Trial: Insufficient Oracle
  console.log('Running Insufficient-Oracle Negative Control Trial...');
  const controlResult = await generateRegressionTest(
    insufficientOracleIncident,
    SANITIZED_WORKSPACE_DIR,
    { model: 'qwen2.5-coder:3b' },
  );
  await writeFile(
    path.join(CONTROL_DIR, 'insufficient-oracle-result.json'),
    JSON.stringify(controlResult, null, 2) + '\n',
  );
  console.log(`Control Result Status: ${controlResult.status} (Reason: ${controlResult.reason})`);

  if (controlResult.status !== 'INSUFFICIENT_ORACLE') {
    throw new Error(`Control trial failed: expected INSUFFICIENT_ORACLE, got ${controlResult.status}`);
  }

  // Main Trial: Contract-Conditioned Synthesis
  console.log('\nRunning Contract-Conditioned AI Synthesis Trial...');
  const useFrozen =
    process.env.REPLAYKIT_USE_FROZEN_TEST === 'true' ||
    process.argv.includes('--frozen-test');

  let synthesisResult;
  if (useFrozen) {
    console.log('Using previously frozen test for evaluation (REPLAYKIT_USE_FROZEN_TEST enabled)...');
    const existingManifestRaw = await readFile(path.join(GENERATOR_DIR, 'generation-manifest.json'), 'utf8');
    synthesisResult = JSON.parse(existingManifestRaw);
  } else {
    synthesisResult = await generateRegressionTest(
      contractConditionedIncident,
      SANITIZED_WORKSPACE_DIR,
      { model: 'qwen2.5-coder:3b', temperature: 0.2 },
    );
  }

  if (synthesisResult.prompt) {
    await writeFile(path.join(GENERATOR_DIR, 'generator-prompt.txt'), synthesisResult.prompt, 'utf8');
  }
  await writeFile(
    path.join(GENERATOR_DIR, 'generator-input.json'),
    JSON.stringify(contractConditionedIncident, null, 2) + '\n',
    'utf8',
  );
  if (synthesisResult.rawModelResponse) {
    await writeFile(path.join(GENERATOR_DIR, 'raw-model-response.txt'), synthesisResult.rawModelResponse, 'utf8');
  }
  await writeFile(
    path.join(GENERATOR_DIR, 'generation-manifest.json'),
    JSON.stringify(synthesisResult, null, 2) + '\n',
    'utf8',
  );

  if (synthesisResult.status !== 'SYNTHESIS_SUCCESS' || !synthesisResult.testSource) {
    throw new Error(`AI Synthesis failed: ${synthesisResult.reason}`);
  }

  const frozenTestPath = path.join(GENERATOR_DIR, 'repro.test.js');
  await writeFile(frozenTestPath, synthesisResult.testSource, 'utf8');

  console.log(`Generated Test Frozen to: ${frozenTestPath}`);
  console.log(`Generated Test SHA-256:   ${synthesisResult.testSha256}`);
  console.log(`Generation Duration:      ${synthesisResult.durationMs}ms`);
  console.log('\nGenerated Test Source:\n----------------------------------------');
  console.log(synthesisResult.testSource);
  console.log('----------------------------------------\n');

  // -------------------------------------------------------------
  // STAGE S4: Hidden Four-Target Live Container Evaluation
  // -------------------------------------------------------------
  console.log('--- Stage S4: Hidden Four-Target Live Container Evaluation ---');
  console.log('Targets to evaluate: Buggy, Reference Fix, Alternate Fix, Decoy Fix\n');

  const config = createFastifyPreset();

  const referencePatch = await readFile(path.join(PATCHES_DIR, 'reference.patch'), 'utf8');
  const alternatePatch = await readFile(path.join(PATCHES_DIR, 'alternate.patch'), 'utf8');
  const decoyPatch = await readFile(path.join(PATCHES_DIR, 'decoy.patch'), 'utf8');

  const candidatePatches = {
    reference: referencePatch,
    alternate: alternatePatch,
    decoy: decoyPatch,
  };

  const roles = ['buggy', 'reference', 'alternate', 'decoy'] as const;
  const targetResults: Record<string, any> = {};

  for (const role of roles) {
    console.log(`Evaluating Target: ${role.toUpperCase()}...`);
    const runToken = randomBytes(4).toString('hex');
    const runId = `phase4-${role}-${runToken}`;
    const stagingDir = path.join(EVALUATOR_DIR, `staging-${role}`);
    const targetEvidenceDir = path.join(EVALUATOR_DIR, role);
    await mkdir(targetEvidenceDir, { recursive: true });

    const patchContent = role === 'buggy' ? undefined : candidatePatches[role];

    const stagingInfo = await stageGenericPayload({
      targetDir: stagingDir,
      role,
      sourceBaseDir: SANITIZED_WORKSPACE_DIR,
      config,
      generatedTestSource: synthesisResult.testSource,
      candidatePatch: patchContent,
      additionalModulesDir: BUNDLE_MODULES_DIR,
    });

    const supervisorResult: SupervisorExecutionResult = await runExternalContainer({
      runId,
      role,
      image: config.image,
      stagedDir: stagingInfo.stagedDir,
      containerCommand: ['node', '/case/supervisor-runner.js'],
      timeoutSeconds: config.securityPolicy.timeoutSeconds,
    });

    // Write all artifacts
    for (const [name, buf] of Object.entries(supervisorResult.artifacts)) {
      await writeFile(path.join(targetEvidenceDir, name), buf);
    }

    console.log(`  supervisorResult: exitCode=${supervisorResult.exitCode}, status=${supervisorResult.executionStatus}, error=${supervisorResult.error}`);
    console.log(`  artifacts count: ${Object.keys(supervisorResult.artifacts).length}`);
    if (supervisorResult.stdout) console.log(`  raw stdout: ${supervisorResult.stdout.slice(0, 500)}`);
    if (supervisorResult.stderr) console.log(`  raw stderr: ${supervisorResult.stderr.slice(0, 500)}`);

    const officialStdout = supervisorResult.artifacts['official.stdout']?.toString('utf8') ?? '';
    const officialStderr = supervisorResult.artifacts['official.stderr']?.toString('utf8') ?? '';
    let officialExitCode: number | null = null;
    if (supervisorResult.artifacts['official.json']) {
      try {
        const meta = JSON.parse(supervisorResult.artifacts['official.json'].toString('utf8'));
        officialExitCode = meta.exitCode;
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

    if (supervisorResult.executionStatus === 'ERROR') {
      throw new Error(`Supervisor execution failed for ${role}: ${supervisorResult.error}`);
    }

    let officialReport = null;
    let suiteReport = null;
    try {
      officialReport = normalizeGenericTestOutput(officialStdout, officialStderr, config.testRunner, officialExitCode);
    } catch (err) {
      console.warn(`Could not normalize official report for ${role}:`, err);
    }
    try {
      suiteReport = normalizeGenericTestOutput(suiteStdout, suiteStderr, config.testRunner, suiteExitCode);
    } catch (err) {
      console.warn(`Could not normalize suite report for ${role}:`, err);
    }

    const execSummary = {
      runId,
      role,
      exitCode: supervisorResult.exitCode,
      patchHash: stagingInfo.patchHash,
      officialRun: {
        exitCode: officialExitCode,
        stdout: officialStdout,
        stderr: officialStderr,
        report: officialReport,
      },
      suiteRun: {
        exitCode: suiteExitCode,
        stdout: suiteStdout,
        stderr: suiteStderr,
        report: suiteReport,
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

    targetResults[role] = execSummary;

    // Clean up staging directory
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    console.log(`  Completed ${role}: exitCode=${supervisorResult.exitCode}, duration=${supervisorResult.durationMs}ms`);
  }

  // Collate Checks and Final Verdict
  const buggy = targetResults['buggy'];
  const reference = targetResults['reference'];
  const alternate = targetResults['alternate'];
  const decoy = targetResults['decoy'];

  const errors: string[] = [];

  // Check 1: Buggy fails with TypeError
  const buggyGenFailed = buggy.officialRun.exitCode === 1;
  const buggyFails =
    buggyGenFailed &&
    (buggy.officialRun.stderr.includes('TypeError') ||
      buggy.officialRun.stdout.includes('TypeError')) &&
    (buggy.officialRun.stderr.includes('Cannot read properties of undefined (reading \'config\')') ||
      buggy.officialRun.stderr.includes('lib/request.js:204'));

  if (!buggyFails) {
    errors.push(`Buggy execution did not fail with expected TypeError: exitCode=${buggy.officialRun.exitCode}`);
  }

  // Check 2: Reference fix passes
  const referenceFixPasses =
    reference.officialRun.exitCode === 0 &&
    (reference.suiteRun.exitCode === 0 || reference.suiteRun.stdout.includes('baseline routing passed'));
  if (!referenceFixPasses) {
    errors.push(`Reference fix failed: officialExit=${reference.officialRun.exitCode}, suiteExit=${reference.suiteRun.exitCode}`);
  }

  // Check 3: Alternate fix passes
  const alternateFixPasses =
    alternate.officialRun.exitCode === 0 &&
    (alternate.suiteRun.exitCode === 0 || alternate.suiteRun.stdout.includes('baseline routing passed'));
  if (!alternateFixPasses) {
    errors.push(`Alternate fix failed: officialExit=${alternate.officialRun.exitCode}, suiteExit=${alternate.suiteRun.exitCode}`);
  }

  // Check 4: Decoy fix rejected by generated test
  const decoyGenFailed = decoy.officialRun.exitCode === 1;
  const decoyRejectedByGeneratedTest =
    decoyGenFailed &&
    (decoy.officialRun.stderr.includes('AssertionError') ||
      decoy.officialRun.stdout.includes('AssertionError') ||
      decoy.officialRun.stderr.includes('expected') ||
      decoy.officialRun.stdout.includes('expected'));
  if (!decoyRejectedByGeneratedTest) {
    errors.push(`Decoy fix was not rejected with AssertionError: exitCode=${decoy.officialRun.exitCode}`);
  }

  // Check 5: Non-regression baseline tests pass across all 4 targets
  const nonRegressionBaselinePasses =
    buggy.suiteRun.stdout.includes('baseline routing passed') &&
    reference.suiteRun.stdout.includes('baseline routing passed') &&
    alternate.suiteRun.stdout.includes('baseline routing passed') &&
    decoy.suiteRun.stdout.includes('baseline routing passed');
  if (!nonRegressionBaselinePasses) {
    errors.push('Baseline non-regression test failed on one or more targets');
  }

  // Security checks
  const allTargets = [buggy, reference, alternate, decoy];
  const offlineEnforced = allTargets.every((t) => t.isolation.networkMode === 'none');
  const isolationEnforced = allTargets.every(
    (t) =>
      t.isolation.user === '1000:1000' &&
      t.isolation.readonlyRoot === true &&
      t.isolation.capDropAll === true &&
      t.isolation.noNewPrivileges === true,
  );
  const cleanupEnforced = allTargets.every((t) => t.cleaned === true);

  if (!offlineEnforced) errors.push('Offline isolation failed on one or more targets');
  if (!isolationEnforced) errors.push('Resource isolation limits failed on one or more targets');
  if (!cleanupEnforced) errors.push('Guaranteed cleanup failed on one or more targets');

  let verdict: 'SUCCESS' | 'DECOY_MISSED' | 'FIX_FAILED' | 'FALSE_POSITIVE' | 'EVALUATION_ERROR' = 'SUCCESS';
  if (errors.length > 0) {
    if (!buggyFails) verdict = 'FALSE_POSITIVE';
    else if (!referenceFixPasses || !alternateFixPasses) verdict = 'FIX_FAILED';
    else if (!decoyRejectedByGeneratedTest) verdict = 'DECOY_MISSED';
    else verdict = 'EVALUATION_ERROR';
  }

  const evaluationVerdict = {
    verdict,
    generatedTestSha256: synthesisResult.testSha256,
    checks: {
      buggyFails,
      referenceFixPasses,
      alternateFixPasses,
      decoyRejectedByGeneratedTest,
      nonRegressionBaselinePasses,
      offlineEnforced,
      isolationEnforced,
      cleanupEnforced,
    },
    errors,
  };

  await writeFile(
    path.join(EVALUATOR_DIR, 'evaluation-verdict.json'),
    JSON.stringify(evaluationVerdict, null, 2) + '\n',
    'utf8',
  );

  console.log('\n=== Evaluation Completed ===');
  console.log(`Verdict: ${verdict}`);
  console.log(`Checks Summary:`);
  console.log(`  1. Buggy Fails (TypeError at lib/request.js:204):   ${buggyFails}`);
  console.log(`  2. Reference Fix Passes (Exit 0):                   ${referenceFixPasses}`);
  console.log(`  3. Alternate Fix Passes (Exit 0):                   ${alternateFixPasses}`);
  console.log(`  4. Decoy Fix Rejected by Generated Test:            ${decoyRejectedByGeneratedTest}`);
  console.log(`  5. Non-Regression Baseline Tests Pass:              ${nonRegressionBaselinePasses}`);
  console.log(`  6. Security & Isolation Enforced:                   ${offlineEnforced && isolationEnforced && cleanupEnforced}`);

  if (errors.length > 0) {
    console.log('\nVerdict Errors:');
    for (const err of errors) {
      console.log(`  - ${err}`);
    }
  }

  // -------------------------------------------------------------
  // STAGE S5: Integrity & Artifact Registry
  // -------------------------------------------------------------
  console.log('\n--- Stage S5: Computing Cryptographic Artifact Registry ---');
  const artifactHashes: Record<string, string> = {};

  async function registerArtifacts(dir: string, relBase = '') {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await registerArtifacts(full, rel);
      } else if (ent.isFile()) {
        if (ent.name === 'artifact-sha256.json') continue;
        const buf = await readFile(full);
        artifactHashes[rel] = sha256(buf);
      }
    }
  }

  await registerArtifacts(PHASE4_WORK_DIR);
  const registryPath = path.join(PHASE4_WORK_DIR, 'artifact-sha256.json');
  await writeFile(registryPath, JSON.stringify(artifactHashes, null, 2) + '\n', 'utf8');
  console.log(`Registered ${Object.keys(artifactHashes).length} Phase 4 artifacts in artifact-sha256.json\n`);

  console.log('=== PHASE 4 BLIND SYNTHESIS EXPERIMENT COMPLETE ===');
  console.log(`FINAL RESULT: ${verdict === 'SUCCESS' ? 'PASS' : 'FAIL'}`);

  if (verdict !== 'SUCCESS') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Phase 4 execution failed:', err);
  process.exit(1);
});
