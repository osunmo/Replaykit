/**
 * ReplayKit — Permanent Deterministic Quality Runner
 * 
 * Executes quality gates across QUICK, TARGETED, and RELEASE modes.
 * Generates human-readable console output and machine-readable JSON reports
 * in work/quality-runs/run-<timestamp>-<id>/quality-report.json.
 */

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { classifyFailure, FailureCategory, SpecialistRole } from './classifier.js';

const execFileAsync = promisify(execFile);

export type QualityMode = 'quick' | 'targeted' | 'release';

export type CheckStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN' | 'SKIPPED';

export interface CheckDefinition {
  id: string;
  name: string;
  command: string;
  args: string[];
  modes: QualityMode[];
  timeoutMs: number;
}

export interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  durationMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  logPath: string;
  failureCategory?: FailureCategory;
  failureReason?: string;
  assignedAgent?: {
    role: SpecialistRole;
    agentFile: string;
  };
}

export interface QualityReport {
  runId: string;
  mode: QualityMode;
  startTime: string;
  endTime: string;
  totalDurationMs: number;
  overallStatus: 'PASS' | 'FAIL' | 'BLOCKED';
  exitCode: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  checks: CheckResult[];
  reportPath: string;
}

export const QUALITY_CHECKS: CheckDefinition[] = [
  {
    id: 'protected-files-check',
    name: 'Protected Judge Contracts Zero-Diff Audit',
    command: 'git',
    args: ['diff', '--exit-code', '--', 'packages/judge/src/evaluate.ts', 'packages/contracts/src/index.ts'],
    modes: ['quick', 'targeted', 'release'],
    timeoutMs: 15000,
  },
  {
    id: 'typecheck',
    name: 'TypeScript Strict Typecheck',
    command: process.execPath,
    args: ['node_modules/typescript/bin/tsc', '--noEmit'],
    modes: ['quick', 'targeted', 'release'],
    timeoutMs: 180000,
  },
  {
    id: 'security-invariants-quick',
    name: 'Sanitization & Security Policy Invariants (Fast)',
    command: process.execPath,
    args: ['node_modules/vitest/vitest.mjs', 'run', 'packages/sentry/src/security.test.ts'],
    modes: ['quick', 'targeted', 'release'],
    timeoutMs: 90000,
  },
  {
    id: 'core-unit-tests',
    name: 'Core Runtime & Contracts Unit Tests',
    command: process.execPath,
    args: [
      'node_modules/vitest/vitest.mjs',
      'run',
      'packages/contracts/src/contracts.test.ts',
      'packages/runtime/src/adapters/generic-adapter.test.ts',
      'packages/benchmark-runner/src/candidate.test.ts',
      'packages/benchmark-runner/src/patch.test.ts',
    ],
    modes: ['quick', 'targeted', 'release'],
    timeoutMs: 180000,
  },
  {
    id: 'ai-ast-validation',
    name: 'AI Generated Test AST & Oracle Validation',
    command: process.execPath,
    args: ['node_modules/vitest/vitest.mjs', 'run', 'packages/runtime/src/blind-synthesis.test.ts'],
    modes: ['targeted', 'release'],
    timeoutMs: 180000,
  },
  {
    id: 'docker-cleanup-validation',
    name: 'Docker Resource Cleanup & Timeout Hardening',
    command: process.execPath,
    args: ['node_modules/vitest/vitest.mjs', 'run', 'packages/runtime/src/docker-cleanup.test.ts'],
    modes: ['targeted', 'release'],
    timeoutMs: 180000,
  },
  {
    id: 'cli-developer-commands',
    name: 'Developer CLI Command & Argument Suite',
    command: process.execPath,
    args: [
      'node_modules/vitest/vitest.mjs',
      'run',
      'packages/cli/test/developer-command.test.ts',
      'packages/cli/test/integration-command.test.ts',
    ],
    modes: ['targeted', 'release'],
    timeoutMs: 180000,
  },
  {
    id: 'sandbox-security-policies',
    name: 'Container Sandbox Security Policy Tests',
    command: process.execPath,
    args: [
      'node_modules/vitest/vitest.mjs',
      'run',
      'packages/judge/src/sandbox-policy.test.ts',
      'packages/judge/src/sandbox-manifest.test.ts',
    ],
    modes: ['targeted', 'release'],
    timeoutMs: 180000,
  },
  {
    id: 'external-evaluator-tests',
    name: 'Multi-Target Evaluator & External Runner Suite',
    command: process.execPath,
    args: [
      'node_modules/vitest/vitest.mjs',
      'run',
      'packages/judge/src/external.test.ts',
      'packages/runtime/src/external-runner.test.ts',
    ],
    modes: ['release'],
    timeoutMs: 240000,
  },
  {
    id: 'token-scan-integration',
    name: 'Token and Secret Scan Integration Suite',
    command: process.execPath,
    args: ['node_modules/vitest/vitest.mjs', 'run', 'packages/telemetry/src/token-scan.test.ts'],
    modes: ['targeted', 'release'],
    timeoutMs: 180000,
  },
  {
    id: 'full-token-scan',
    name: 'Complete Full Repository Token Scan',
    command: process.execPath,
    args: ['node_modules/tsx/dist/cli.mjs', 'scripts/token-scan.ts'],
    modes: ['release'],
    timeoutMs: 300000,
  },
];

