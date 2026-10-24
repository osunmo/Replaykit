# ReplayKit — Permanent Quality Test Matrix

This document defines the permanent quality verification matrix for ReplayKit. Every subsystem, failure mode, and operational invariant is cataloged with its executable test implementation, triggering condition, responsible specialist agent, required evidence, and severity rating.

---

## Matrix Overview & Tiers

ReplayKit executes tests across three hierarchical gate tiers:
- **QUICK (Tier 1)**: Executed after routine code edits (<30s). Covers TypeScript compilation, syntax validation, fast security scanning, and affected unit tests.
- **TARGETED (Tier 2)**: Executed when modifying specific subsystems (<2m). Covers integration adapters, AST validation, Docker failure injection, and CLI commands.
- **RELEASE (Tier 3)**: Executed before any release milestone or upon explicit request (<10m). Covers full 65+ test suite, end-to-end multi-target verification, sandbox security audits, and token scanning across all files.

---

## 25 Quality Categories

### 1. TypeScript Typechecking & Build Correctness
- **Category ID**: `TM-01-TYPECHECK`
- **Test Command**: `pnpm typecheck`
- **Implementation**: `tsconfig.json`, `packages/*/tsconfig.json`
- **Triggering Condition**: Any change to `packages/**/*.ts`, `scripts/**/*.ts`, `examples/**/*.ts`. (QUICK)
- **Responsible Agent**: `CLI Specialist` (`.agents/agents/cli-specialist.md`)
- **Expected Evidence**: Zero compiler diagnostics across all workspaces; exit code 0.
- **Severity**: `BLOCKER`
- **Implementation Status**: `IMPLEMENTED`

