# ReplayKit — Automated Failure Classification Taxonomy

This document formalizes the 11 standardized failure categories used by the ReplayKit Quality Assurance System to classify test failures, diagnosis patterns, root-cause signatures, and automated routing rules.

---

## 1. Classification Principles

1. **Evidence-Driven**: Classifications must derive from deterministic signals—exit codes, compiler diagnostics, AST node patterns, exception stack traces, or sandbox security audit receipts—not arbitrary string guesses.
2. **First-Order Root Cause**: When multiple symptoms appear (e.g. a timeout caused by an unmet dependency prompt), classify by the earliest causative event in the execution chain.
3. **Epistemic Honesty**: If an AI generator fails because expected behavior is unknowable from the incident, classify as `INSUFFICIENT_ORACLE`, not a test defect.

---

## 2. Failure Category Catalog

### 1. `TYPECHECK_FAILURE`
- **Definition**: TypeScript compilation or typechecking error in core packages, CLI, or test suites.
- **Diagnostic Signals**:
  - `tsc` emits diagnostic code `TSxxxx` (e.g., `TS2322`, `TS2345`).
  - Vitest fails during module transpilation with syntax/type mismatch.
- **Root Cause Examples**:
  - Missing or mismatched interface properties in `packages/contracts`.
  - Unhandled `undefined` or `null` in strict mode.
  - Zod schema and TypeScript inferred type drift.
- **Assigned Specialist**: `CLI Specialist` (`.agents/agents/cli-specialist.md`)
- **Remediation Boundary**: Adjust TypeScript annotations or code; never use `any` or `@ts-ignore` to suppress genuine type errors.

### 2. `INVALID_GENERATED_TEST`
- **Definition**: An AI-synthesized test file contains syntax errors, forbidden APIs, or anti-patterns that prevent valid execution or hide failures.
- **Diagnostic Signals**:
  - `validateTestAst()` fails with `SWALLOWED_ASSERTION`, `UNPROTECTED_PROMISE`, `SYNTAX_ERROR`, or `MISSING_ASSERTIONS`.
  - Presence of empty `.catch(() => {})` blocks without process failure.
  - Test relies on unpermitted globals (`eval`, `Function`, external network modules).
- **Root Cause Examples**:
  - LLM outputs Markdown code fences embedded inside JavaScript strings.
  - LLM swallows error inside promise rejection without `process.exit(1)`.
- **Assigned Specialist**: `AI Test Specialist` (`.agents/agents/ai-test-specialist.md`)
- **Remediation Boundary**: Adjust prompt template or AST sanitizer; do NOT manually rewrite the AI test and pretend it was model-generated.

### 3. `INSUFFICIENT_ORACLE`
- **Definition**: The incident report, stack trace, and provided documentation do not contain sufficient behavioral specification to deduce the correct output.
- **Diagnostic Signals**:
  - Incident context lacks expected status code, return value, or invariant specification.
  - Generator explicitly returns `{ status: "ABSTAIN", reason: "INSUFFICIENT_ORACLE" }`.
- **Root Cause Examples**:
  - Sentry event captures a `500 Internal Server Error` with a malformed URL, but RFC/framework spec does not state whether the expected response is 400, 404, or a custom error payload.
- **Assigned Specialist**: `AI Test Specialist` (`.agents/agents/ai-test-specialist.md`)
- **Remediation Boundary**: Request explicit contract conditioning or record an honest abstention.

### 4. `APPLICATION_REGRESSION`
- **Definition**: A code change or candidate patch causes previously passing upstream tests or baseline invariant checks to fail.
- **Diagnostic Signals**:
  - Baseline upstream suite fails (e.g. qs 55 baseline tests drop to 54).
  - Unrelated endpoints or methods throw unexpected exceptions.
- **Root Cause Examples**:
  - A bug fix for nested key parsing breaks basic flat key-value query string decoding.
- **Assigned Specialist**: `Test Auditor` (`.agents/agents/test-auditor.md`)
- **Remediation Boundary**: Revert or refine the patch; candidate must be rejected by the evaluator.

### 5. `FRAMEWORK_INCOMPATIBILITY`
- **Definition**: The test structure or runner options do not match the historical repository's test framework (e.g., Lab vs Tap vs Mocha vs Vitest).
- **Diagnostic Signals**:
  - `describe` or `it` not defined when running in Lab v5.
  - Process hangs waiting for `done()` callback in a Promise-based test runner.
  - Tap parser receives malformed non-TAP lines and fails to extract test IDs.
- **Root Cause Examples**:
  - Attempting to use Jest/Mocha assertions in a legacy Node 0.10 / Lab test harness.
