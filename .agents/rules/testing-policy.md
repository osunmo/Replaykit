---
description: Non-negotiable testing policies for ReplayKit including three-tier quality gates, AST validation, assertion proof, and exit code disciplines.
globs: ["**/*.test.ts", "packages/**/*.ts", "scripts/**/*.ts"]
---

# ReplayKit Testing Policy

This policy governs test execution, quality gate selection, assertion validation, and evaluation integrity across ReplayKit.

## 1. Three-Tier Quality Gate Policy

All code modifications must be verified through the appropriate quality gate:

1. **QUICK Gate**:
   - Trigger: Any routine TypeScript/JavaScript or documentation change.
   - Requirements: `pnpm typecheck`, protected file immutability check, fast security scan, and affected unit tests.
   - Execution Time: Under 30 seconds.
2. **TARGETED Gate**:
   - Trigger: Modifications to runtime supervisor, generic adapters, AI generator, CLI router, or Docker cleanup.
   - Requirements: All QUICK checks plus subsystem integration tests, AST safety validation, failure injection tests, and live cleanup dry-runs.
   - Execution Time: Under 2 minutes.
3. **RELEASE Gate**:
   - Trigger: Prior to release tagging, milestone acceptance, or public open-source staging.
   - Requirements: All TARGETED checks plus complete unit test suite (65+ tests), full token scan across all files, demonstration workflow verification, documentation accuracy checks, and Apple ReplayKit trademark review.

## 2. No False-Positive Passes

- **No Empty/Skipped Suites**: An execution that ran zero tests or skipped assertions must **never** report status `PASS` or verdict `VERIFIED`.
- **Positive Assertion Execution Evidence**: The runner and evaluator must verify that test assertions actually executed (e.g., verifying `testsCount > 0`, tracking invocation counters, checking stdout strings or TAP summaries).
- **Reject Swallowed Exceptions**: Tests that wrap critical calls in `.catch(console.error)` or empty `try/catch` blocks without re-throwing or setting a non-zero exit code must be rejected by `validateTestAst()`.

## 3. Four-Target Differential Verification

When evaluating bug reproductions, the generated test must be executed against four distinct targets:
1. **Buggy Base Revision**: Must fail and reproduce the exact error class (`TypeError`, `AssertionError`) and application stack frame.
2. **Reference Fix**: Must pass with exit code 0.
3. **Alternate Independent Fix**: Must pass with exit code 0.
4. **Semantic Decoy Patch**: Must fail on semantic assertions (e.g., catching dropped properties or invalid return shapes with `AssertionError`). A test that passes on the decoy is rejected as tautological.

## 4. Test Discipline and Maintenance

- **Never Suppress Type Errors**: Do not bypass TypeScript compiler errors to satisfy a test gate.
- **Never Weaken Assertions**: If a test fails unexpectedly, investigate the root cause rather than relaxing the assertion threshold.
- **Deterministic Assertions Only**: Tests must not rely on non-deterministic delays (`setTimeout`, `sleep`). Use event-driven synchronization, promises, or cooperative scheduling checkpoints.
