# Gate C2 Decision — Live Buggy & Fixed Reproduction through Reusable External Runner

**Date:** 2026-10-19  
**Decision:** **PASS for Stage C2 — Authentic Sequential Buggy/Fixed Execution through Reusable External Runner.**  
**Target:** Pinned `ljharb/qs` Issue #33 Revisions (`360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` buggy and `6a97ad1d71d8a9069f5d6002cab3130752519ccb` fixed).  
**Runner:** Reusable TypeScript external supervisor (`packages/runtime/src/external-supervisor.ts`), qs #33 adapter (`packages/runtime/src/adapters/qs33-adapter.ts`), and high-level runner (`packages/runtime/src/external-runner.ts`).

---

## 1. Scope & Invariants

1. **Direct Live Execution (No Replay or Relabeling):**
   - Both pinned upstream revisions were executed sequentially through the reusable TypeScript external runner inside fresh, isolated Docker containers.
   - No Gate B outputs, logs, or reports were substituted, replayed, or relabeled.
   - Historical Gate B evidence in `work/phase2/gate-b-runs/qs33-gateb-local-06` and `local-07` remains completely untouched.
2. **Protected R1 Invariants:**
   - Byte-for-byte immutability of `packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts` verified with `git diff --exit-code` (exit code 0).
3. **No Premature Matrix or VERIFIED Claim:**
   - Full 17-run matrix (10 buggy, 3 reference, 3 alternate, 1 decoy) remains deferred to Stage C4.
   - External evaluator (`evaluateExternalEvidence`) evaluated the partial execution pair, correctly reporting `status !== 'VERIFIED'` (`PARTIAL`), strictly upholding matrix determinism gates without false positive promotion.

---

## 2. Exact Execution Commands

1. **Dedicated Gate C2 Live Execution:**
   ```bash
   pnpm exec tsx scripts/phase2/run-gate-c2.ts
   ```
2. **Automated Unit & Live Integration Suite (19/19 passing):**
   ```bash
   pnpm exec vitest run packages/runtime/src/external-runner.test.ts
   ```
3. **Artifact Integrity Audit:**
   ```bash
   node -e "const fs = require('fs'), crypto = require('crypto'), path = require('path'); const hashes = JSON.parse(fs.readFileSync('work/phase2/gate-c-runs/qs33-c2-live-01/artifact-sha256.json', 'utf8')); for (const [rel, exp] of Object.entries(hashes)) { const act = crypto.createHash('sha256').update(fs.readFileSync(path.join('work/phase2/gate-c-runs/qs33-c2-live-01', rel))).digest('hex'); if (act !== exp) throw new Error('Mismatch: ' + rel); } console.log('ALL 18 ARTIFACT HASHES VERIFIED OK');"
   ```
4. **TypeScript Strict Typecheck:**
   ```bash
   pnpm typecheck
   ```
5. **Token Scanner & Security Hygiene:**
   ```bash
   pnpm token:scan
   ```

---

## 3. Live Execution Summary

**Evidence Directory:** `work/phase2/gate-c-runs/qs33-c2-live-01`  
**Summary Manifest:** `work/phase2/gate-c-runs/qs33-c2-live-01/c2-summary.json`  
**Artifact Hash Registry:** `work/phase2/gate-c-runs/qs33-c2-live-01/artifact-sha256.json`

### 3.1 Buggy Revision Execution
- **Run ID:** `c2-live-buggy-1792465411633`
- **Pinned Commit:** `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725`
- **Container Execution Status:** `COMPLETED`
- **Exit Code:** `1`
- **Official Suite (TAP):**
  - Exactly 56 test identities executed.
  - Exactly 55 passing tests.
  - Exactly 1 failing test: Test 40 (`parse parses plain objects correctly`).
  - Zero skips, zero TODOs.
  - Native Failure Type: `TypeError: source.hasOwnProperty is not a function`.
  - Library Top Stack Frame: `at exports.clone (/case/lib/utils.js:47:20)`.
