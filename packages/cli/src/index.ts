import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { IncidentSchema, JudgeResultSchema, TierSchema } from '../../contracts/src/index.js';
import { normalizeIncident } from '../../telemetry/src/index.js';
import { captureIncident, newOutput, smoke, verifyPlan } from './workflow.js';
import { readJson, safeRunId } from './report.js';
import { parseConcurrency } from './concurrency.js';
import { relativeArtifactPath } from './publication.js';

const help = `ReplayKit — first R1 vertical slice

pnpm sandbox:build
pnpm benchmark smoke [--concurrency 3]
pnpm replaykit incident capture --output benchmark/incidents/R1/visible/incident.json
pnpm replaykit incident run --fixture <incident.json> [--tier full|partial|minimal] [--concurrency 3]
pnpm replaykit replay verify --run <run-id> [--concurrency 3]
pnpm benchmark report --input <runs/run-id>

Exit codes: 0 success/VERIFIED; 2 non-verified; 1 infrastructure/input error.
Full 20-case benchmark and model comparisons are not implemented yet.
`;

async function main() {
  const root = process.cwd();
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  if (!args.length || args.includes('--help')) {
    process.stdout.write(help);
    return;
  }
  const option = (name: string) => {
    const index = args.indexOf(name);
    if (index < 0 || !args[index + 1] || args[index + 1]!.startsWith('--'))
      throw new Error(`Missing ${name}`);
    return args[index + 1]!;
  };
  const command = `${args[0]} ${args[1]}`;
  if (command === 'benchmark report') {
    const result = JudgeResultSchema.parse(
      await readJson(path.join(path.resolve(option('--input')), 'result.json')),
    );
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  if (!['benchmark smoke', 'incident run', 'incident capture', 'replay verify'].includes(command))
    throw new Error(`Unsupported command: ${command}. ${help}`);
  const concurrency = parseConcurrency(
    args.includes('--concurrency') ? option('--concurrency') : undefined,
  );
  const output = await newOutput(root);
  try {
    if (command === 'benchmark smoke') {
      const summary = await smoke(root, output, { concurrency });
      process.stdout.write(
        JSON.stringify(
          { ...summary, report: relativeArtifactPath(root, path.join(output, 'report.md')) },
          null,
          2,
        ) + '\n',
      );
      if (summary.status !== 'PASS') process.exitCode = 2;
      return;
    }
    if (command === 'incident capture') {
      const incident = await captureIncident(root, output);
      const target = path.resolve(option('--output'));
      const { mkdir } = await import('node:fs/promises');
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, JSON.stringify(incident, null, 2) + '\n');
      process.stdout.write(
        JSON.stringify({
          incident: relativeArtifactPath(root, target),
          capture: relativeArtifactPath(root, output),
        }) + '\n',
      );
      return;
    }
    let incident: unknown;
    let plan: unknown;
    if (command === 'replay verify') {
      const prior = path.join(root, 'runs', safeRunId(option('--run')));
      incident = await readJson(path.join(prior, 'incident.json'));
      plan = await readJson(path.join(prior, 'plan.json'));
      const source = await readFile(path.join(prior, 'repro.test.ts'), 'utf8');
      if ((plan as { testSource?: string }).testSource !== source)
        throw new Error('Stored test does not match its provenance plan');
      const priorResult = JudgeResultSchema.parse(await readJson(path.join(prior, 'result.json')));
      if (priorResult.metadata.candidateHash !== createHash('sha256').update(source).digest('hex'))
        throw new Error('Stored test hash differs from the previous judged candidate');
    } else {
      const input = await readJson(path.resolve(option('--fixture')));
      const parsed = IncidentSchema.safeParse(input);
      incident = parsed.success ? parsed.data : normalizeIncident(input, 'full');
      if (args.includes('--tier')) {
        const tier = TierSchema.parse(option('--tier'));
        const value = IncidentSchema.parse(incident);
        if (tier === 'full' && value.telemetryTier !== 'full')
          throw new Error('Cannot restore withheld evidence');
        if (tier !== 'full')
          incident = IncidentSchema.parse({
            ...value,
            telemetryTier: tier,
            request: undefined,
            ...(tier === 'minimal' ? { spans: [], breadcrumbs: [] } : {}),
            missingEvidence: [
              ...new Set([
                ...value.missingEvidence,
                'request.body',
                ...(tier === 'minimal' ? ['spans', 'breadcrumbs'] : []),
              ]),
            ],
          });
      }
    }
    const { result } = await verifyPlan(root, output, incident, plan, { concurrency });
    process.stdout.write(
      JSON.stringify(
        {
          status: result.status,
          runId: result.runId,
          reasonCodes: result.reasonCodes,
          report: relativeArtifactPath(root, path.join(output, 'report.md')),
        },
        null,
        2,
      ) + '\n',
    );
    process.exitCode = result.status === 'VERIFIED' ? 0 : result.status === 'ERROR' ? 1 : 2;
  } catch (error) {
    await writeFile(
      path.join(output, 'error.json'),
      JSON.stringify(
        {
          executionStatus: 'ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    throw error;
  }
}
main().catch((error) => {
  process.stderr.write(
    `ReplayKit error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