### 2. CLI Argument & Configuration Validation
- **Category ID**: `TM-02-CLI-CONFIG`
- **Test Command**: `pnpm vitest run packages/cli/test/developer-command.test.ts packages/cli/test/integration-command.test.ts`
- **Implementation**: [`packages/cli/src/developer-command.ts`](file:///packages/cli/src/developer-command.ts), Zod schemas in `packages/contracts/src/incident-context.ts`
- **Triggering Condition**: Any change to `packages/cli/**`, `packages/contracts/**`. (QUICK)
- **Responsible Agent**: `CLI Specialist` (`.agents/agents/cli-specialist.md`)
- **Expected Evidence**: Valid arguments parse cleanly; invalid flags/paths emit structured error messages and nonzero exit code.
- **Severity**: `CRITICAL`
- **Implementation Status**: `IMPLEMENTED`

### 3. Incident Parsing & Sanitization
- **Category ID**: `TM-03-INCIDENT-SANITIZATION`
- **Test Command**: `pnpm vitest run packages/sentry/src/normalize.test.ts packages/sentry/src/security.test.ts`
- **Implementation**: [`packages/runtime/src/sanitizer.ts`](file:///packages/runtime/src/sanitizer.ts), `packages/sentry/src/normalize.ts`
- **Triggering Condition**: Changes to incident ingestion, Sentry adapters, or sanitization logic. (TARGETED)
- **Responsible Agent**: `Security Auditor` (`.agents/agents/security-auditor.md`)
- **Expected Evidence**: PII, bearer tokens, passwords, cookies, and secret environment variables redacted before generator exposure.
- **Severity**: `BLOCKER`
- **Implementation Status**: `IMPLEMENTED`

### 4. Oracle Sufficiency & Abstention
- **Category ID**: `TM-04-ORACLE-SUFFICIENCY`
- **Test Command**: `pnpm vitest run packages/runtime/src/blind-synthesis.test.ts -t "oracle"`
- **Implementation**: [`packages/runtime/src/ai-generator.ts`](file:///packages/runtime/src/ai-generator.ts) (`evaluateOracleSufficiency`)
- **Triggering Condition**: Changes to generator prompts, incident contract schemas, or oracle evaluation. (TARGETED)
- **Responsible Agent**: `AI Test Specialist` (`.agents/agents/ai-test-specialist.md`)
- **Expected Evidence**: If behavioral contract is absent, generator returns `INSUFFICIENT_ORACLE` rather than hallucinating assertions.
- **Severity**: `CRITICAL`
- **Implementation Status**: `IMPLEMENTED`

### 5. Generated-Test Syntax & Assertion Compatibility
- **Category ID**: `TM-05-TEST-AST-VALIDITY`
- **Test Command**: `pnpm vitest run packages/runtime/src/blind-synthesis.test.ts -t "AST"`
- **Implementation**: [`packages/runtime/src/ai-generator.ts`](file:///packages/runtime/src/ai-generator.ts) (`validateTestAst`)
- **Triggering Condition**: Changes to test generation or test validation logic. (TARGETED)
- **Responsible Agent**: `AI Test Specialist` (`.agents/agents/ai-test-specialist.md`)
- **Expected Evidence**: AST parser verifies syntax, rejects forbidden globals (`eval`, `Function`), and enforces framework-specific runner APIs (`lab.test`, `node:test`).
- **Severity**: `CRITICAL`
- **Implementation Status**: `IMPLEMENTED`

### 6. Swallowed Exceptions & False-Positive Process Success
- **Category ID**: `TM-06-SWALLOWED-EXCEPTIONS`
- **Test Command**: `pnpm vitest run packages/runtime/src/adapters/generic-adapter.test.ts -t "swallowed"`
- **Implementation**: [`packages/runtime/src/adapters/generic-adapter.ts`](file:///packages/runtime/src/adapters/generic-adapter.ts) (`normalizeGenericTestOutput`), [`packages/runtime/src/ai-generator.ts`](file:///packages/runtime/src/ai-generator.ts) (`validateTestAst`)
- **Triggering Condition**: Changes to test execution adapters or AST validation. (TARGETED)
- **Responsible Agent**: `Test Auditor` (`.agents/agents/test-auditor.md`)
- **Expected Evidence**: Catches `.catch(err => { console.error(err); })` without `process.exit(1)`, empty catch blocks, or unhandled promise rejections; flags them as `INVALID_GENERATED_TEST`.
- **Severity**: `BLOCKER`
- **Implementation Status**: `IMPLEMENTED`

### 7. Positive Proof That Assertions Executed
- **Category ID**: `TM-07-ASSERTION-EXECUTION-PROOF`
- **Test Command**: `pnpm vitest run packages/runtime/src/adapters/generic-adapter.test.ts -t "assertion count"`
- **Implementation**: [`packages/runtime/src/adapters/generic-adapter.ts`](file:///packages/runtime/src/adapters/generic-adapter.ts), [`packages/runtime/src/fixtures/fastify4807/hardened-repro.test.js`](file:///packages/runtime/src/fixtures/fastify4807/hardened-repro.test.js)
- **Triggering Condition**: Changes to test runner adapters or evaluation logic. (TARGETED)
- **Responsible Agent**: `Test Auditor` (`.agents/agents/test-auditor.md`)
- **Expected Evidence**: Process exit 0 alone is rejected unless verified assertion counters or explicit `plan()` receipts confirm test body execution.
- **Severity**: `BLOCKER`
- **Implementation Status**: `IMPLEMENTED`

### 8. Missing or Unsupported Dependencies
- **Category ID**: `TM-08-DEPENDENCY-VALIDATION`
- **Test Command**: `pnpm vitest run packages/runtime/src/adapters/generic-adapter.test.ts -t "dependencies"`
- **Implementation**: [`packages/runtime/src/adapters/generic-adapter.ts`](file:///packages/runtime/src/adapters/generic-adapter.ts)
- **Triggering Condition**: Changes to runtime workspace staging, dependency preparation, or image builds. (TARGETED)
- **Responsible Agent**: `Docker Specialist` (`.agents/agents/docker-specialist.md`)
- **Expected Evidence**: Missing `node_modules` or unmet peer dependencies detected during pre-flight staging before container launch.
- **Severity**: `HIGH`
- **Implementation Status**: `IMPLEMENTED`

### 9. Authentic Buggy-Source Reproduction
- **Category ID**: `TM-09-BUGGY-REPRODUCTION`
- **Test Command**: `pnpm vitest run packages/runtime/src/external-runner.test.ts -t "buggy"`
- **Implementation**: [`packages/runtime/src/external-runner.ts`](file:///packages/runtime/src/external-runner.ts), [`packages/runtime/src/external-supervisor.ts`](file:///packages/runtime/src/external-supervisor.ts)
- **Triggering Condition**: Changes to container runner or supervisor. (TARGETED/RELEASE)
- **Responsible Agent**: `Test Auditor` (`.agents/agents/test-auditor.md`)
- **Expected Evidence**: Execution against pinned buggy commit fails with exact historical error type, error message, and top stack frame.
- **Severity**: `BLOCKER`
- **Implementation Status**: `IMPLEMENTED`

### 10. Reference-Fix and Alternate-Fix Acceptance
- **Category ID**: `TM-10-FIX-ACCEPTANCE`
- **Test Command**: `pnpm vitest run packages/judge/src/external.test.ts packages/benchmark-runner/src/candidate.test.ts`
- **Implementation**: [`packages/judge/src/external.ts`](file:///packages/judge/src/external.ts), [`packages/runtime/src/candidate-patches.ts`](file:///packages/runtime/src/candidate-patches.ts)
- **Triggering Condition**: Changes to evaluator logic or patch applier. (TARGETED/RELEASE)
- **Responsible Agent**: `Test Auditor` (`.agents/agents/test-auditor.md`)
- **Expected Evidence**: Reference fix and structurally distinct alternate fix both exit 0 with all non-regression and regression assertions passing.
- **Severity**: `BLOCKER`
- **Implementation Status**: `IMPLEMENTED`

### 11. Incorrect Semantic Decoy Rejection
- **Category ID**: `TM-11-DECOY-REJECTION`
- **Test Command**: `pnpm vitest run packages/judge/src/external.test.ts -t "decoy"`
- **Implementation**: [`packages/judge/src/external.ts`](file:///packages/judge/src/external.ts)
- **Triggering Condition**: Changes to differential evaluator or candidate scoring. (TARGETED/RELEASE)
- **Responsible Agent**: `Test Auditor` (`.agents/agents/test-auditor.md`)
- **Expected Evidence**: Evaluator rejects superficial fixes that silence errors without restoring semantic invariants (e.g. empty-object return).
- **Severity**: `BLOCKER`
- **Implementation Status**: `IMPLEMENTED`

### 12. Test-Failure Identity & Stack-Frame Verification
- **Category ID**: `TM-12-FAILURE-FRAME-VERIFICATION`
- **Test Command**: `pnpm vitest run packages/runtime/src/adapters/generic-adapter.test.ts -t "stack frame"`
- **Implementation**: [`packages/runtime/src/adapters/generic-adapter.ts`](file:///packages/runtime/src/adapters/generic-adapter.ts)
- **Triggering Condition**: Changes to output parsing or error frame extraction. (TARGETED)
- **Responsible Agent**: `Test Auditor` (`.agents/agents/test-auditor.md`)
- **Expected Evidence**: Normalized output contains verified `failureIdentity` matching expected library frame (e.g. `lib/utils.js:47:20` or `lib/request.js:204`).
- **Severity**: `CRITICAL`
- **Implementation Status**: `IMPLEMENTED`

### 13. Baseline Controls vs Full Upstream Suite Results
- **Category ID**: `TM-13-BASELINE-REGRESSION-CONTROLS`
- **Test Command**: `pnpm vitest run packages/runtime/src/adapters/generic-adapter.test.ts -t "baseline"`
- **Implementation**: [`packages/runtime/src/adapters/generic-adapter.ts`](file:///packages/runtime/src/adapters/generic-adapter.ts)
- **Triggering Condition**: Changes to test execution adapters or runner configs. (TARGETED)
- **Responsible Agent**: `Test Auditor` (`.agents/agents/test-auditor.md`)
- **Expected Evidence**: Baseline upstream test suite must remain green across all candidate runs; unrelated regressions cause immediate run rejection.
- **Severity**: `BLOCKER`
- **Implementation Status**: `IMPLEMENTED`

### 14. Patch and Test SHA-256 Integrity
- **Category ID**: `TM-14-HASH-INTEGRITY`
- **Test Command**: `pnpm vitest run packages/benchmark-runner/src/patch.test.ts`
- **Implementation**: [`packages/runtime/src/candidate-patches.ts`](file:///packages/runtime/src/candidate-patches.ts)
- **Triggering Condition**: Changes to patch storage, artifact generation, or hashing. (QUICK)
- **Responsible Agent**: `Security Auditor` (`.agents/agents/security-auditor.md`)
- **Expected Evidence**: SHA-256 digests computed at creation match digests recomputed before application; mismatches abort execution immediately.
- **Severity**: `BLOCKER`
- **Implementation Status**: `IMPLEMENTED`

### 15. Timeout, Cancellation, and Interrupted Execution
- **Category ID**: `TM-15-TIMEOUT-AND-CANCELLATION`
- **Test Command**: `pnpm vitest run packages/runtime/src/docker-cleanup.test.ts -t "timeout"`
- **Implementation**: [`packages/runtime/src/docker-cleanup.ts`](file:///packages/runtime/src/docker-cleanup.ts), [`packages/judge/src/docker.ts`](file:///packages/judge/src/docker.ts)
- **Triggering Condition**: Changes to Docker wrapper, process spawning, or timeouts. (TARGETED)
- **Responsible Agent**: `Docker Specialist` (`.agents/agents/docker-specialist.md`)
- **Expected Evidence**: Timed-out processes terminate via recursive tree-kill (`taskkill /T /F` on Windows); exit code indicates timeout; resources cleaned up.
- **Severity**: `HIGH`
- **Implementation Status**: `IMPLEMENTED`

### 16. Docker Permissions, Offline Network, and Read-Only Filesystem
- **Category ID**: `TM-16-SANDBOX-ISOLATION`
- **Test Command**: `pnpm vitest run packages/judge/src/sandbox-policy.test.ts packages/judge/src/sandbox-manifest.test.ts`
- **Implementation**: [`packages/judge/src/docker.ts`](file:///packages/judge/src/docker.ts), [`packages/runtime/src/external-supervisor.ts`](file:///packages/runtime/src/external-supervisor.ts)
- **Triggering Condition**: Changes to container launch arguments or security profiles. (QUICK)
- **Responsible Agent**: `Security Auditor` (`.agents/agents/security-auditor.md`)
- **Expected Evidence**: Inspecting candidate/planner or external-test container invocation and Docker `Config.User` verifies `--network none`, `--read-only`, non-root `--user 1000:1000`, `--cap-drop ALL`, `--security-opt no-new-privileges`. Verify other roles against their own profile; PostgreSQL uses `70:70`.
- **Severity**: `BLOCKER`
- **Implementation Status**: `IMPLEMENTED`

### 17. Container, Volume, and Network Cleanup
- **Category ID**: `TM-17-DOCKER-CLEANUP`
- **Test Command**: `pnpm vitest run packages/runtime/src/docker-cleanup.test.ts`
- **Implementation**: [`packages/runtime/src/docker-cleanup.ts`](file:///packages/runtime/src/docker-cleanup.ts), [`packages/judge/src/cleanup.test.ts`](file:///packages/judge/src/cleanup.test.ts)
- **Triggering Condition**: Changes to Docker cleanup or container naming. (TARGETED)
- **Responsible Agent**: `Docker Specialist` (`.agents/agents/docker-specialist.md`)
- **Expected Evidence**: Only ReplayKit-owned resources (`replaykit.run` label) are removed. User development containers (`replaykit-postgres-1`, `dockroute-demo-*`) are completely untouched.
- **Severity**: `BLOCKER`
- **Implementation Status**: `IMPLEMENTED`

### 18. Evidence Completeness & Immutability
- **Category ID**: `TM-18-EVIDENCE-IMMUTABILITY`
- **Test Command**: `pnpm vitest run packages/cli/src/provenance.test.ts`
- **Implementation**: [`packages/runtime/src/blind-evaluator.ts`](file:///packages/runtime/src/blind-evaluator.ts), [`packages/contracts/src/index.ts`](file:///packages/contracts/src/index.ts)
- **Triggering Condition**: Changes to report generation or evidence recording. (TARGETED)
- **Responsible Agent**: `Security Auditor` (`.agents/agents/security-auditor.md`)
- **Expected Evidence**: Every run directory contains complete JSON summary, raw stdout/stderr logs, artifact hashes, and cannot overwrite prior runs.
- **Severity**: `CRITICAL`
- **Implementation Status**: `IMPLEMENTED`

### 19. Model Inference Provenance & Fresh-Generation Classification
- **Category ID**: `TM-19-MODEL-PROVENANCE`
- **Test Command**: `pnpm vitest run packages/runtime/src/blind-synthesis.test.ts -t "provenance"`
- **Implementation**: [`packages/runtime/src/ai-generator.ts`](file:///packages/runtime/src/ai-generator.ts)
- **Triggering Condition**: Changes to AI generator pipeline or prompt construction. (TARGETED)
- **Responsible Agent**: `AI Test Specialist` (`.agents/agents/ai-test-specialist.md`)
- **Expected Evidence**: Generation manifest records model ID, temperature, prompt SHA-256, response latency, and explicit classification (`CONTRACT_CONDITIONED` vs `UNCONDITIONED`).
- **Severity**: `HIGH`
- **Implementation Status**: `IMPLEMENTED`

### 20. Performance Timings & Resource Consumption
- **Category ID**: `TM-20-PERFORMANCE-TIMINGS`
- **Test Command**: `pnpm vitest run packages/cli/src/measurement.test.ts packages/judge/src/profiling.test.ts`
- **Implementation**: [`packages/cli/src/developer-command.ts`](file:///packages/cli/src/developer-command.ts) (`performance.now()`)
- **Triggering Condition**: Changes to CLI execution or container runner profiling. (TARGETED)
- **Responsible Agent**: `CLI Specialist` (`.agents/agents/cli-specialist.md`)
- **Expected Evidence**: Timings recorded per stage (config validation, staging, container run, evaluation) with monotonic millisecond precision.
- **Severity**: `MEDIUM`
- **Implementation Status**: `IMPLEMENTED`

### 21. Windows PowerShell Compatibility
- **Category ID**: `TM-21-WINDOWS-COMPATIBILITY`
- **Test Command**: `pnpm vitest run packages/runtime/src/docker-cleanup.test.ts -t "windows"`
- **Implementation**: [`packages/runtime/src/docker-cleanup.ts`](file:///packages/runtime/src/docker-cleanup.ts), [`packages/judge/src/docker.ts`](file:///packages/judge/src/docker.ts)
- **Triggering Condition**: Changes to process execution, command string generation, or path resolution. (QUICK)
- **Responsible Agent**: `CLI Specialist` (`.agents/agents/cli-specialist.md`)
- **Expected Evidence**: No backtick/caret escaping failures; arguments passed as arrays (`execFile`); process trees cleanly killed.
- **Severity**: `CRITICAL`
- **Implementation Status**: `IMPLEMENTED`

### 22. Clean-Checkout Installation
- **Category ID**: `TM-22-CLEAN-INSTALLATION`
- **Test Command**: `pnpm replaykit doctor`
- **Implementation**: [`packages/cli/src/developer-command.ts`](file:///packages/cli/src/developer-command.ts) (`executeDoctor`)
- **Triggering Condition**: Changes to `package.json`, `pnpm-lock.yaml`, or runtime system requirements. (RELEASE)
- **Responsible Agent**: `CLI Specialist` (`.agents/agents/cli-specialist.md`)
- **Expected Evidence**: Node version (>=20), pnpm version, Docker daemon availability, and Ollama connectivity verified and reported as HEALTHY.
- **Severity**: `BLOCKER`
- **Implementation Status**: `IMPLEMENTED`

### 23. CLI Documentation Accuracy
- **Category ID**: `TM-23-CLI-DOCUMENTATION`
- **Test Command**: `pnpm vitest run packages/cli/test/developer-command.test.ts -t "help"`
- **Implementation**: [`docs/CLI_REFERENCE.md`](file:///docs/CLI_REFERENCE.md), [`README.md`](file:///README.md)
- **Triggering Condition**: Changes to CLI flags, subcommands, or user-facing documentation. (QUICK)
- **Responsible Agent**: `CLI Specialist` (`.agents/agents/cli-specialist.md`)
- **Expected Evidence**: CLI help text matches documented subcommands (`clean`, `doctor`, `generate`, `run`, `verify`) and options.
- **Severity**: `MEDIUM`
- **Implementation Status**: `IMPLEMENTED`

### 24. Credential Leakage & Security Scans
- **Category ID**: `TM-24-TOKEN-SECURITY-SCAN`
- **Test Command**: `pnpm token:scan`
- **Implementation**: [`packages/telemetry/src/token-scan.test.ts`](file:///packages/telemetry/src/token-scan.test.ts), `scripts/token-scan.ts`
- **Triggering Condition**: Any change to code or documentation before commit. (QUICK/RELEASE)
- **Responsible Agent**: `Security Auditor` (`.agents/agents/security-auditor.md`)
- **Expected Evidence**: Zero API keys, private keys, JWTs, or secrets found across all checked files.
- **Severity**: `BLOCKER`
- **Implementation Status**: `IMPLEMENTED`

### 25. CI & Release Readiness
- **Category ID**: `TM-25-CI-RELEASE-READINESS`
- **Test Command**: `pnpm vitest run scripts/quality/quality-runner.test.ts`
- **Implementation**: `.github/workflows/ci.yml`, [`docs/release/V0_1_0_ACCEPTANCE.md`](file:///docs/release/V0_1_0_ACCEPTANCE.md)
- **Triggering Condition**: Pre-release verification or CI pipeline modification. (RELEASE)
- **Responsible Agent**: `Test Auditor` (`.agents/agents/test-auditor.md`)
- **Expected Evidence**: Quality runner exits 0, all gates PASS, no unverified promotions, protected file diff exits 0.
- **Severity**: `BLOCKER`
- **Implementation Status**: `IMPLEMENTED`