- **Reproduction Probe:**
  - Probe command: `/usr/local/bin/node /tmp/probe.cjs`
  - Probe exit code: `1`.
  - Native exception thrown on `Qs.parse({ a: a })`.
  - Probe stdout: `[probe] Starting structural reproduction for qs issue #33...`
  - Probe stderr:
    ```
    TypeError: source.hasOwnProperty is not a function
        at exports.clone (/case/lib/utils.js:47:20)
        at Object.exports.parse (/case/lib/index.js:40:24)
        at Object.<anonymous> (/tmp/probe.cjs:14:18)
    ```
  - Error type: `TypeError: source.hasOwnProperty is not a function`.
  - Top application frame: `at exports.clone (/case/lib/utils.js:47:20)`.

### 3.2 Fixed Revision Execution
- **Run ID:** `c2-live-fixed-1792465442253`
- **Pinned Commit:** `6a97ad1d71d8a9069f5d6002cab3130752519ccb`
- **Container Execution Status:** `COMPLETED`
- **Exit Code:** `0`
- **Official Suite (TAP):**
  - Same 56 test identities in identical order.
  - Exactly 56 passing tests (all tests have `status: 'passed'` and `failure: null`).
  - Zero failing tests, zero skips, zero TODOs.
  - No unrelated regressions.
- **Reproduction Probe:**
  - Probe command: `/usr/local/bin/node /tmp/probe.cjs`
  - Probe exit code: `0`.
  - Non-throwing execution on `Qs.parse({ a: a })`.
  - Probe stdout:
    ```
    [probe] Starting structural reproduction for qs issue #33...
    [probe] PASS: Qs.parse returned expected structure:
    {"a":{"b":"c"}}
    ```
  - Probe stderr: `` (empty, 0 bytes).
  - Exact serialized output: `{"a":{"b":"c"}}`.
  - Control assertion passed.

---

## 4. Fresh Captured Artifact Hashes

All 18 newly captured raw artifacts in `work/phase2/gate-c-runs/qs33-c2-live-01/` were cryptographically hashed (SHA-256):

| Relative Artifact Path | SHA-256 Digest |
| ---------------------- | -------------- |
| `evidence-buggy/execution.json` | `bf51745fbed00433006922135a5112fb255924c058fb8929156910346de6d468` |
| `evidence-buggy/official.json` | `9f3cd673f36c75d6b49e06b49eda3fed0f796450ae3097b2cbc402f7c4ac7362` |
| `evidence-buggy/official.stderr` | `44d681e9232ee71bcf2ac090e9d93486fe9479e91d6a20a05c9e4c35941ad2c5` |
| `evidence-buggy/official.stdout` | `98fca48e7dce2de2e5ba645ef6fdf436e0f66fb9673e8e10fbd5a8f14da9b3ed` |
| `evidence-buggy/probe-report.json` | `c878b73c54deb8486aab9b2d6d1a56e2ba3d0610fac3d891fe787dff10ebd353` |
| `evidence-buggy/probe.json` | `a3277411c85a4d014e25ff421657c8a2c11aec31b4508d4fe938dfcaa0a2791a` |
| `evidence-buggy/probe.stderr` | `2624e27b3c3bf527e0d6f20953b16acb3c18ce58b972d22a046b160ef5bd2e49` |
| `evidence-buggy/probe.stdout` | `4b36d4ebf09092ee73e450a57943b19065de5e08c741550f1b20764e79f05465` |
| `evidence-buggy/report.json` | `8fe70a07eb115daccb6002a334ab4060a8e885519ae627910809c4ee76a3c8af` |
| `evidence-fixed/execution.json` | `ed7bd6073a3f5df601c84beaca872dd1bc0a9dc7ef59d1a53ce0e08945d44072` |
| `evidence-fixed/official.json` | `04dc0ea44f9de17a93451db26d10abe9a647bf0ec22012316d5be989f1dbc456` |
| `evidence-fixed/official.stderr` | `088d300be8fbf8e150320173634b770321291994230f0914d4687a4e7b84c14c` |
| `evidence-fixed/official.stdout` | `f565d8f6e0600af2b45b1fc20d63d47508982fcdf6831903a9328e851e696eff` |
| `evidence-fixed/probe-report.json` | `eeb5aeaef75df3e148666d1ae52d2fbded7c73c50bce971faf190c21403612b7` |
| `evidence-fixed/probe.json` | `8b9b99a54040c1e6ef32c50a8abf10cb5b0d9eadc3ba1a9eef018ce291157a12` |
| `evidence-fixed/probe.stderr` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `evidence-fixed/probe.stdout` | `ae242e12a4cc164544c7abcfbea4ef329de91bd23dd019b1862a33e91cfc0061` |
| `evidence-fixed/report.json` | `302e05657015d0127e9d78588568e1ae3f1a3ad0ee796e038439190617fa9ef9` |

