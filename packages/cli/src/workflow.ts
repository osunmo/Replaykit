import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  IncidentSchema,
  JudgeResultSchema,
  ReplayPlanSchema,
  type ExecutionEvidence,
  type Incident,
  type JudgeResult,
  type PaymentRequest,
  type ReplayPlan,
} from '../../contracts/src/index.js';
import { evaluateEvidence, inspectTest, type ExecutionMatrix } from '../../judge/src/evaluate.js';
import { loadManifest, planInSandbox, runSandbox, type Variant } from '../../judge/src/sandbox.js';
import { normalizeIncident, redact } from '../../telemetry/src/index.js';
import { replayBindingIssues } from '../../judge/src/binding.js';
import { reportMarkdown } from './report.js';

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export async function newOutput(root: string): Promise<string> {
  const output = path.join(root, 'runs', randomUUID());
  await mkdir(output, { recursive: true });
  return output;
}
function unavailable(
  incident: Incident,
  plan: ReplayPlan,
  status: 'NOT_REPRODUCED' | 'ERROR',
  reasonCodes: string[],
): JudgeResult {
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
    checks: {
      buggyFails: null,
      sameFailureIdentity: null,
      referenceFixPasses: null,
      alternateFixPasses: null,
      decoyFixStillFails: null,
      deterministicRuns: 0,
      deterministicFailures: 0,
      offlineExecution: null,
      isolatedExecution: null,
      freshState: null,
      noSleepBasedTiming: null,
      reviewableTest: null,
      sameCandidate: null,
    },
    missingEvidence: plan.missingEvidence,
    reasonCodes,
    testArtifact: plan.testSource ? 'repro.test.ts' : null,
    durationMs: 0,
    tokens: null,
    metadata: { planner: 'rule-based-v1', incidentHash: plan.sourceHash },
  });
}
export async function verifyPlan(
  root: string,
  output: string,
  rawIncident: unknown,
  rawPlan?: unknown,
): Promise<{ result: JudgeResult; matrix?: ExecutionMatrix }> {
  const incident = IncidentSchema.parse(redact(rawIncident));
  const plan = rawPlan ? ReplayPlanSchema.parse(rawPlan) : await planInSandbox(root, incident);
  if (plan.sourceHash !== sha256(JSON.stringify(incident)))
    throw new Error('Plan provenance does not match incident');
  await writeFile(path.join(output, 'incident.json'), json(incident));
  await writeFile(path.join(output, 'plan.json'), json(plan));
  let result: JudgeResult;
  let matrix: ExecutionMatrix | undefined;
  const rows: { variant: string; evidence: ExecutionEvidence }[] = [];
  if (plan.status === 'ABSTAIN')
    result = unavailable(incident, plan, 'NOT_REPRODUCED', plan.reasonCodes);
  else if (!inspectTest(plan.testSource!).allowed)
    result = unavailable(incident, plan, 'NOT_REPRODUCED', inspectTest(plan.testSource!).reasons);
  else {
    await writeFile(path.join(output, 'repro.test.ts'), plan.testSource!);
    try {
      const manifest = await loadManifest(root);
      const bindingIssues = replayBindingIssues(incident, plan, manifest.appImages.buggy);
      if (bindingIssues.length) {
        const result = unavailable(incident, plan, 'NOT_REPRODUCED', bindingIssues);
        result.runId = path.basename(output);
        await writeFile(path.join(output, 'result.json'), json(result));
        await writeFile(path.join(output, 'report.md'), reportMarkdown(result, []));
        return { result };
      }
      await writeFile(
        path.join(output, 'environment.json'),
        json({
          ...manifest,
          hostNode: process.version,
          hostPlatform: process.platform,
          lockfileHash: sha256(await readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8')),
        }),
      );
      const counts = { buggy: 0, reference: 0, alternate: 0, decoy: 0 };
      const execute = async (variant: Variant) => {
        counts[variant] += 1;
        process.stderr.write(`Running isolated ${variant} execution ${counts[variant]}...\n`);
        const evidence = await runSandbox(root, output, variant, plan.testSource!, plan.request!);
        rows.push({ variant, evidence });
        return evidence;
      };
      const buggy: ExecutionEvidence[] = [];
      for (let i = 0; i < 10; i += 2) {
        const batch = await Promise.all([execute('buggy'), execute('buggy')]);
        buggy.push(...batch);
        if (batch.some((e) => e.executionStatus === 'ERROR')) break;
      }
      const skipped = (): ExecutionEvidence => ({
        runId: randomUUID(),
        variantHash: '0'.repeat(64),
        candidateHash: sha256(plan.testSource!),
        executionStatus: 'ERROR',
        exitCode: null,
        failure: null,
        charges: null,
        requests: 0,
        cleanDatabase: false,
        isolated: false,
        offline: false,
        schedule: [],
        durationMs: 0,
        stdout: '',
        stderr: '',
        error: 'NOT_EXECUTED_AFTER_ERROR',
      });
      const failed = buggy.some((e) => e.executionStatus === 'ERROR');
      const reference = failed ? skipped() : await execute('reference');
      const alternate = failed ? skipped() : await execute('alternate');
      const decoy = failed ? skipped() : await execute('decoy');
      matrix = { buggy, reference, alternate, decoy };
      result = evaluateEvidence(incident, plan, matrix);
      await writeFile(path.join(output, 'matrix.json'), json(matrix));
    } catch (error) {
      result = unavailable(incident, plan, 'ERROR', ['SANDBOX_UNAVAILABLE']);
      result.metadata.error = error instanceof Error ? error.message : String(error);
    }
  }
  result.runId = path.basename(output);
  await writeFile(path.join(output, 'result.json'), json(result));
  await writeFile(path.join(output, 'report.md'), reportMarkdown(result, rows));
  await writeFile(
    path.join(output, 'executions.csv'),
    [
      'variant,runId,status,exitCode,charges,durationMs',
      ...rows.map(({ variant, evidence: e }) =>
        [variant, e.runId, e.executionStatus, e.exitCode ?? '', e.charges ?? '', e.durationMs].join(
          ',',
        ),
      ),
    ].join('\n') + '\n',
  );
  return { result, ...(matrix ? { matrix } : {}) };
}
export async function captureIncident(root: string, output: string): Promise<Incident> {
  const request: PaymentRequest = {
    orderId: 'order-synthetic-1',
    idempotencyKey: 'checkout-key-1',
    amount: 1250,
  };
  const traffic = `import { payment } from '/sdk/replay-fixture.mjs';\nconst request = ${JSON.stringify(request)};\nawait payment(request);\nawait payment(request);\n`;
  const evidence = await runSandbox(root, output, 'buggy', traffic, request);
  if (evidence.executionStatus !== 'COMPLETED' || evidence.charges !== 2 || !evidence.incident)
    throw new Error(`Incident capture failed: ${evidence.error ?? 'No real duplicate observed'}`);
  const incident = normalizeIncident(evidence.incident, 'full');
  incident.metadata.sourceEventId = incident.id;
  incident.id = 'R1';
  await writeFile(path.join(output, 'capture.json'), json(evidence));
  await writeFile(path.join(output, 'incident.json'), json(incident));
  return incident;
}
export async function smoke(root: string, output: string) {
  const incident = await captureIncident(root, output);
  const verified = await verifyPlan(root, output, incident);
  let wrongFrameRejected = false;
  if (verified.matrix) {
    const wrong = {
      ...incident,
      exception: { ...incident.exception, topApplicationFrame: 'refunds/createRefund' },
    };
    const mismatch = evaluateEvidence(wrong, await planInSandbox(root, wrong), verified.matrix);
    wrongFrameRejected =
      mismatch.status !== 'VERIFIED' && mismatch.checks.sameFailureIdentity === false;
    await writeFile(path.join(output, 'identity-negative.json'), json(mismatch));
  }
  const minimal = IncidentSchema.parse({
    ...incident,
    request: undefined,
    breadcrumbs: [],
    spans: [],
    telemetryTier: 'minimal',
    missingEvidence: ['request.body', 'breadcrumbs', 'spans'],
  });
  const abstention = await planInSandbox(root, minimal);
  const missingBodyAbstained =
    abstention.status === 'ABSTAIN' && abstention.reasonCodes.includes('MISSING_REQUEST_BODY');
  await writeFile(path.join(output, 'minimal-plan.json'), json(abstention));
  const summary = {
    status:
      verified.result.status === 'VERIFIED' && wrongFrameRejected && missingBodyAbstained
        ? 'PASS'
        : 'FAIL',
    runId: verified.result.runId,
    verdict: verified.result.status,
    wrongFrameRejected,
    missingBodyAbstained,
    scope: 'R1 smoke; identity and missing-evidence checks are not the full N1-N5 benchmark',
  };
  await writeFile(path.join(output, 'smoke.json'), json(summary));
  return summary;
}
