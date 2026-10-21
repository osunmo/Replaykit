import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProductionIncidentContext } from '../../packages/contracts/src/incident-context.js';
import { generateRegressionTest } from '../../packages/runtime/src/ai-generator.js';
import { evaluateFourTargets } from '../../packages/runtime/src/blind-evaluator.js';
import { createSanitizedWorkspace } from '../../packages/runtime/src/sanitizer.js';

const sha256 = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

const REPO_ROOT = process.cwd();
const PHASE3_WORK_DIR = path.join(REPO_ROOT, 'work', 'phase3');
const SANITIZED_WORKSPACE_DIR = path.join(PHASE3_WORK_DIR, 'sanitized-buggy-workspace');
const INCIDENT_DIR = path.join(PHASE3_WORK_DIR, 'incident-context');
const GENERATOR_DIR = path.join(PHASE3_WORK_DIR, 'generator-runs');
const CONTROL_DIR = path.join(PHASE3_WORK_DIR, 'control-runs');
const EVALUATOR_DIR = path.join(PHASE3_WORK_DIR, 'evaluator-runs');

async function main() {
  console.log('=== ReplayKit Phase 3: Blind AI Regression-Test Generation ===\n');

  await mkdir(PHASE3_WORK_DIR, { recursive: true });
  await mkdir(INCIDENT_DIR, { recursive: true });
  await mkdir(GENERATOR_DIR, { recursive: true });
  await mkdir(CONTROL_DIR, { recursive: true });
  await mkdir(EVALUATOR_DIR, { recursive: true });

  // -------------------------------------------------------------
  // STAGE S2: Prepare Incident Evidence (Incident Context Contract)
  // -------------------------------------------------------------
  console.log('--- Stage S2: Preparing Incident Evidence ---');

  const baseCommit = '360e2b0b48548b9bfdb71f8c82a68c4f34ec0725';

  // 1. Contract-Conditioned Incident Context
  const contractConditionedIncident: ProductionIncidentContext = {
    schemaVersion: 'incident-context-v1',
    incidentId: '04a60f9e-3d12-4f76-88ab-c215d2a93170',
    createdAt: '2026-10-20T07:00:00Z',
    sourceRevision: {
      gitSha: baseCommit,
      repository: 'https://github.com/hapijs/qs.git',
      branch: 'master',
    },
    error: {
      type: 'TypeError',
      value: 'source.hasOwnProperty is not a function',
      topApplicationFrame: 'at exports.clone (/case/lib/utils.js:47:20)',
      frames: [
        {
          filename: '/case/lib/utils.js',
          function: 'exports.clone',
          lineno: 47,
          colno: 20,
          inApp: true,
          contextLine: '        if (source.hasOwnProperty(i)) {',
        },
        {
          filename: '/case/lib/utils.js',
          function: 'exports.clone',
          lineno: 48,
          colno: 31,
          inApp: true,
        },
        {
          filename: '/case/lib/parse.js',
          function: 'module.exports [as parse]',
          lineno: 141,
          colno: 89,
          inApp: true,
        },
      ],
      handled: false,
    },
    request: {
      method: 'GET',
      url: 'http://localhost/parse',
      path: '/parse',
      headers: {
        accept: 'application/json',
      },
      bodySanitized: { a: { b: 'c' } },
    },
    breadcrumbs: [
      {
        timestamp: '2026-10-20T06:59:58Z',
        category: 'custom',
        level: 'info',
        message:
          'Triggering input: Object containing Object.create(null) dictionary passed to Qs.parse: var dict = Object.create(null); dict.b = "c"; var input = { a: dict };',
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
        expectedReturnValue: { a: { b: 'c' } },
      },
      specification:
        'Upstream API Specification: Qs.parse(object) must recursively clone and parse nested object keys into a merged query object preserving all key-value entries regardless of prototype inheritance chain. Objects created via Object.create(null) represent plain key-value maps without prototype methods and must retain their properties during merging and cloning. Expected output for input { a: dict } where dict has b = "c" is { a: { b: "c" } }.',
    },
    sufficiency: {
      status: 'SUFFICIENT',
      missingFields: [],
      blockingReason: null,
    },
  };

  // 2. Insufficient-Oracle Control Context
  const insufficientOracleIncident: ProductionIncidentContext = {
    ...contractConditionedIncident,
    incidentId: 'b3e8117a-59b4-4b53-9ec7-c0e81c19b052',
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
        'No documented contract specifies whether prototype-less dictionary keys should be preserved, ignored, or converted to empty objects. Without a behavioral contract, expected output cannot be derived.',
    },
  };

  const contractConditionedJson = JSON.stringify(contractConditionedIncident, null, 2) + '\n';
  const insufficientOracleJson = JSON.stringify(insufficientOracleIncident, null, 2) + '\n';

  await writeFile(path.join(INCIDENT_DIR, 'contract-conditioned-incident.json'), contractConditionedJson);
  await writeFile(path.join(INCIDENT_DIR, 'insufficient-oracle-incident.json'), insufficientOracleJson);

  console.log('Saved incident payloads to work/phase3/incident-context/');
  console.log(`Contract-Conditioned Hash: ${sha256(contractConditionedJson)}`);
  console.log(`Insufficient-Oracle Hash:   ${sha256(insufficientOracleJson)}\n`);

  // -------------------------------------------------------------
  // STAGE S1: Construct Clean Workspace & Blinding Audit
  // -------------------------------------------------------------
  console.log('--- Stage S1: Constructing Sanitized Workspace & Blinding Audit ---');

  const { manifest, blindingAudit } = await createSanitizedWorkspace({
    repoRoot: REPO_ROOT,
    outputDir: SANITIZED_WORKSPACE_DIR,
    incident: contractConditionedIncident,
  });

  await writeFile(
    path.join(PHASE3_WORK_DIR, 'sanitized-workspace-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  await writeFile(
    path.join(PHASE3_WORK_DIR, 'blinding-audit.json'),
    JSON.stringify(blindingAudit, null, 2) + '\n',
  );

  console.log(`Audited ${blindingAudit.auditedFilesCount} files in sanitized workspace.`);
  console.log(`Test #40 Present: ${blindingAudit.test40Present}`);
  console.log(`Parse.js Test Count: ${blindingAudit.testParseTestsCount} (expected 39)`);
  console.log(`Blinding Audit Passed: ${blindingAudit.passed}\n`);

  if (!blindingAudit.passed) {
    throw new Error('BLINDING_AUDIT_FAILED: Cannot proceed with generation.');
  }

  // -------------------------------------------------------------
  // STAGE S3: Generate a New Test (Real AI Model Call)
  // -------------------------------------------------------------
  console.log('--- Stage S3: AI Regression Test Generation (Qwen2.5-Coder via Ollama) ---');

  // Control Trial: Insufficient Oracle
  console.log('Running Insufficient-Oracle Control Trial...');
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

  // Write all generator input and output artifacts (Stage S3 & S6 requirement)
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
  console.log(`Levenshtein Distance to Test 40: ${synthesisResult.astChecks?.levenshteinDistanceToTest40}`);
  console.log('\nGenerated Test Source:\n----------------------------------------');
  console.log(synthesisResult.testSource);
  console.log('----------------------------------------\n');

  // -------------------------------------------------------------
  // STAGE S4: Hidden Four-Target Evaluation
  // -------------------------------------------------------------
  console.log('--- Stage S4: Hidden Four-Target Live Container Evaluation ---');
  console.log('Targets to evaluate: Buggy, Reference Fix, Alternate Fix, Decoy Fix\n');

  const verdict = await evaluateFourTargets({
    repoRoot: REPO_ROOT,
    generatedTestSource: synthesisResult.testSource,
    evidenceDir: EVALUATOR_DIR,
  });

  console.log('\n=== Evaluation Completed ===');
  console.log(`Verdict: ${verdict.verdict}`);
  console.log(`Checks Summary:`);
  console.log(`  1. Buggy Fails (TypeError at utils.js:47:20): ${verdict.checks.buggyFails} (type: ${verdict.checks.buggyFailureType})`);
  console.log(`  2. Reference Fix Passes (Exit 0):             ${verdict.checks.referenceFixPasses}`);
  console.log(`  3. Alternate Fix Passes (Exit 0):             ${verdict.checks.alternateFixPasses}`);
  console.log(`  4. Decoy Fix Rejected by Generated Test:      ${verdict.checks.decoyRejectedByGeneratedTest} (type: ${verdict.checks.decoyFailureType})`);
  console.log(`  5. Non-Regression Baseline Tests Pass:        ${verdict.checks.nonRegressionBaselinePasses}`);
  console.log(`  6. Security & Isolation Enforced:             ${verdict.checks.offlineEnforced && verdict.checks.isolationEnforced && verdict.checks.cleanupEnforced}`);

  if (verdict.errors.length > 0) {
    console.log('\nVerdict Errors:');
    for (const err of verdict.errors) {
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

  await registerArtifacts(PHASE3_WORK_DIR);
  const registryPath = path.join(PHASE3_WORK_DIR, 'artifact-sha256.json');
  await writeFile(registryPath, JSON.stringify(artifactHashes, null, 2) + '\n', 'utf8');
  console.log(`Registered ${Object.keys(artifactHashes).length} Phase 3 artifacts in artifact-sha256.json\n`);

  console.log('=== PHASE 3 BLIND SYNTHESIS EXPERIMENT COMPLETE ===');
  console.log(`FINAL RESULT: ${verdict.verdict === 'SUCCESS' ? 'PASS' : 'FAIL'}`);

  if (verdict.verdict !== 'SUCCESS') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Phase 3 execution failed:', err);
  process.exit(1);
});
