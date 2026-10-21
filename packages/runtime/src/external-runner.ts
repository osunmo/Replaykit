import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ExternalExecutionSchema, type ExternalExecution } from '../../contracts/src/external.js';
import {
  buildQs33ExecutionRecord,
  parseQs33ProbeReport,
  parseQs33TapReport,
  QS33_IMAGE,
  stageQs33Payload,
  type Qs33ProbeReport,
} from './adapters/qs33-adapter.js';
import {
  runExternalContainer,
  type SupervisorExecutionResult,
} from './external-supervisor.js';

export interface ExternalRunOptions {
  runId: string;
  role: 'buggy' | 'reference' | 'fixed' | 'alternate' | 'decoy';
  repoRoot?: string;
  stagingDir?: string;
  candidateSource?: string;
  timeoutSeconds?: number;
  preserveStaging?: boolean;
  evidenceDir?: string;
}

export interface ExternalRunResult {
  execution: ExternalExecution;
  supervisorResult: SupervisorExecutionResult;
  normalizedReport: ReturnType<typeof parseQs33TapReport>;
  probeReport: Qs33ProbeReport;
}

/**
 * High-level runner: stages the target payload, runs the isolated container,
 * normalizes official test results and probe outcome, and returns a validated ExternalExecution record.
 */
export async function runExternalExecution(
  options: ExternalRunOptions,
): Promise<ExternalRunResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const ownsStaging = !options.stagingDir;
  const stagingDir =
    options.stagingDir ??
    (await mkdtemp(path.join(os.tmpdir(), `rk-staging-${options.runId}-${options.role}-`)));

  try {
    // 1. Stage the files for the given role
    const stagingInfo = await stageQs33Payload(
      stagingDir,
      options.role,
      repoRoot,
      { candidateSource: options.candidateSource },
    );

    // 2. Execute container under supervisor
    const supervisorResult = await runExternalContainer({
      runId: options.runId,
      role: options.role,
      image: QS33_IMAGE,
      stagedDir: stagingInfo.stagedDir,
      timeoutSeconds: options.timeoutSeconds ?? 30,
    });

    if (supervisorResult.executionStatus === 'ERROR') {
      throw new Error(
        `CONTAINER_EXECUTION_FAILED: ${supervisorResult.error ?? 'Unknown container execution error'}`,
      );
    }

    // 3. Extract official test output and probe output
    const officialStdout =
      supervisorResult.artifacts['official.stdout']?.toString('utf8') ?? supervisorResult.stdout;
    const officialStderr =
      supervisorResult.artifacts['official.stderr']?.toString('utf8') ?? supervisorResult.stderr;
    const probeStdout =
      supervisorResult.artifacts['probe.stdout']?.toString('utf8') ?? '';
    const probeStderr =
      supervisorResult.artifacts['probe.stderr']?.toString('utf8') ?? '';

    // 4. Normalize TAP report and probe outcome
    const normalizedReport = parseQs33TapReport(officialStdout, officialStderr);
    const probeReport = parseQs33ProbeReport(probeStdout, probeStderr);

    // 5. Build and validate ExternalExecution record
    const execution = buildQs33ExecutionRecord(supervisorResult, stagingInfo, normalizedReport);
    ExternalExecutionSchema.parse(execution);

    // 6. Optionally export raw and normalized evidence artifacts to disk
    if (options.evidenceDir) {
      await mkdir(options.evidenceDir, { recursive: true });
      for (const [name, buffer] of Object.entries(supervisorResult.artifacts)) {
        await writeFile(path.join(options.evidenceDir, name), buffer);
      }
      await writeFile(
        path.join(options.evidenceDir, 'execution.json'),
        JSON.stringify(execution, null, 2) + '\n',
        'utf8',
      );
      await writeFile(
        path.join(options.evidenceDir, 'report.json'),
        JSON.stringify(normalizedReport.parsedReport, null, 2) + '\n',
        'utf8',
      );
      await writeFile(
        path.join(options.evidenceDir, 'probe-report.json'),
        JSON.stringify(probeReport, null, 2) + '\n',
        'utf8',
      );
    }

    return {
      execution,
      supervisorResult,
      normalizedReport,
      probeReport,
    };
  } finally {
    if (ownsStaging && !options.preserveStaging) {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