- **Assigned Specialist**: `AI Test Specialist` (`.agents/agents/ai-test-specialist.md`)
- **Remediation Boundary**: Configure correct framework harness adapter (`packages/runtime/src/adapters/`).

### 6. `DEPENDENCY_FAILURE`
- **Definition**: Missing, incompatible, or improperly staged third-party dependencies in the container execution root.
- **Diagnostic Signals**:
  - `Cannot find module 'xxx'` or `MODULE_NOT_FOUND` during container entrypoint execution.
  - Dependency integrity check fails against lockfile.
- **Root Cause Examples**:
  - Offline container (`--network none`) cannot resolve an unbundled transitive dependency.
  - Staging script omitted `node_modules` symlink or copy.
- **Assigned Specialist**: `Docker Specialist` (`.agents/agents/docker-specialist.md`)
- **Remediation Boundary**: Stage required dependencies in the hermetic payload before container invocation.

### 7. `DOCKER_TIMEOUT`
- **Definition**: Container execution, command enumeration, or cleanup operation exceeds its allocated deadline.
- **Diagnostic Signals**:
  - Child process killed after timeout duration (e.g., 5000ms, 30000ms).
  - Error: `Docker command timed out: ps` or `Container execution exceeded 30000ms`.
- **Root Cause Examples**:
  - Hanging child process waiting on stdin.
  - Docker daemon enumeration latency on Windows host.
  - Unhandled infinite loop in tested code.
- **Assigned Specialist**: `Docker Specialist` (`.agents/agents/docker-specialist.md`)
- **Remediation Boundary**: Enforce bounded process tree termination (`taskkill /T /F`) and audit subprocess lifecycle.

### 8. `SANDBOX_VIOLATION`
- **Definition**: Container execution configuration attempts to bypass hermetic security boundaries.
- **Diagnostic Signals**:
  - Container spawned without `--network none`.
  - Root UID/GID detected (`0:0` instead of `10001:10001`).
  - Writable root filesystem or missing `--read-only` flag.
  - Capability set contains privileges outside empty set (`--cap-drop ALL` missing).
- **Root Cause Examples**:
  - Developer script added `--privileged` to work around a permission error.
- **Assigned Specialist**: `Security Auditor` (`.agents/agents/security-auditor.md`)
- **Remediation Boundary**: Immediate execution abort; enforce sandbox invariants defined in `.agents/rules/security-invariants.md`.

### 9. `EVIDENCE_INTEGRITY_FAILURE`
- **Definition**: Cryptographic hash mismatch, corrupted output artifacts, missing execution receipts, or unauthorized mutation of protected files.
- **Diagnostic Signals**:
  - `git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts` exits nonzero.
  - Computed SHA-256 of candidate patch does not match frozen manifest.
  - Missing raw `stdout.log` or `stderr.log` in run directory.
- **Root Cause Examples**:
  - Manual modification of protected judge code.
  - Accidental edit to an immutable historical run directory (`work/phase2/`).
- **Assigned Specialist**: `Security Auditor` (`.agents/agents/security-auditor.md`)
- **Remediation Boundary**: Immediate halt; restore protected file or patch from immutable manifest.

### 10. `EVALUATOR_FALSE_POSITIVE`
- **Definition**: Evaluator accepts an incorrect candidate (e.g. decoy) or returns `VERIFIED` on an incomplete or failed execution.
- **Diagnostic Signals**:
  - Candidate patch that silences errors by returning dummy data passes evaluation.
  - Evaluator emits `VERIFIED` when one or more gate checks failed.
- **Root Cause Examples**:
  - Differential evaluation matrix omitted semantic decoy check.
  - Evaluator trusted exit code 0 without verifying assertion execution count.
- **Assigned Specialist**: `Test Auditor` (`.agents/agents/test-auditor.md`)
- **Remediation Boundary**: Harden evaluation rules; require proof of assertion execution and semantic differentiation.

### 11. `PERFORMANCE_REGRESSION`
- **Definition**: Execution duration or resource consumption exceeds acceptable limits by more than 2x baseline.
- **Diagnostic Signals**:
  - Stage execution time (e.g. generation, test execution, cleanup) exceeds performance threshold.
  - Memory or CPU spikes during container execution.
- **Root Cause Examples**:
  - Repeated container restarts without reuse or unnecessary re-hashing of large trees.
- **Assigned Specialist**: `CLI Specialist` (`.agents/agents/cli-specialist.md`)
- **Remediation Boundary**: Optimize staging, caching, or enumeration without weakening timeouts or isolation.
