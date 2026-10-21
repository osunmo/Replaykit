# Gate C3 Decision — Candidate Patch Validation & Counterfactual Execution

**Date:** 2026-10-19  
**Decision:** **PASS for Stage C3 — Authentic Candidate Patch Validation and Counterfactual Execution.**  
**Target:** Authentic `ljharb/qs` Issue #33 Regression (`360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` buggy base).  
**Runner:** Reusable TypeScript external supervisor (`packages/runtime/src/external-supervisor.ts`), qs #33 adapter (`packages/runtime/src/adapters/qs33-adapter.ts`), pure TypeScript patch applier (`packages/runtime/src/patch-applier.ts`), and high-level runner (`packages/runtime/src/external-runner.ts`).

---

## 1. Scope & Invariants

1. **Direct Live Execution (No Replay or Relabeling):**
   - All three candidate patches (reference fix, alternate fix, decoy fix) were applied to freshly staged `source-buggy` workspaces and executed inside isolated Docker containers via the reusable TypeScript external runner.
   - No historical Gate B or Gate C2 outputs, logs, or reports were substituted, replayed, or relabeled.
   - Historical Gate B evidence in `work/phase2/gate-b-runs/qs33-gateb-local-06` and `local-07` as well as Gate C2 evidence in `work/phase2/gate-c-runs/qs33-c2-live-01` remain completely untouched.
2. **Protected R1 Invariants:**
   - Byte-for-byte immutability of `packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts` verified with `git diff --exit-code` (exit code 0).
3. **No Premature Matrix or VERIFIED Claim:**
   - The full 17-run matrix (10 buggy, 3 reference, 3 alternate, 1 decoy) remains deferred to Stage C4.
   - External status remains strictly `PARTIAL`. Evaluator rules correctly require the complete matrix for status promotion; no premature `VERIFIED` claim is made.

---

## 2. Exact Execution Commands

1. **Gate C3 Live Candidate Triplet Execution:**
   ```bash
   pnpm exec tsx scripts/phase2/run-gate-c3.ts
   ```
2. **Automated Unit, Candidate Validation & Live Integration Suite (34/34 passing):**
   ```bash
   pnpm exec vitest run packages/runtime/src/external-runner.test.ts
   ```
