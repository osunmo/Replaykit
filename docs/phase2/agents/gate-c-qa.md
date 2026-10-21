# Gate C QA Specification & Baseline Audit — Agent QA

**Role:** Independent Quality Assurance & Audit (Agent QA)  
**Date:** 2026-10-19  
**Status:** ACTIVE / AUDIT IN PROGRESS  
**Target:** ReplayKit Phase 2 External Runner Call Path & R1 Non-Regression  
**Protected Integrity:** Byte-for-byte immutability of `packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts`.

---

## 1. Audit Scope & Invariants

1. **Strict Decoupling from R1**:
   - The Gate C external runner must NOT touch, import, or modify:
     - `packages/judge/src/evaluate.ts` (R1 payment evaluator)
     - `packages/contracts/src/index.ts` (R1 contracts)
     - `packages/planner/src/index.ts` (R1 DuplicatePaymentError planner)
     - `apps/checkout-api/` (R1 checkout application)
   - Gate C evidence feeds exclusively into `evaluateExternalEvidence()` in `packages/judge/src/external.ts`.
2. **No Simulation Allowed**:
   - Every execution record in `ExternalMatrix` must originate from real container execution.
   - No mock flags or conditional branches based on `variant` that return hardcoded pass/fail strings or synthetic test results.
3. **Audit of Gate B Acceptance**:
   - Verified that `qs33-gateb-local-06` and `qs33-gateb-local-07` paired reproductions are independently reviewed and documented in `GATE_B_DECISION.md` and `GATE_B_LOCAL07_DECISION.md`.
   - Verified both raw run evidence directories under `work/phase2/gate-b-runs/` remain completely untouched.
   - Collector summaries correctly remain labeled `PARTIAL` / `gateBAccepted: false` as recorded at collection time, while separate review documents record scoped PASS.

---

## 2. Baseline Unit Suite Audit

To verify that existing codebase functionality and R1 gates remain intact, the test suite (`pnpm test` -> `tsx scripts/token-scan.ts && vitest run --exclude '**/*.integration.test.ts'`) is executed as a clean baseline.

### 2.1 Verification Checklist:
- [x] Token scan enforces authorization: only approved canary (`sntryu_deadbeef...`) permitted. (Scanned 53,692 files; 0 violations).
- [x] Protected R1 files verify clean `git diff --exit-code`:
  - `packages/judge/src/evaluate.ts` (SHA-256 `aea7ff69ae0afc34101920415881e044ce3eb8aafba57d4da3eb4e7212ef5bbb`)
  - `packages/contracts/src/index.ts` (SHA-256 `dda117140b97e825457bd0d49c936b76a8962ab651ae5f91f7a2a6042ed8e95b`)
- [x] Non-Docker unit test suite: 42/42 test files and 461/461 tests verified passing (`runtime.test.ts` passed 7/7 tests). Zero regressions across all packages.

---

## 3. Runner Implementation Review Criteria

When the runner implementer produces `external-supervisor.ts` and `qs33-adapter.ts`, QA will independently audit:

1. **Docker Command Construction**:
   - Argument array invocation via `execFile` or `spawn` with `shell: false`, `windowsHide: true`.
   - Rejection of string concatenation or shell interpolation in container commands.
2. **Isolation Enforcement**:
   - Explicit inspection of `inspect` JSON after container creation.
   - Rejection of containers lacking `--network none`, read-only root, dropped capabilities, or exceeding 1 CPU / 256 MiB / 64 PIDs.
3. **Two-Tier Timeout**:
   - Container-side: `/usr/bin/timeout --signal=KILL 29s` as PID 1.
   - Host-side: 30s timeout on execution commands with guaranteed cleanup.
4. **Normalized Report Truthfulness**:
   - Faithful mapping of raw TAP lines and probe output into `OfficialReportSchema`.
   - No truncation, fabrication, or silent omission of unexpected failures.

---

## 4. Stage C1 Verification Audit — PASS

**Audit Date:** 2026-10-19  
**Test Suite:** `packages/runtime/src/external-runner.test.ts` (8 tests passing, 0 failing)  