---

## 5. Security & Isolation Verification

Both containers operated under strict Stage C isolation invariants verified via pre-start inspect and post-execution checks:
- **Offline:** `--network none` (verified `networkMode === 'none'`).
- **Read-Only Root:** `ReadonlyRootfs: true`.
- **Nonroot User:** `User: "1000:1000"`.
- **Privilege Separation:** `--cap-drop ALL`, `--security-opt no-new-privileges`.
- **Resource Limits:** `cpus <= 1`, `memoryBytes <= 268435456` (256 MiB), `pidsLimit <= 64`.
- **No Host Binds:** Host binds array strictly null/empty; execution staged exclusively through private named volumes.
- **Watchdog:** Container PID 1 executed under `/usr/bin/timeout --signal=KILL 29s`.
- **Cleanup:** Supervisor confirmed container and volume deletion (`cleaned === true`).

---

## 6. Verification of Targeted Negative Controls

Stage C2 implemented 9 targeted negative controls in `packages/runtime/src/external-runner.test.ts`. All 9 passed:

1. **Buggy execution unexpectedly passes:** Rejected by `evaluateExternalEvidence` with `BUGGY_FAILS_FAILED` and by `verifyQs33C2Expectations`.
2. **Fixed execution with unrelated failure:** Rejected with `REFERENCE_FIX_PASSES_FAILED`.
3. **Missing test identities:** Reports with fewer than 56 tests rejected by manifest inventory validator.
4. **Changed test identities:** Reports with modified test names rejected by inventory validator.
5. **Missing or malformed raw evidence:** Null or unparseable `reportJson` rejected with `EXECUTION_ERROR`.
6. **Incorrect failure type or stack location:** Failures with `AssertionError` or off-target stack locations rejected with `SAME_FAILURE_IDENTITY_FAILED`.
7. **Corrupted artifact hashes:** Mismatched `reportHash` or corrupted source file hashes rejected with `EXECUTION_ERROR` / binding error.
8. **Cross-role or cross-run substitution:** Substituting fixed outputs as buggy, buggy as fixed, or reusing `runId` rejected (`FRESH_STATE_FAILED` / `BUGGY_FAILS_FAILED`).
9. **Timeout, missing watchdog, or incomplete cleanup:** Container timeout/kill rejected with `EXECUTION_ERROR`; incomplete cleanup rejected by C2 verifier; host bind attempts rejected with `HOST_BINDS_FORBIDDEN`.

---

## 7. Reviewer Sign-Off Criteria & Stage Acceptance

1. **Direct Execution:** Reusable TypeScript external supervisor and runner executed authentic Docker containers; no synthetic relabeling or Gate B replaying occurred.
2. **Zero Defect Truthfulness:** 0-byte stream extraction defect resolved; empty `probe.stderr` captured faithfully with SHA-256 digest `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
3. **Non-Mutating Verification:** Vitest suite decoupled from canonical evidence directory; automated test executions stage evidence in temporary directories, leaving `work/phase2/gate-c-runs/qs33-c2-live-01` pristine.
4. **Protected File Immutability:** `packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts` verified unmodified (`git diff --exit-code`).
5. **Gate B Preservation:** `work/phase2/gate-b-runs/` preserved untouched.
6. **External Status Invariant:** External status remains `PARTIAL` because Stage C3 (decoy & alternate counterfactuals) and Stage C4 (full 17-run matrix) have not yet been executed.

| Milestone | Status | Description |
| --------- | ------ | ----------- |
| Stage C1 | **PASS** | External supervisor vertical slice & isolated buggy execution |
| Stage C2 | **PASS** | Authentic sequential buggy/fixed live execution, probe validation, and 9 negative controls |
| Stage C3 | **PENDING** | Decoy & alternate patch generation, provenance binding, and counterfactual validation |
| Stage C4 | **PENDING** | Full 10/3/3/1 external matrix execution, determinism, and evaluator integration |

**Acceptance Decision:** Stage C2 is accepted. Proceed to Stage C3. External status remains `PARTIAL`; external `VERIFIED` is NOT claimed.