export async function runQualityCheck(
  check: CheckDefinition,
  runDir: string,
  cwd: string
): Promise<CheckResult> {
  const startTime = Date.now();
  const logFileName = `${check.id}.log`;
  const logFilePath = path.join(runDir, logFileName);

  try {
    const { stdout, stderr } = await execFileAsync(check.command, check.args, {
      cwd,
      timeout: check.timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, CI: 'true' },
    });

    const durationMs = Date.now() - startTime;
    await fs.writeFile(
      logFilePath,
      `=== STDOUT ===\n${stdout}\n\n=== STDERR ===\n${stderr}\n`,
      'utf8'
    );

    return {
      id: check.id,
      name: check.name,
      status: 'PASS',
      durationMs,
      exitCode: 0,
      stdout,
      stderr,
      logPath: logFilePath,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    if (error.killed && process.platform === 'win32' && error.pid) {
      try {
        execFileSync('taskkill', ['/pid', String(error.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {}
    }
    const stdout = error.stdout ?? '';
    let stderr = error.stderr ?? error.message ?? '';
    if (error.killed) {
      stderr += `\nCommand timed out after ${check.timeoutMs}ms (ETIMEDOUT)\n`;
    }
    const exitCode = typeof error.code === 'number' ? error.code : 1;

    await fs.writeFile(
      logFilePath,
      `=== ERROR ===\n${error.message}\n\n=== STDOUT ===\n${stdout}\n\n=== STDERR ===\n${stderr}\n`,
      'utf8'
    );

    const classification = classifyFailure({
      checkName: check.name,
      stdout,
      stderr,
      exitCode,
      error,
    });

    return {
      id: check.id,
      name: check.name,
      status: 'FAIL',
      durationMs,
      exitCode,
      stdout,
      stderr,
      logPath: logFilePath,
      failureCategory: classification.category,
      failureReason: classification.reason,
      assignedAgent: {
        role: classification.assignedAgent.role,
        agentFile: classification.assignedAgent.agentFile,
      },
    };
  }
}

export async function executeQualitySuite(options: {
  mode: QualityMode;
  repoRoot?: string;
  checks?: CheckDefinition[];
}): Promise<QualityReport> {
  const mode = options.mode;
  const repoRoot = options.repoRoot ?? process.cwd();
  const allChecks = options.checks ?? QUALITY_CHECKS;

  const runId = `run-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const runDir = path.join(repoRoot, 'work', 'quality-runs', runId);
  await fs.mkdir(runDir, { recursive: true });

  const activeChecks = allChecks.filter((c) => c.modes.includes(mode));
  const startTime = new Date().toISOString();
  const t0 = Date.now();

  const results: CheckResult[] = [];
  let passedCount = 0;
  let failedCount = 0;

  for (const check of activeChecks) {
    const result = await runQualityCheck(check, runDir, repoRoot);
    results.push(result);
    if (result.status === 'PASS') {
      passedCount++;
    } else {
      failedCount++;
    }
  }

  // Record skipped checks from other tiers
  const skippedChecks = allChecks.filter((c) => !c.modes.includes(mode));
  for (const skipped of skippedChecks) {
    results.push({
      id: skipped.id,
      name: skipped.name,
      status: 'SKIPPED',
      durationMs: 0,
      exitCode: 0,
      stdout: '',
      stderr: '',
      logPath: '',
    });
  }

  const t1 = Date.now();
  const overallStatus = failedCount === 0 ? 'PASS' : 'FAIL';
  const exitCode = overallStatus === 'PASS' ? 0 : 1;
  const reportPath = path.join(runDir, 'quality-report.json');

  const report: QualityReport = {
    runId,
    mode,
    startTime,
    endTime: new Date().toISOString(),
    totalDurationMs: t1 - t0,
    overallStatus,
    exitCode,
    summary: {
      total: results.length,
      passed: passedCount,
      failed: failedCount,
      skipped: skippedChecks.length,
    },
    checks: results,
    reportPath,
  };

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  return report;
}

export function formatReportConsole(report: QualityReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('================================================================================');
  lines.push(` REPLAYKIT QUALITY RUNNER — MODE: ${report.mode.toUpperCase()} [${report.overallStatus}]`);
  lines.push(` Run ID: ${report.runId} | Duration: ${(report.totalDurationMs / 1000).toFixed(2)}s`);
  lines.push('================================================================================');
  lines.push('');

  for (const check of report.checks) {
    if (check.status === 'SKIPPED') continue;
    const symbol = check.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
    const dur = `(${(check.durationMs / 1000).toFixed(2)}s)`.padStart(9);
    lines.push(` ${symbol} ${dur}  ${check.name}`);

    if (check.status === 'FAIL') {
      lines.push(`        Category:       ${check.failureCategory}`);
      lines.push(`        Assigned Agent: ${check.assignedAgent?.role} (${check.assignedAgent?.agentFile})`);
      lines.push(`        Reason:         ${check.failureReason}`);
      lines.push(`        Log:            ${check.logPath}`);
    }
  }

  lines.push('');
  lines.push('--------------------------------------------------------------------------------');
  lines.push(
    ` Summary: ${report.summary.passed} Passed | ${report.summary.failed} Failed | ${report.summary.skipped} Skipped (out-of-tier)`
  );
  lines.push(` Report Saved: ${report.reportPath}`);
  lines.push('================================================================================');
  lines.push('');

  return lines.join('\n');
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  try {
    const currentPath = fileURLToPath(import.meta.url);
    const invokedPath = path.resolve(process.argv[1]);
    return currentPath.toLowerCase() === invokedPath.toLowerCase();
  } catch {
    return false;
  }
}

// CLI entry point
if (isMainModule()) {
  const args = process.argv.slice(2);
  let mode: QualityMode = 'quick';

  const modeIdx = args.indexOf('--mode');
  const modeVal = modeIdx !== -1 ? args[modeIdx + 1] : undefined;
  if (modeVal) {
    const candidate = modeVal.toLowerCase();
    if (candidate === 'quick' || candidate === 'targeted' || candidate === 'release') {
      mode = candidate;
    }
  } else if (args.includes('--quick')) {
    mode = 'quick';
  } else if (args.includes('--targeted')) {
    mode = 'targeted';
  } else if (args.includes('--release')) {
    mode = 'release';
  }

  executeQualitySuite({ mode })
    .then((report) => {
      console.log(formatReportConsole(report));
      process.exit(report.exitCode);
    })
    .catch((err) => {
      console.error('Fatal Quality Runner Error:', err);
      process.exit(1);
    });
}
