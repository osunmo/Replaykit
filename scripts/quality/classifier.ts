/**
 * ReplayKit — Automated Failure Classifier & Agent Router
 * 
 * Classifies failure signals from test runs, compiler output, container logs,
 * and security audits into one of 11 standardized categories, and routes to
 * the responsible specialized agent.
 */

export type FailureCategory =
  | 'TYPECHECK_FAILURE'
  | 'INVALID_GENERATED_TEST'
  | 'INSUFFICIENT_ORACLE'
  | 'APPLICATION_REGRESSION'
  | 'FRAMEWORK_INCOMPATIBILITY'
  | 'DEPENDENCY_FAILURE'
  | 'DOCKER_TIMEOUT'
  | 'SANDBOX_VIOLATION'
  | 'EVIDENCE_INTEGRITY_FAILURE'
  | 'EVALUATOR_FALSE_POSITIVE'
  | 'PERFORMANCE_REGRESSION';

export type SpecialistRole =
  | 'test-auditor'
  | 'ai-test-specialist'
  | 'docker-specialist'
  | 'cli-specialist'
  | 'security-auditor';

export interface AgentAssignment {
  role: SpecialistRole;
  agentFile: string;
  description: string;
}

export const SPECIALIST_MAP: Record<FailureCategory, AgentAssignment> = {
  TYPECHECK_FAILURE: {
    role: 'cli-specialist',
    agentFile: '.agents/agents/cli-specialist.md',
    description: 'Fixes TypeScript, schema, and command integration errors',
  },
  INVALID_GENERATED_TEST: {
    role: 'ai-test-specialist',
    agentFile: '.agents/agents/ai-test-specialist.md',
    description: 'Investigates AST defects, swallowed errors, and assertion validity',
  },
  INSUFFICIENT_ORACLE: {
    role: 'ai-test-specialist',
    agentFile: '.agents/agents/ai-test-specialist.md',
    description: 'Audits incident context, behavioral contracts, and honest abstentions',
  },
  APPLICATION_REGRESSION: {
    role: 'test-auditor',
    agentFile: '.agents/agents/test-auditor.md',
    description: 'Investigates baseline regressions and unexpected application test failures',
  },
  FRAMEWORK_INCOMPATIBILITY: {
    role: 'ai-test-specialist',
    agentFile: '.agents/agents/ai-test-specialist.md',
    description: 'Ensures generated tests conform to framework-specific test runner APIs',
  },
  DEPENDENCY_FAILURE: {
    role: 'docker-specialist',
    agentFile: '.agents/agents/docker-specialist.md',
    description: 'Resolves missing packages, offline staging, and node_modules dependencies',
  },
  DOCKER_TIMEOUT: {
    role: 'docker-specialist',
    agentFile: '.agents/agents/docker-specialist.md',
    description: 'Diagnoses container latency, Windows process execution, and resource cleanup',
  },
  SANDBOX_VIOLATION: {
    role: 'security-auditor',
    agentFile: '.agents/agents/security-auditor.md',
    description: 'Enforces container isolation, network-none, non-root, and read-only rootfs',
  },
  EVIDENCE_INTEGRITY_FAILURE: {
    role: 'security-auditor',
    agentFile: '.agents/agents/security-auditor.md',
    description: 'Enforces protected file immutability, cryptographic SHA-256 digests, and raw logs',
  },
  EVALUATOR_FALSE_POSITIVE: {
    role: 'test-auditor',
    agentFile: '.agents/agents/test-auditor.md',
    description: 'Detects decoy acceptance, false-positive exit codes, and missing assertions',
  },
  PERFORMANCE_REGRESSION: {
    role: 'cli-specialist',
    agentFile: '.agents/agents/cli-specialist.md',
    description: 'Optimizes slow stages, subprocess execution, and resource utilization',
  },
};

export interface ClassificationInput {
  checkName?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string | Error;
}

export interface ClassificationResult {
  category: FailureCategory;
  reason: string;
  assignedAgent: AgentAssignment;
  matchedRule: string;
}

