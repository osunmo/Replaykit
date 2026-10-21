import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  classifyFailure,
  SPECIALIST_MAP,
  FailureCategory,
} from './classifier.js';
import {
  executeQualitySuite,
  formatReportConsole,
  CheckDefinition,
  QualityReport,
} from './quality-runner.js';
import { SYNTHETIC_FIXTURES } from './synthetic-fixtures.js';

describe('Quality Assurance System — Automated Failure Classification & Agent Routing', () => {
  it('classifies invalid Lab assertion as INVALID_GENERATED_TEST and routes to ai-test-specialist', () => {
    const fixture = SYNTHETIC_FIXTURES.invalidLabAssertion;
    const result = classifyFailure(fixture);

    expect(result.category).toBe('INVALID_GENERATED_TEST');
    expect(result.assignedAgent.role).toBe('ai-test-specialist');
    expect(result.assignedAgent.agentFile).toBe('.agents/agents/ai-test-specialist.md');
  });

  it('classifies swallowed assertions as INVALID_GENERATED_TEST and routes to ai-test-specialist', () => {
    const fixture = SYNTHETIC_FIXTURES.swallowedAssertion;
    const result = classifyFailure(fixture);

    expect(result.category).toBe('INVALID_GENERATED_TEST');
    expect(result.assignedAgent.role).toBe('ai-test-specialist');
  });

  it('classifies Docker timeout as DOCKER_TIMEOUT and routes to docker-specialist', () => {
    const fixture = SYNTHETIC_FIXTURES.dockerTimeout;
    const result = classifyFailure(fixture);

    expect(result.category).toBe('DOCKER_TIMEOUT');
    expect(result.assignedAgent.role).toBe('docker-specialist');
    expect(result.assignedAgent.agentFile).toBe('.agents/agents/docker-specialist.md');
  });

  it('classifies protected judge file mutation as EVIDENCE_INTEGRITY_FAILURE and routes to security-auditor', () => {
    const fixture = SYNTHETIC_FIXTURES.protectedFileModification;
    const result = classifyFailure(fixture);

    expect(result.category).toBe('EVIDENCE_INTEGRITY_FAILURE');
    expect(result.assignedAgent.role).toBe('security-auditor');
    expect(result.assignedAgent.agentFile).toBe('.agents/agents/security-auditor.md');
  });

  it('classifies container sandbox violations as SANDBOX_VIOLATION and routes to security-auditor', () => {
    const fixture = SYNTHETIC_FIXTURES.sandboxViolation;
    const result = classifyFailure(fixture);

    expect(result.category).toBe('SANDBOX_VIOLATION');
    expect(result.assignedAgent.role).toBe('security-auditor');
  });

  it('classifies unbundled/missing dependencies as DEPENDENCY_FAILURE and routes to docker-specialist', () => {
    const fixture = SYNTHETIC_FIXTURES.missingDependency;
    const result = classifyFailure(fixture);

    expect(result.category).toBe('DEPENDENCY_FAILURE');
    expect(result.assignedAgent.role).toBe('docker-specialist');
  });

  it('classifies insufficient behavioral oracle as INSUFFICIENT_ORACLE and routes to ai-test-specialist', () => {
    const fixture = SYNTHETIC_FIXTURES.insufficientOracle;
    const result = classifyFailure(fixture);

    expect(result.category).toBe('INSUFFICIENT_ORACLE');
    expect(result.assignedAgent.role).toBe('ai-test-specialist');
  });

  it('classifies TypeScript compiler diagnostics as TYPECHECK_FAILURE and routes to cli-specialist', () => {
    const fixture = SYNTHETIC_FIXTURES.typecheckFailure;
    const result = classifyFailure(fixture);

    expect(result.category).toBe('TYPECHECK_FAILURE');
    expect(result.assignedAgent.role).toBe('cli-specialist');
    expect(result.assignedAgent.agentFile).toBe('.agents/agents/cli-specialist.md');
  });

  it('classifies decoy acceptance as EVALUATOR_FALSE_POSITIVE and routes to test-auditor', () => {
    const fixture = SYNTHETIC_FIXTURES.evaluatorFalsePositive;
    const result = classifyFailure(fixture);

    expect(result.category).toBe('EVALUATOR_FALSE_POSITIVE');
    expect(result.assignedAgent.role).toBe('test-auditor');
    expect(result.assignedAgent.agentFile).toBe('.agents/agents/test-auditor.md');
  });

  it('verifies all 11 failure categories map to valid specialist agent definitions', () => {
    const allCategories: FailureCategory[] = [
      'TYPECHECK_FAILURE',
      'INVALID_GENERATED_TEST',
      'INSUFFICIENT_ORACLE',
      'APPLICATION_REGRESSION',
      'FRAMEWORK_INCOMPATIBILITY',
      'DEPENDENCY_FAILURE',
      'DOCKER_TIMEOUT',
      'SANDBOX_VIOLATION',
      'EVIDENCE_INTEGRITY_FAILURE',
      'EVALUATOR_FALSE_POSITIVE',
      'PERFORMANCE_REGRESSION',
    ];

    for (const cat of allCategories) {
      const specialist = SPECIALIST_MAP[cat];
      expect(specialist).toBeDefined();
      expect(specialist.role).toBeDefined();
      expect(specialist.agentFile).toMatch(/^\.agents\/agents\/.+\.md$/);
    }
  });
});