3. **Artifact Integrity Audit:**
   ```bash
   node -e "const fs = require('fs'), crypto = require('crypto'), path = require('path'); const hashes = JSON.parse(fs.readFileSync('work/phase2/gate-c-runs/qs33-c3-live-01/artifact-sha256.json', 'utf8')); for (const [rel, exp] of Object.entries(hashes)) { const act = crypto.createHash('sha256').update(fs.readFileSync(path.join('work/phase2/gate-c-runs/qs33-c3-live-01', rel))).digest('hex'); if (act !== exp) throw new Error('Mismatch: ' + rel); } console.log('ALL 27 C3 ARTIFACT HASHES VERIFIED OK');"
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

## 3. Candidate Patches & Effective Tree Provenance

All candidate patches are anchored to the authentic buggy base commit `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` (`source-buggy`).

### 3.1 Reference Fix (`packages/runtime/src/patches/reference.patch`)
- **Role:** `reference`
- **Patch SHA-256:** `fc1d3f9205a621617ca4f86432411dfddf6422432dfcb6d80f936af920cafe8e`
- **Provenance:** Authentic upstream fix (`6a97ad1d71d8a9069f5d6002cab3130752519ccb`) excluding test file additions.
- **Mechanism:** Replaces direct `source.hasOwnProperty(i)` / `obj.hasOwnProperty(key)` calls with `Object.prototype.hasOwnProperty.call(source, i)` across `lib/utils.js`, `lib/parse.js`, and `lib/stringify.js`.
- **Target Files:** `lib/parse.js`, `lib/stringify.js`, `lib/utils.js`.
- **Expected Outcome:** 56/56 passed, probe passed (exit code 0, serialized output `{"a":{"b":"c"}}`).

### 3.2 Alternate Correct Fix (`packages/runtime/src/patches/alternate.patch`)
- **Role:** `alternate`
- **Patch SHA-256:** `760d2dbd744d610b81426da10c412fc8db40b930e15ce895296157eaeb24ff28`
- **Provenance:** Synthesized independent, semantically equivalent fix.
- **Mechanism:** Replaces `hasOwnProperty` invocations with `Boolean(Object.getOwnPropertyDescriptor(source, i))` across `lib/utils.js`, `lib/parse.js`, and `lib/stringify.js`. Safely inspects properties on objects without prototype (`Object.create(null)`) without calling `Object.prototype.hasOwnProperty.call`.
- **Target Files:** `lib/parse.js`, `lib/stringify.js`, `lib/utils.js`.
- **Expected Outcome:** 56/56 passed, probe passed (exit code 0, serialized output `{"a":{"b":"c"}}`).

### 3.3 Decoy Incorrect Fix (`packages/runtime/src/patches/decoy.patch`)
- **Role:** `decoy`
- **Patch SHA-256:** `318a5449a218b2d5d882fc6993086de1f53300559f1dfd2ed0d30696c87f6e81`
- **Provenance:** Synthesized subtle, plausible decoy fix.
- **Mechanism:** Corrects the object initialization bug in `clone` (`copy = Array.isArray(source) ? [] : {}`) and adds guards `if (source.hasOwnProperty && source.hasOwnProperty(i))` in `lib/utils.js`, `lib/parse.js`, and `lib/stringify.js`.
- **Subtlety:** Prevents the unhandled `TypeError: source.hasOwnProperty is not a function` when encountering null-prototype objects, allowing all 55 regression suite tests to pass. However, because null-prototype objects lack `.hasOwnProperty`, the property copy is skipped, producing `{ a: {} }` instead of `{ a: { b: 'c' } }`.
- **Expected Outcome:** 55 passed / 1 failed (Test 40: `parse parses plain objects correctly`), probe failed (exit code 1, `AssertionError: expected { a: {} } to deeply equal { a: { b: 'c' } }`).

---

## 4. Secure Patch Applier Architecture

To satisfy strict Phase 2 security invariants and prevent execution of untrusted tools or shell commands during workspace preparation, patching is performed by a dedicated pure TypeScript module (`packages/runtime/src/patch-applier.ts`):
1. **Shell-Free & Process-Free:** Does not invoke `git apply`, `patch`, or shell commands. Avoids MSYS/Windows path translation bugs and arbitrary command execution.
2. **Path Traversal & Absolute Path Rejection:** Canonicalizes paths and rejects absolute paths, paths containing `..`, or leading path separators.
3. **Strict Target Allowlist:** Rejects patches modifying any path outside `['lib/parse.js', 'lib/stringify.js', 'lib/utils.js']` (e.g. `package.json`, test files).
4. **Symlink Rejection:** Uses `lstat` to verify target files are regular files; rejects symlinks to prevent directory traversal.
5. **Cryptographic Patch Hash Verification:** Rejects patch application if the SHA-256 digest of the patch does not match the expected hash.
6. **Base Commit Verification:** Rejects patch application if the staged workspace base commit does not match `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725`.
7. **Strict Hunk Context Matching:** Fails cleanly if hunk pre-image context does not match file contents exactly.

---

## 5. Live Execution Summary

**Evidence Directory:** `work/phase2/gate-c-runs/qs33-c3-live-01`  
**Summary Manifest:** `work/phase2/gate-c-runs/qs33-c3-live-01/c3-summary.json`  
**Artifact Hash Registry:** `work/phase2/gate-c-runs/qs33-c3-live-01/artifact-sha256.json`

### 5.1 Reference Fix Execution
- **Run ID:** `c3-live-reference-1792470378418`
- **Patch Hash:** `fc1d3f9205a621617ca4f86432411dfddf6422432dfcb6d80f936af920cafe8e`
- **Container Execution Status:** `COMPLETED`
- **Exit Code:** `0`
- **Official Suite (TAP):** 56/56 passed, 0 failed, 0 skipped, 0 TODOs.
- **Reproduction Probe:**
  - Exit code: `0`
  - Stdout: `[probe] PASS: Qs.parse returned expected structure: {"a":{"b":"c"}}`
  - Stderr: `` (0 bytes, preserved)

### 5.2 Alternate Fix Execution
- **Run ID:** `c3-live-alternate-1792470396654`
- **Patch Hash:** `760d2dbd744d610b81426da10c412fc8db40b930e15ce895296157eaeb24ff28`
- **Container Execution Status:** `COMPLETED`
- **Exit Code:** `0`
- **Official Suite (TAP):** 56/56 passed, 0 failed, 0 skipped, 0 TODOs.
- **Reproduction Probe:**
  - Exit code: `0`
  - Stdout: `[probe] PASS: Qs.parse returned expected structure: {"a":{"b":"c"}}`
  - Stderr: `` (0 bytes, preserved)

### 5.3 Decoy Fix Execution
- **Run ID:** `c3-live-decoy-1792470409784`
- **Patch Hash:** `318a5449a218b2d5d882fc6993086de1f53300559f1dfd2ed0d30696c87f6e81`
- **Container Execution Status:** `COMPLETED`
- **Exit Code:** `1`
- **Official Suite (TAP):** Exactly 56 tests executed; 55 passed; exactly 1 failed (Test 40: `parse parses plain objects correctly`).
- **Reproduction Probe:**
  - Exit code: `1`
  - Stderr:
    ```
    AssertionError: expected { a: {} } to deeply equal { a: { b: 'c' } }
        at Assertion.assertEql (/case/node_modules/chai/lib/chai/core/assertions.js:461:10)
    ```
  - Result: Confirmed decoy fix fails both official regression test 40 and reproduction probe while maintaining 55 pass-to-pass tests.

---

## 6. Fresh Captured Artifact Hashes

All 27 newly captured raw artifacts in `work/phase2/gate-c-runs/qs33-c3-live-01/` were cryptographically hashed (SHA-256):

| Relative Artifact Path | SHA-256 Digest |
| ---------------------- | -------------- |
| `evidence-reference/execution.json` | `a8d742aa4be36ef570ea9e19a6d5def84751e4a8213f3ba7a4ea4a0843f762e0` |
| `evidence-reference/official.json` | `04dc0ea44f9de17a93451db26d10abe9a647bf0ec22012316d5be989f1dbc456` |
| `evidence-reference/official.stderr` | `088d300be8fbf8e150320173634b770321291994230f0914d4687a4e7b84c14c` |
| `evidence-reference/official.stdout` | `f565d8f6e0600af2b45b1fc20d63d47508982fcdf6831903a9328e851e696eff` |
| `evidence-reference/probe-report.json` | `eeb5aeaef75df3e148666d1ae52d2fbded7c73c50bce971faf190c21403612b7` |
| `evidence-reference/probe.json` | `8b9b99a54040c1e6ef32c50a8abf10cb5b0d9eadc3ba1a9eef018ce291157a12` |
| `evidence-reference/probe.stderr` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `evidence-reference/probe.stdout` | `ae242e12a4cc164544c7abcfbea4ef329de91bd23dd019b1862a33e91cfc0061` |
| `evidence-reference/report.json` | `302e05657015d0127e9d78588568e1ae3f1a3ad0ee796e038439190617fa9ef9` |
| `evidence-alternate/execution.json` | `939570b60af35ae5673faefe53e9b0de1324cba5197c535c380d48c5164c132c` |
| `evidence-alternate/official.json` | `04dc0ea44f9de17a93451db26d10abe9a647bf0ec22012316d5be989f1dbc456` |
| `evidence-alternate/official.stderr` | `088d300be8fbf8e150320173634b770321291994230f0914d4687a4e7b84c14c` |
| `evidence-alternate/official.stdout` | `f565d8f6e0600af2b45b1fc20d63d47508982fcdf6831903a9328e851e696eff` |
| `evidence-alternate/probe-report.json` | `eeb5aeaef75df3e148666d1ae52d2fbded7c73c50bce971faf190c21403612b7` |
| `evidence-alternate/probe.json` | `8b9b99a54040c1e6ef32c50a8abf10cb5b0d9eadc3ba1a9eef018ce291157a12` |
| `evidence-alternate/probe.stderr` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `evidence-alternate/probe.stdout` | `ae242e12a4cc164544c7abcfbea4ef329de91bd23dd019b1862a33e91cfc0061` |
| `evidence-alternate/report.json` | `302e05657015d0127e9d78588568e1ae3f1a3ad0ee796e038439190617fa9ef9` |
| `evidence-decoy/execution.json` | `478cd5ce4c31ac0f09d010d87a32e48d424af15b3545c3f3486549cb2cc4ab8a` |
| `evidence-decoy/official.json` | `9f3cd673f36c75d6b49e06b49eda3fed0f796450ae3097b2cbc402f7c4ac7362` |
| `evidence-decoy/official.stderr` | `088d300be8fbf8e150320173634b770321291994230f0914d4687a4e7b84c14c` |
| `evidence-decoy/official.stdout` | `a5e6e54bcb8aedcb7ed494f369e50777f13ca113a0f688524dc3b959fac7afeb` |
| `evidence-decoy/probe-report.json` | `49ed01d9bda539b6b9ff8b22eefa228fecb9e5961b2a640ff3e493b6a3e9a643` |
| `evidence-decoy/probe.json` | `a3277411c85a4d014e25ff421657c8a2c11aec31b4508d4fe938dfcaa0a2791a` |
| `evidence-decoy/probe.stderr` | `fcecfc3f1e5c84b52d10303e7c2598ecc02745e73dd9f74c837b08ad0a2aec97` |
| `evidence-decoy/probe.stdout` | `961cef77fad4863808eb83f8b97134a868b6cb59e7b1866200db0d0b048c702e` |
| `evidence-decoy/report.json` | `aa38914b558e2c9dd2ef839ab3fd03758ccc3c9b0424d7b035700659906de11b` |

---

## 7. Negative Controls & Security Enforcement

In `packages/runtime/src/external-runner.test.ts`, 15 comprehensive tests verify strict enforcement of candidate boundaries and negative controls:
1. **Patch Applier Base Commit Mismatch:** Rejects application if base commit does not match `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725`.
2. **Patch Hash Tampering:** Rejects patch application if the SHA-256 does not match `expectedSha256`.
3. **Disallowed Target Paths:** Rejects attempts to patch files outside the allowlist (`package.json`, `test/index.js`).
4. **Path Traversal Attacks:** Rejects relative traversal (`../lib/utils.js`) and root paths (`/lib/utils.js`, `C:\lib\utils.js`).
5. **Symlink Attacks:** Detects and rejects symlinked target files.
6. **Malformed Unified Diff:** Rejects unparseable or truncated hunk headers.
7. **Reference Fix Failure Control:** Rejection when reference candidate fails official suite or probe.
8. **Alternate Fix Failure Control:** Rejection when alternate candidate fails official suite or probe.
9. **Decoy Passing Control:** Rejection when decoy candidate falsely passes official suite or probe.
10. **Unrelated Regressions:** Rejection when candidate fixes target issue but introduces failures in other tests.
11. **Altered Test Inventories:** Rejection when candidate run omits or renames test cases.
12. **Cross-Candidate Role Substitution:** Rejection when decoy output is submitted as reference or alternate.
13. **Corrupted Evidence Hashes:** Rejection when artifact or report hashes mismatch.
14. **Timeout & Resource Cleanup:** Rejection on container timeout or failed staging volume cleanup.

---

## 8. Reviewer Sign-Off Criteria & Stage Acceptance

1. **Direct Execution:** Real Docker containers executed under strict isolation (`--network none`, read-only root, 1 CPU / 256 MiB / 64 PIDs, 29s PID-1 watchdog).
2. **Differential Validity:** Reference and Alternate fixes pass 56/56 tests and probe; Decoy fix passes 55/56 tests but fails Test 40 and probe.
3. **Pure TypeScript Applier:** No shell or git binary invocations; path traversal, symlink, and base commit bounds enforced.
4. **Non-Mutating Verification:** Automated Vitest test suite decouples canonical evidence in temporary directories; canonical artifacts verified clean against hash registry.
5. **Protected File Immutability:** `packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts` remain 100% untouched (`git diff --exit-code`).
6. **Gate B and C2 Evidence Preservation:** `work/phase2/gate-b-runs/` and `work/phase2/gate-c-runs/qs33-c2-live-01/` remain completely untouched.
7. **External Status Invariant:** External status remains `PARTIAL`; external `VERIFIED` is NOT claimed until Stage C4 (full 17-run matrix).

| Milestone | Status | Description |
| --------- | ------ | ----------- |
| Stage C1 | **PASS** | External supervisor vertical slice & isolated buggy execution |
| Stage C2 | **PASS** | Authentic sequential buggy/fixed live execution, probe validation, and 9 negative controls |
| Stage C3 | **PASS** | Candidate patch validation, security boundaries, counterfactual execution, and 14 negative controls |
| Stage C4 | **PENDING** | Full 10/3/3/1 external matrix execution, determinism, and evaluator integration |

**Acceptance Decision:** Stage C3 is accepted. Proceed to Stage C4. External status remains `PARTIAL`; external `VERIFIED` is NOT claimed.
