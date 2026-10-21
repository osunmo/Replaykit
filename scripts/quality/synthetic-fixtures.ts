/**
 * ReplayKit — Synthetic Quality Failure Fixtures
 * 
 * Provides deterministic synthetic failure signals representing realistic
 * failure modes across testing, sandboxing, Docker timeouts, and integrity audits.
 */

import { ClassificationInput, FailureCategory, SpecialistRole } from './classifier.js';

export interface SyntheticFixture extends ClassificationInput {
  expectedCategory: FailureCategory;
  expectedRole: SpecialistRole;
}

export const SYNTHETIC_FIXTURES: {
  invalidLabAssertion: SyntheticFixture;
  swallowedAssertion: SyntheticFixture;
  dockerTimeout: SyntheticFixture;
  protectedFileModification: SyntheticFixture;
  sandboxViolation: SyntheticFixture;
  missingDependency: SyntheticFixture;
  insufficientOracle: SyntheticFixture;
  typecheckFailure: SyntheticFixture;
  evaluatorFalsePositive: SyntheticFixture;
} = {
  invalidLabAssertion: {
    checkName: 'ai-ast-validation',
    exitCode: 1,
    stdout: 'Running Lab test suite...\nFailed: Lab assertion error: expect(source.hasOwnProperty).to.be.a.function()',
    stderr: 'Error: validateTestAst failed: Lab assertion error: lab.test failed assertion',
    expectedCategory: 'INVALID_GENERATED_TEST',
    expectedRole: 'ai-test-specialist',
  },

  swallowedAssertion: {
    checkName: 'generic-adapter-test',
    exitCode: 1,
    stdout: 'Test completed with exit code 0\nSWALLOWED_ASSERTION detected in catch handler\nTest failed: AssertionError [ERR_ASSERTION]: expected 200 to equal 500',
    stderr: 'Warning: validateTestAst caught empty catch or swallowed promise error without process.exit(1)',
    expectedCategory: 'INVALID_GENERATED_TEST',
    expectedRole: 'ai-test-specialist',
  },

  dockerTimeout: {
    checkName: 'docker-cleanup-validation',
    exitCode: 1,
    stdout: 'Enumerating ReplayKit containers with filter label=replaykit.run\nDocker command timed out: ps after 10000ms',
    stderr: 'Error: Docker command timed out: ps (ETIMEDOUT)',
    expectedCategory: 'DOCKER_TIMEOUT',
    expectedRole: 'docker-specialist',
  },

  protectedFileModification: {
    checkName: 'protected-files-check',
    exitCode: 1,
    stdout: 'diff --git a/packages/judge/src/evaluate.ts b/packages/judge/src/evaluate.ts\n--- a/packages/judge/src/evaluate.ts\n+++ b/packages/judge/src/evaluate.ts\n@@ -10,1 +10,1 @@',
    stderr: 'Protected file violation: packages/judge/src/evaluate.ts has uncommitted changes',
    expectedCategory: 'EVIDENCE_INTEGRITY_FAILURE',
    expectedRole: 'security-auditor',
  },

  sandboxViolation: {
    checkName: 'sandbox-security-policies',
    exitCode: 1,
    stdout: 'Checking container run flags...\nDetected prohibited flag --privileged without --read-only rootfs',
    stderr: 'SANDBOX_VIOLATION: Container launched with elevated privileges or root user',
    expectedCategory: 'SANDBOX_VIOLATION',
    expectedRole: 'security-auditor',
  },

  missingDependency: {
    checkName: 'runtime-worker-staging',
    exitCode: 1,
    stdout: 'Staging container node_modules payload...\nError: Cannot find module "fastify" (MODULE_NOT_FOUND)',
    stderr: 'MODULE_NOT_FOUND: Failed to resolve fastify in hermetic sandbox',
    expectedCategory: 'DEPENDENCY_FAILURE',
    expectedRole: 'docker-specialist',
  },

  insufficientOracle: {
    checkName: 'ai-generator-blind-synthesis',
    exitCode: 1,
    stdout: 'Parsing incident context for expected behavior specification...\nNo behavior contract or RFC specification found.',
    stderr: 'INSUFFICIENT_ORACLE: cannot deduce expected behavior from stack trace alone',
    expectedCategory: 'INSUFFICIENT_ORACLE',
    expectedRole: 'ai-test-specialist',
  },

  typecheckFailure: {
    checkName: 'typecheck',
    exitCode: 1,
    stdout: 'packages/cli/src/index.ts:42:15 - error TS2322: Type "string" is not assignable to type "number".',
    stderr: 'Found 1 typecheck error in packages/cli/src/index.ts',
    expectedCategory: 'TYPECHECK_FAILURE',
    expectedRole: 'cli-specialist',
  },

  evaluatorFalsePositive: {
    checkName: 'external-evaluator-tests',
    exitCode: 1,
    stdout: 'Running 4-target differential evaluation...\nWarning: decoy accepted with status VERIFIED despite failing semantic invariant',
    stderr: 'EVALUATOR_FALSE_POSITIVE: Candidate patch silencing error was accepted without assertion receipt',
    expectedCategory: 'EVALUATOR_FALSE_POSITIVE',
    expectedRole: 'test-auditor',
  },
};