export function classifyFailure(input: ClassificationInput): ClassificationResult {
  const combinedText = [
    input.checkName ?? '',
    input.stdout ?? '',
    input.stderr ?? '',
    input.error instanceof Error ? input.error.message : (input.error ?? ''),
  ].join('\n');

  // Rule 1: Protected files or evidence hash integrity
  if (
    combinedText.includes('protected file') ||
    combinedText.includes('packages/judge/src/evaluate.ts') ||
    combinedText.includes('packages/contracts/src/index.ts') ||
    combinedText.includes('hash mismatch') ||
    combinedText.includes('EVIDENCE_INTEGRITY') ||
    combinedText.includes('missing raw log')
  ) {
    return {
      category: 'EVIDENCE_INTEGRITY_FAILURE',
      reason: 'Protected file modification, SHA-256 mismatch, or missing execution evidence detected',
      assignedAgent: SPECIALIST_MAP.EVIDENCE_INTEGRITY_FAILURE,
      matchedRule: 'RULE_EVIDENCE_INTEGRITY',
    };
  }

  // Rule 2: Sandbox security violation
  if (
    combinedText.includes('SANDBOX_VIOLATION') ||
    combinedText.includes('privileged') ||
    combinedText.includes('--network') && combinedText.includes('host') ||
    combinedText.includes('root user') ||
    combinedText.includes('read-only rootfs violation')
  ) {
    return {
      category: 'SANDBOX_VIOLATION',
      reason: 'Hermetic container sandbox constraint violated (network, user, or rootfs)',
      assignedAgent: SPECIALIST_MAP.SANDBOX_VIOLATION,
      matchedRule: 'RULE_SANDBOX_VIOLATION',
    };
  }

  // Rule 3: Docker / subprocess timeout or cancellation
  const isKilled = (input.error as any)?.killed === true || (input.error as any)?.signal === 'SIGTERM';
  const hasTimeoutText =
    combinedText.includes('timed out') ||
    combinedText.includes('TIMEOUT') ||
    combinedText.includes('ETIMEDOUT') ||
    combinedText.includes('Docker command timed out') ||
    combinedText.includes('exceeded deadline');

  if (isKilled || hasTimeoutText) {
    if (combinedText.toLowerCase().includes('docker')) {
      return {
        category: 'DOCKER_TIMEOUT',
        reason: 'Docker command or container execution exceeded allocated deadline',
        assignedAgent: SPECIALIST_MAP.DOCKER_TIMEOUT,
        matchedRule: 'RULE_DOCKER_TIMEOUT',
      };
    }
    return {
      category: 'PERFORMANCE_REGRESSION',
      reason: 'Execution timed out or exceeded duration threshold',
      assignedAgent: SPECIALIST_MAP.PERFORMANCE_REGRESSION,
      matchedRule: 'RULE_PERFORMANCE_TIMEOUT',
    };
  }

  // Rule 4: Missing or unbundled dependencies
  if (
    combinedText.includes('MODULE_NOT_FOUND') ||
    combinedText.includes('Cannot find module') ||
    combinedText.includes('ERR_MODULE_NOT_FOUND') ||
    combinedText.includes('missing dependency') ||
    combinedText.includes('node_modules') && combinedText.includes('not found')
  ) {
    return {
      category: 'DEPENDENCY_FAILURE',
      reason: 'Missing, unbundled, or incompatible module dependency in sandbox staging',
      assignedAgent: SPECIALIST_MAP.DEPENDENCY_FAILURE,
      matchedRule: 'RULE_DEPENDENCY_FAILURE',
    };
  }

  // Rule 5: TypeScript compilation / typecheck failures
  if (
    combinedText.includes('typecheck') ||
    /\bTS\d{4,5}\b/.test(combinedText) ||
    combinedText.includes('Type error:') ||
    combinedText.includes('Typescript syntax error')
  ) {
    return {
      category: 'TYPECHECK_FAILURE',
      reason: 'TypeScript compiler diagnostic or type incompatibility detected',
      assignedAgent: SPECIALIST_MAP.TYPECHECK_FAILURE,
      matchedRule: 'RULE_TYPECHECK_FAILURE',
    };
  }

  // Rule 6: Insufficient behavioral oracle
  if (
    combinedText.includes('INSUFFICIENT_ORACLE') ||
    combinedText.includes('insufficient oracle') ||
    combinedText.includes('oracle missing') ||
    combinedText.includes('cannot deduce expected behavior')
  ) {
    return {
      category: 'INSUFFICIENT_ORACLE',
      reason: 'Incident context lacks required behavioral specification to synthesize assertions',
      assignedAgent: SPECIALIST_MAP.INSUFFICIENT_ORACLE,
      matchedRule: 'RULE_INSUFFICIENT_ORACLE',
    };
  }

  // Rule 7: Invalid generated test / swallowed assertions / AST errors
  if (
    combinedText.includes('SWALLOWED_ASSERTION') ||
    combinedText.includes('swallowed') ||
    combinedText.includes('empty catch') ||
    combinedText.includes('INVALID_GENERATED_TEST') ||
    combinedText.includes('MISSING_ASSERTIONS') ||
    combinedText.includes('validateTestAst') ||
    combinedText.includes('Lab assertion error') ||
    combinedText.includes('forbidden global')
  ) {
    return {
      category: 'INVALID_GENERATED_TEST',
      reason: 'Generated test violates AST safety, contains swallowed assertions, or lacks assertions',
      assignedAgent: SPECIALIST_MAP.INVALID_GENERATED_TEST,
      matchedRule: 'RULE_INVALID_GENERATED_TEST',
    };
  }

  // Rule 8: Framework incompatibility
  if (
    combinedText.includes('FRAMEWORK_INCOMPATIBILITY') ||
    combinedText.includes('lab.test is not a function') ||
    combinedText.includes('unsupported test runner') ||
    combinedText.includes('TAP parsing failed')
  ) {
    return {
      category: 'FRAMEWORK_INCOMPATIBILITY',
      reason: 'Test harness structure does not match repository test framework',
      assignedAgent: SPECIALIST_MAP.FRAMEWORK_INCOMPATIBILITY,
      matchedRule: 'RULE_FRAMEWORK_INCOMPATIBILITY',
    };
  }

  // Rule 9: Evaluator false positive / decoy acceptance
  if (
    combinedText.includes('EVALUATOR_FALSE_POSITIVE') ||
    combinedText.includes('decoy accepted') ||
    combinedText.includes('false-positive exit code') ||
    combinedText.includes('unverified promotion')
  ) {
    return {
      category: 'EVALUATOR_FALSE_POSITIVE',
      reason: 'Evaluator incorrectly accepted an invalid repair or unverified candidate',
      assignedAgent: SPECIALIST_MAP.EVALUATOR_FALSE_POSITIVE,
      matchedRule: 'RULE_EVALUATOR_FALSE_POSITIVE',
    };
  }

  // Rule 10: Performance regression
  if (
    combinedText.includes('PERFORMANCE_REGRESSION') ||
    combinedText.includes('execution duration exceeded threshold') ||
    combinedText.includes('memory spike')
  ) {
    return {
      category: 'PERFORMANCE_REGRESSION',
      reason: 'Stage duration or resource consumption exceeded 2x baseline limits',
      assignedAgent: SPECIALIST_MAP.PERFORMANCE_REGRESSION,
      matchedRule: 'RULE_PERFORMANCE_REGRESSION',
    };
  }

  // Rule 11: Application regression (default for test failures)
  return {
    category: 'APPLICATION_REGRESSION',
    reason: 'Application test failure or baseline invariant regression detected',
    assignedAgent: SPECIALIST_MAP.APPLICATION_REGRESSION,
    matchedRule: 'RULE_APPLICATION_REGRESSION_DEFAULT',
  };
}
