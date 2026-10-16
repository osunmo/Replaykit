import { lstat, readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { ExecutionEvidence } from '../../contracts/src/index.js';
export function safeRunId(value: string): string {
  return z.uuid().parse(value);
}
export async function readJson(file: string): Promise<unknown> {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Input must be a regular file');
  if (stat.size > 1048576) throw new Error('JSON input exceeds 1 MiB limit');
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}
interface ReportResult {
  status: string;
  incidentId: string;
  reasonCodes: string[];
  checks: Record<string, unknown>;
  durationMs: number;
  metadata?: Record<string, unknown>;
}
const escape = (value: unknown) => String(value).replace(/[|<>\r\n]/g, ' ');
export function reportMarkdown(
  result: ReportResult,
  rows: { variant: string; evidence: ExecutionEvidence }[],
): string {
  return [
    '# ReplayKit execution report',
    '',
    `Incident: **${escape(result.incidentId)}** — **${escape(result.status)}**`,
    '',
    'Scope: R1 synthetic payment scenario. This is a measured smoke run, not the full 20-case benchmark or a held-out evaluation.',
    '',
    '| Check | Observed value |',
    '| --- | --- |',
    ...Object.entries(result.checks).map(
      ([key, value]) => `| ${escape(key)} | ${value === null ? 'unavailable' : escape(value)} |`,
    ),
    '',
    `Reasons: ${result.reasonCodes.length ? result.reasonCodes.map(escape).join(', ') : 'All required gates satisfied.'}`,
    '',
    '| Variant | Execution | Candidate exit | Trusted charges | Failure identity | Duration ms | Evidence |',
    '| --- | --- | ---: | ---: | --- | ---: | --- |',
    ...rows.map(
      ({ variant, evidence: e }) =>
        `| ${escape(variant)} | ${e.executionStatus} | ${e.exitCode ?? 'unavailable'} | ${e.charges ?? 'unavailable'} | ${e.failure ? escape(`${e.failure.type} @ ${e.failure.topApplicationFrame}`) : 'none'} | ${e.durationMs} | [JSON](executions/${e.runId}/evidence.json) |`,
    ),
    '',
    `Summed execution duration: ${result.durationMs} ms (overlaps during parallel work; this is not elapsed wall time). Model tokens: N/A (deterministic planner).`,
    ...(typeof result.metadata?.verificationWallMs === 'number'
      ? [
          `Verification wall time: ${result.metadata.verificationWallMs} ms. Matrix wall time: ${result.metadata.matrixWallMs} ms. Concurrency limit: ${result.metadata.concurrency}.`,
          `Reference fixes: ${result.metadata.referenceFixSuccesses ?? 0}/${result.metadata.referenceFixAttempts ?? 0}; alternate fixes: ${result.metadata.alternateFixSuccesses ?? 0}/${result.metadata.alternateFixAttempts ?? 0}.`,
          'Execution overlap: [pipeline](pipeline.json). Each execution contains profile.json; full smoke runs also write smoke-profile.json.',
        ]
      : []),
    '',
    'Candidate stdout is untrusted. Charge counts come from the supervisor querying PostgreSQL; failure identity comes from the application container logs. Image identifiers, source hashes and inputs are saved with this run.',
    '',
  ].join('\n');
}