### 4.1 Verification Findings:
- [x] **Input Validation:** Malformed `runId` and `role` are rejected with explicit errors. Host bind mounts (`hostBinds`) are rejected with `HOST_BINDS_FORBIDDEN`. Limits exceeding 1 CPU, 256 MiB, or 64 PIDs are rejected.
- [x] **Manifest Contract:** `createQs33Manifest()` generates schema-compliant `ExternalManifest` with 17 source files, complete test file hash `be713740...`, and test patch hash `76cd9fa0...`.
- [x] **TAP Normalization:** TAP stream parsed into `OfficialReportSchema` (`official-suite-normalized-v1`) with 56 tests. Buggy failure identity captures native `TypeError` and frame `at exports.clone (/case/lib/utils.js:47:20)`. Passing tests have `failure: null`.
- [x] **Authentic Live Execution:** Tested real Docker container of pinned buggy revision (`node:22-bookworm-slim@sha256:c3de60bf...`) with `--network none`, read-only root, UID 1000:1000, 1 CPU / 256 MiB / 64 PIDs, and 29s PID-1 watchdog. Execution status `COMPLETED`, exitCode 1. Exactly test 40 failed and 55 passed.
- [x] **Evaluator Integrity:** Evaluated partial execution through `evaluateExternalEvidence()`. Evaluator correctly returned `status !== 'VERIFIED'`, strictly upholding 10-run determinism and matrix gates without false positive promotion.
- [x] **Cleanup:** Verified container and private staging volume deleted after execution.
- [x] **R1 Invariants:** Protected files `packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts` remain 100% clean and unmodified.

---

## 5. Stage C2 Verification Audit — PASS

**Audit Date:** 2026-10-19  
**Test Suite:** `packages/runtime/src/external-runner.test.ts` (19 tests passing, 0 failing)  
**Decision Document:** `docs/phase2/GATE_C2_DECISION.md`  
**Live Evidence Directory:** `work/phase2/gate-c-runs/qs33-c2-live-01`