describe('Quality Assurance System — Executable Quality Runner', () => {
  it('generates an accurate PASS report and exit code 0 when all checks pass', async () => {
    const mockChecks: CheckDefinition[] = [
      {
        id: 'mock-pass-1',
        name: 'Mock Clean Unit Check',
        command: process.execPath,
        args: ['-e', 'console.log(123); process.exit(0);'],
        modes: ['quick', 'targeted', 'release'],
        timeoutMs: 5000,
      },
      {
        id: 'mock-pass-2',
        name: 'Mock Clean Security Check',
        command: process.execPath,
        args: ['-e', 'console.log(456); process.exit(0);'],
        modes: ['quick', 'targeted', 'release'],
        timeoutMs: 5000,
      },
    ];

    const report = await executeQualitySuite({
      mode: 'quick',
      checks: mockChecks,
    });

    expect(report.overallStatus).toBe('PASS');
    expect(report.exitCode).toBe(0);
    expect(report.summary.passed).toBe(2);
    expect(report.summary.failed).toBe(0);
    expect(report.checks[0]?.status).toBe('PASS');
    expect(report.checks[1]?.status).toBe('PASS');
    expect(report.totalDurationMs).toBeGreaterThan(0);

    // Verify machine-readable JSON was written to disk
    const reportOnDisk = JSON.parse(await fs.readFile(report.reportPath, 'utf8')) as QualityReport;
    expect(reportOnDisk.runId).toBe(report.runId);
    expect(reportOnDisk.overallStatus).toBe('PASS');
  });

  it('generates a FAIL report with nonzero exit code and classified agent routing on check failure', async () => {
    const mockChecks: CheckDefinition[] = [
      {
        id: 'mock-pass',
        name: 'Passing Check',
        command: process.execPath,
        args: ['-e', 'process.exit(0);'],
        modes: ['quick', 'targeted', 'release'],
        timeoutMs: 5000,
      },
      {
        id: 'mock-docker-timeout',
        name: 'Simulated Docker Timeout',
        command: process.execPath,
        args: [
          '-e',
          'console.error("Docker command timed out: ps after 10000ms"); process.exit(1);',
        ],
        modes: ['quick', 'targeted', 'release'],
        timeoutMs: 5000,
      },
    ];

    const report = await executeQualitySuite({
      mode: 'quick',
      checks: mockChecks,
    });

    expect(report.overallStatus).toBe('FAIL');
    expect(report.exitCode).toBe(1);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.failed).toBe(1);

    const failedCheck = report.checks.find((c) => c.id === 'mock-docker-timeout');
    expect(failedCheck).toBeDefined();
    expect(failedCheck?.status).toBe('FAIL');
    expect(failedCheck?.failureCategory).toBe('DOCKER_TIMEOUT');
    expect(failedCheck?.assignedAgent?.role).toBe('docker-specialist');
    expect(failedCheck?.assignedAgent?.agentFile).toBe('.agents/agents/docker-specialist.md');

    // Check log file exists
    const logContent = await fs.readFile(failedCheck!.logPath, 'utf8');
    expect(logContent).toContain('Docker command timed out: ps');
  });

  it('marks unexecuted checks from other tiers as SKIPPED, never as PASS', async () => {
    const mockChecks: CheckDefinition[] = [
      {
        id: 'quick-check',
        name: 'Quick Tier Check',
        command: process.execPath,
        args: ['-e', 'process.exit(0);'],
        modes: ['quick', 'targeted', 'release'],
        timeoutMs: 5000,
      },
      {
        id: 'release-only-check',
        name: 'Release Only Verification',
        command: process.execPath,
        args: ['-e', 'process.exit(0);'],
        modes: ['release'],
        timeoutMs: 5000,
      },
    ];

    const report = await executeQualitySuite({
      mode: 'quick',
      checks: mockChecks,
    });

    expect(report.summary.passed).toBe(1);
    expect(report.summary.skipped).toBe(1);

    const skipped = report.checks.find((c) => c.id === 'release-only-check');
    expect(skipped?.status).toBe('SKIPPED');
    expect(skipped?.durationMs).toBe(0);
  });

  it('formats console output cleanly with summary and agent routing details', async () => {
    const report: QualityReport = {
      runId: 'run-test-001',
      mode: 'quick',
      startTime: '2026-10-21T04:00:00Z',
      endTime: '2026-10-21T04:00:02Z',
      totalDurationMs: 2340,
      overallStatus: 'FAIL',
      exitCode: 1,
      summary: { total: 2, passed: 1, failed: 1, skipped: 0 },
      checks: [
        {
          id: 'check-1',
          name: 'Core Runtime Check',
          status: 'PASS',
          durationMs: 1200,
          exitCode: 0,
          stdout: 'ok',
          stderr: '',
          logPath: 'work/quality-runs/run-test-001/check-1.log',
        },
        {
          id: 'check-2',
          name: 'AST Safety Check',
          status: 'FAIL',
          durationMs: 1140,
          exitCode: 1,
          stdout: '',
          stderr: 'SWALLOWED_ASSERTION detected in catch block',
          logPath: 'work/quality-runs/run-test-001/check-2.log',
          failureCategory: 'INVALID_GENERATED_TEST',
          failureReason: 'Generated test contains swallowed assertion',
          assignedAgent: {
            role: 'ai-test-specialist',
            agentFile: '.agents/agents/ai-test-specialist.md',
          },
        },
      ],
      reportPath: 'work/quality-runs/run-test-001/quality-report.json',
    };

    const formatted = formatReportConsole(report);
    expect(formatted).toContain('REPLAYKIT QUALITY RUNNER — MODE: QUICK [FAIL]');
    expect(formatted).toContain('✅ PASS');
    expect(formatted).toContain('❌ FAIL');
    expect(formatted).toContain('Category:       INVALID_GENERATED_TEST');
    expect(formatted).toContain('Assigned Agent: ai-test-specialist (.agents/agents/ai-test-specialist.md)');
    expect(formatted).toContain('1 Passed | 1 Failed | 0 Skipped');
  });
});