### 5.1 Verification Findings:
- [x] **Authentic Sequential Execution:** Executed pinned buggy revision (`360e2b0b48548b9bfdb71f8c82a68c4f34ec0725`, Run ID: `c2-live-buggy-1792465411633`) and pinned fixed revision (`6a97ad1d71d8a9069f5d6002cab3130752519ccb`, Run ID: `c2-live-fixed-1792465442253`) sequentially under identical conditions.
- [x] **Buggy Suite & Probe Expectations:** Official TAP produced exactly 56 test identities, 55 passing, only test 40 failing with native `TypeError: source.hasOwnProperty is not a function` at `/case/lib/utils.js:47:20`. Buggy probe exited 1 with the same native error and top frame.
- [x] **Fixed Suite & Probe Expectations:** Official TAP produced the same 56 test identities, 56 passing, 0 failing, 0 skipped, 0 TODOs. Fixed probe exited 0 without throwing and produced exact serialized output `{"a":{"b":"c"}}`.
- [x] **Decoupled Architecture:** Trusted supervisor remains strictly repository-agnostic. All qs-specific parsing, probe analysis, test inventory, and failure identities are confined to `packages/runtime/src/adapters/qs33-adapter.ts`.
- [x] **Security & Isolation Enforcement:** Verified `--network none`, `--read-only` rootfs, `1000:1000` user, `--cap-drop ALL`, `--security-opt no-new-privileges`, 1 CPU / 256 MiB / 64 PIDs limits, 29s PID-1 watchdog, and verified cleanup (`cleaned === true`) on both executions.
- [x] **Artifact Completeness & 0-Byte Stream Integrity:** Verified all 18 artifact files in `work/phase2/gate-c-runs/qs33-c2-live-01/` against `artifact-sha256.json`. Corrected frame extraction in `external-supervisor.ts` so 0-byte standard error streams (`evidence-fixed/probe.stderr`, SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`) are preserved rather than dropped.
- [x] **Non-Mutating Automated Test Suite:** Refactored `external-runner.test.ts` to execute live container runs in an isolated temporary directory, preserving canonical evidence under `work/phase2/gate-c-runs/qs33-c2-live-01/` from mutation during test runs. Added a dedicated audit test verifying all 18 canonical artifacts against their recorded SHA-256 hashes.
- [x] **Negative Controls Audit (9/9 passing):**
  1. Buggy unexpectedly passes -> rejected with `BUGGY_FAILS_FAILED`.
  2. Fixed with unrelated failure -> rejected with `REFERENCE_FIX_PASSES_FAILED`.
  3. Missing test identities -> rejected by inventory check.
  4. Changed test identities -> rejected by inventory check.
  5. Missing or malformed raw evidence -> rejected with `EXECUTION_ERROR`.
  6. Incorrect failure type or stack location -> rejected with `SAME_FAILURE_IDENTITY_FAILED`.
  7. Corrupted artifact hashes -> rejected with `EXECUTION_ERROR` / binding check.
  8. Cross-role or cross-run substitution -> rejected with `FRESH_STATE_FAILED` / `BUGGY_FAILS_FAILED`.
  9. Timeout, missing watchdog, or incomplete cleanup -> rejected with `EXECUTION_ERROR` and verifier error.
- [x] **Baseline & Protected Integrity:**
  - `pnpm typecheck` passed (exit code 0).
  - `pnpm token:scan` passed (53,692 files scanned, 0 violations).
  - Protected files `packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts` remain 100% clean and unmodified (`git diff --exit-code`).
  - Historical Gate B evidence in `work/phase2/gate-b-runs/qs33-gateb-local-06` and `local-07` remains completely untouched.
- [x] **External Evaluator Binding:** Authentic execution records were consumed by `evaluateExternalEvidence()`, strictly returning `status !== 'VERIFIED'` (`PARTIAL`), confirming determinism gates are not bypassed.

---

## 6. Stage C3 Verification Audit — PASS

**Audit Date:** 2026-10-19  
**Test Suite:** `packages/runtime/src/external-runner.test.ts` (34 tests passing, 0 failing)  
**Decision Document:** `docs/phase2/GATE_C3_DECISION.md`  
**Live Evidence Directory:** `work/phase2/gate-c-runs/qs33-c3-live-01`

### 6.1 Verification Findings:
- [x] **Candidate Patches & Cryptographic Anchoring:**
  - Reference patch (`packages/runtime/src/patches/reference.patch`, SHA-256 `fc1d3f9205a621617ca4f86432411dfddf6422432dfcb6d80f936af920cafe8e`) applies upstream fix using `Object.prototype.hasOwnProperty.call`.
  - Alternate patch (`packages/runtime/src/patches/alternate.patch`, SHA-256 `760d2dbd744d610b81426da10c412fc8db40b930e15ce895296157eaeb24ff28`) applies semantically equivalent fix using `Boolean(Object.getOwnPropertyDescriptor(source, i))`.
  - Decoy patch (`packages/runtime/src/patches/decoy.patch`, SHA-256 `318a5449a218b2d5d882fc6993086de1f53300559f1dfd2ed0d30696c87f6e81`) applies plausible decoy fix initializing `copy` array/object correctly and guarding with `if (source.hasOwnProperty && source.hasOwnProperty(i))`.
- [x] **Secure TypeScript Patch Applier:**
  - Implemented pure TypeScript diff parser and hunk applier in `packages/runtime/src/patch-applier.ts` with zero shell or external git/patch binary execution.
  - Enforces base commit check against `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` with symbolic ref resolution.
  - Enforces strict target path allowlist (`['lib/parse.js', 'lib/stringify.js', 'lib/utils.js']`).
  - Rejects path traversal (`..`), absolute paths, and symlink targets.
  - Verifies cryptographic patch SHA-256 before application.
  - Preserves original newline encoding (`\r\n` vs `\n`).
- [x] **Live Candidate Triplet Execution:**
  - Sequential live container execution for reference, alternate, and decoy fixes under identical isolation constraints (`--network none`, read-only root, UID 1000:1000, 1 CPU / 256 MiB / 64 PIDs, 29s PID-1 watchdog).
  - Reference Fix: status `COMPLETED`, exit code 0, 56/56 tests passing, probe passing with serialized output `{"a":{"b":"c"}}`.
  - Alternate Fix: status `COMPLETED`, exit code 0, 56/56 tests passing, probe passing with serialized output `{"a":{"b":"c"}}`.
  - Decoy Fix: status `COMPLETED`, exit code 1, 55 passed / 1 failed (Test 40), probe failing with `AssertionError: expected { a: {} } to deeply equal { a: { b: 'c' } }`.
- [x] **Artifact Completeness & Hash Audit:**
  - All 27 newly generated artifacts under `work/phase2/gate-c-runs/qs33-c3-live-01` verified against `artifact-sha256.json`.
  - 0-byte standard error streams (`probe.stderr` on reference and alternate) preserved with SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- [x] **Negative Controls Audit (15/15 passing):**
  1. Patch applier base commit mismatch rejected.
  2. Patch applier patch hash mismatch rejected.
  3. Patch applier forbidden path rejected.
  4. Patch applier relative/absolute path traversal rejected.
  5. Patch applier symlink target rejected.
  6. Patch applier malformed diff rejected.
  7. Evaluator rejects reference fix failure (`REFERENCE_FIX_PASSES_FAILED`).
  8. Evaluator rejects alternate fix failure (`ALTERNATE_FIX_PASSES_FAILED`).
  9. Evaluator rejects decoy fix passing (`DECOY_FIX_STILL_FAILS_FAILED`).
  10. Evaluator rejects candidate runs with unrelated regressions.
  11. Evaluator rejects candidate runs altering test inventories or identities.
  12. Evaluator rejects cross-candidate role substitution.
  13. Evaluator rejects reused execution identity (`FRESH_STATE_FAILED`).
  14. Evaluator rejects corrupted artifact or source hashes.
  15. Runner enforces timeout, isolated Docker limits, and deterministic cleanup.
- [x] **Protected File Immutability & Status Invariant:**
  - `packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts` remain 100% clean and unmodified (`git diff --exit-code`).
  - Gate B evidence (`work/phase2/gate-b-runs/`) and Gate C2 evidence (`work/phase2/gate-c-runs/qs33-c2-live-01/`) remain untouched.
  - External status remains `PARTIAL`; external `VERIFIED` is NOT claimed until Stage C4 (full 17-run matrix).

---

## 7. Stage C4 Verification Audit — PASS (VERIFIED)

**Audit Date:** 2026-10-20  
**Test Suite:** `packages/runtime/src/external-runner.test.ts` (42 tests passing, 0 failing)  
**Decision Document:** `docs/phase2/GATE_C4_DECISION.md`  
**Live Evidence Directory:** `work/phase2/gate-c-runs/qs33-c4-live-01`  
**Execution Manifest:** `docs/phase2/GATE_C4_MANIFEST.json`  
**Evidence Index:** `work/phase2/gate-c-runs/qs33-c4-live-01/evidence-index.json`  
**Artifact Hash Registry:** `work/phase2/gate-c-runs/qs33-c4-live-01/artifact-sha256.json` (153 artifacts)  
**Execution Summary:** `work/phase2/gate-c-runs/qs33-c4-live-01/c4-summary.json`  

### 7.1 Independent QA Verification Findings:
- [x] **Full 17-Run Sequential Matrix Execution:**
  - Exactly 17 executions were executed live and sequentially via the reusable TypeScript external runner.
  - 10 authentic buggy executions (`c4-live-buggy-01` through `c4-live-buggy-10`).
  - 3 authentic reference fix executions (`c4-live-reference-01` through `c4-live-reference-03`).
  - 3 alternate correct fix executions (`c4-live-alternate-01` through `c4-live-alternate-03`).
  - 1 decoy incorrect fix execution (`c4-live-decoy-01`).
  - Total wall-clock execution time: 408 seconds (~6m 48s).
- [x] **Buggy Revision Determinism (10/10):**
  - All 10 buggy executions completed with `executionStatus: 'COMPLETED'` and exit code `1`.
  - Exactly 56 official test identities executed in each run: 55 passed, exactly 1 failed (Test 40: `parse parses plain objects correctly`).
  - Verified native exception: `TypeError: source.hasOwnProperty is not a function`.
  - Top application frame in all 10 runs: `at exports.clone (/case/lib/utils.js:47:20)`.
  - All 10 buggy probe runs exited with code `1` reproducing native `TypeError` at `/case/lib/utils.js:47:20`.
- [x] **Reference Fix Validity (3/3):**
  - All 3 reference executions completed with `executionStatus: 'COMPLETED'` and exit code `0`.
  - Exactly 56/56 official tests passed in all 3 runs (0 failed, 0 skipped, 0 TODOs).
  - All 3 reference probe runs exited with code `0`, passed assertions, and produced exact serialized output `{"a":{"b":"c"}}`. Probe stderr empty (0 bytes).
- [x] **Alternate Fix Validity (3/3):**
  - All 3 alternate executions completed with `executionStatus: 'COMPLETED'` and exit code `0`.
  - Exactly 56/56 official tests passed in all 3 runs (0 failed, 0 skipped, 0 TODOs).
  - All 3 alternate probe runs exited with code `0`, passed assertions, and produced exact serialized output `{"a":{"b":"c"}}`. Probe stderr empty (0 bytes).
- [x] **Decoy Fix Rejection (1/1):**
  - Decoy execution completed with `executionStatus: 'COMPLETED'` and exit code `1`.
  - 55 tests passed, exactly Test 40 failed with `AssertionError`.
  - Decoy probe exited with code `1`, throwing `AssertionError: expected { a: {} } to deeply equal { a: { b: 'c' } }` and serializing incorrect truncated output `{"a":{}}`.
  - Evaluator strictly rejected decoy from being accepted as a fix.
- [x] **Fresh Workspace & Unique Identities:**
  - Verified 17 distinct `runId`s across all executions (`new Set(runIds).size === 17`).
  - Verified each execution was staged into a fresh, isolated disposable directory (`freshWorkspace === true`).
- [x] **Docker Security & Isolation Invariants:**
  - All 17 executions verified `--network none` (offline).
  - All 17 executions verified `--read-only` rootfs (`ReadonlyRootfs: true`).
  - All 17 executions ran as nonroot UID `1000:1000`.
  - All 17 executions dropped all capabilities (`--cap-drop ALL`) and set `no-new-privileges`.
  - Strict resource limits enforced: `<=1` CPU, `<=256 MiB` memory, `<=64` PIDs.
  - Zero host binds: private disposable volumes used exclusively for `/case`.
  - Two-tier timeout: 29s PID-1 watchdog via `/usr/bin/timeout --signal=KILL 29s` + 30s supervisor timeout.
  - Verified 100% cleanup of containers and volumes (`cleaned === true`).
- [x] **Artifact Completeness & Cryptographic Manifest:**
  - All 153 raw evidence files across all 17 subdirectories independently hashed (SHA-256) and verified against `artifact-sha256.json` (153/153 verified OK).
  - `evidence-index.json` provides complete structured indexing for all 17 runs.
- [x] **Independent Evaluator Verdict:**
  - Evaluated through `evaluateExternalEvidence()` in `packages/judge/src/external.ts`.
  - Result: `status: 'VERIFIED'`, `deterministicRuns: 10`, `deterministicFailures: 10`, `reasonCodes: []`.
  - All 12 evaluation checks passed `true`.
- [x] **Targeted Negative Controls Audit:**
  - Rejection of matrices with fewer than 10 buggy runs (`BUGGY_FAILS_FAILED`).
  - Rejection of matrices with fewer than 3 reference runs (`REFERENCE_FIX_PASSES_FAILED`).
  - Rejection of matrices with fewer than 3 alternate runs (`ALTERNATE_FIX_PASSES_FAILED`).
  - Rejection of decoy passing (`DECOY_FIX_STILL_FAILS_FAILED`).
  - Rejection of tampered or substituted test identities.
  - Rejection of corrupted candidate patch hashes.
  - Rejection of compromised Docker isolation settings (e.g. non-isolated network mode).
  - Rejection of reused run identities (`FRESH_STATE_FAILED`).
- [x] **Protected File Immutability:**
  - `packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts` verified unmodified (`git diff --exit-code`, exit code 0).
  - Historical Gate B evidence in `work/phase2/gate-b-runs/`, Gate C2 evidence in `work/phase2/gate-c-runs/qs33-c2-live-01/`, and Gate C3 evidence in `work/phase2/gate-c-runs/qs33-c3-live-01/` remain untouched.
- [x] **Final QA Decision:** **PASS for Gate C4**. External status is officially promoted to **`VERIFIED`**.




