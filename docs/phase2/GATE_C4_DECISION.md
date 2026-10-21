# Gate C4 Decision — Complete External Matrix Execution, Determinism & Independent Evaluator Verification

**Date:** 2026-10-20  
**Decision:** **PASS for Gate C4 — Authentic External 17-Run Matrix Execution, 10-Run Determinism, Counterfactual Evaluation, and Official Evaluator Status Promotion to `VERIFIED`.**  
**Target:** Authentic `ljharb/qs` Issue #33 Regression (`360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` buggy base).  
**Runner:** Reusable TypeScript external supervisor (`packages/runtime/src/external-supervisor.ts`), qs #33 adapter (`packages/runtime/src/adapters/qs33-adapter.ts`), pure TypeScript patch applier (`packages/runtime/src/patch-applier.ts`), and high-level runner (`packages/runtime/src/external-runner.ts`).  
**Independent Evaluator:** `evaluateExternalEvidence()` in `packages/judge/src/external.ts`.  

---

## 1. Scope & Invariants

1. **Direct Live Execution Across Full Matrix (No Replay or Simulation):**
   - Exactly 17 executions were performed sequentially in fresh, isolated Docker containers via the reusable TypeScript external runner.
   - 10 authentic buggy executions, 3 reference fix executions, 3 alternate fix executions, and 1 decoy fix execution.
   - Zero historical Gate B, Gate C2, or Gate C3 outputs, logs, or reports were substituted, replayed, or relabeled.
   - All historical Gate B evidence in `work/phase2/gate-b-runs/qs33-gateb-local-06` and `local-07`, Gate C2 evidence in `work/phase2/gate-c-runs/qs33-c2-live-01`, and Gate C3 evidence in `work/phase2/gate-c-runs/qs33-c3-live-01` remain completely untouched.
2. **Protected R1 Immutability Invariant:**
   - Byte-for-byte immutability of `packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts` verified with `git diff --exit-code` (exit code 0).
3. **Official Evaluator Verification (`status: VERIFIED`):**
   - The authentic 17-run matrix was submitted to the independent evaluator `evaluateExternalEvidence()`.
   - The evaluator returned `status: 'VERIFIED'` with 0 reason codes, confirming all 12 evaluator checks and `deterministicFailures === 10`.
   - External status is officially promoted from `PARTIAL` to **`VERIFIED`**.

---

## 2. Exact Execution & Audit Commands

1. **Gate C4 Full 17-Run Matrix Live Execution:**
   ```powershell
   pnpm exec tsx scripts/phase2/run-gate-c4.ts
   ```
2. **Comprehensive Automated Test Suite (42/42 passing):**
   ```powershell
   pnpm exec vitest run packages/runtime/src/external-runner.test.ts
   ```
3. **Artifact Integrity Audit (All 153 C4 Artifacts Verified OK):**
   ```powershell
   node -e "const fs = require('fs'), crypto = require('crypto'), path = require('path'); const dir = 'work/phase2/gate-c-runs/qs33-c4-live-01'; const hashes = JSON.parse(fs.readFileSync(path.join(dir, 'artifact-sha256.json'), 'utf8')); let count = 0; for (const [rel, exp] of Object.entries(hashes)) { const act = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, rel))).digest('hex'); if (act !== exp) throw new Error('Mismatch: ' + rel); count++; } console.log('ALL ' + count + ' C4 ARTIFACT HASHES VERIFIED OK');"
   ```
4. **TypeScript Strict Typecheck:**
   ```powershell
   pnpm typecheck
   ```
5. **Protected Files Immutability Audit:**
   ```powershell
   git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts
   ```

---

## 3. Candidate Patches & Effective Tree Provenance

All candidate patches are anchored to the authentic buggy base commit `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` (`source-buggy`).

| Candidate Role | Patch SHA-256 Digest | Provenance & Mechanism | Expected Official Outcome | Expected Semantic Probe Outcome |
| -------------- | -------------------- | ---------------------- | ------------------------- | ------------------------------ |
| **Buggy Base** | `0000000000000000000000000000000000000000000000000000000000000000` | Authentic upstream parent commit | 55 pass / 1 fail (Test 40: `TypeError`) | Exits 1, `TypeError: source.hasOwnProperty is not a function` at `/case/lib/utils.js:47:20` |
| **Reference Fix** | `fc1d3f9205a621617ca4f86432411dfddf6422432dfcb6d80f936af920cafe8e` | Authentic upstream fix `6a97ad1d...` using `Object.prototype.hasOwnProperty.call` | 56/56 pass, 0 fail/skip/TODO | Exits 0, passes, output `{"a":{"b":"c"}}`, stderr empty (0 bytes) |
| **Alternate Fix** | `760d2dbd744d610b81426da10c412fc8db40b930e15ce895296157eaeb24ff28` | Synthesized independent fix using `Boolean(Object.getOwnPropertyDescriptor(source, i))` | 56/56 pass, 0 fail/skip/TODO | Exits 0, passes, output `{"a":{"b":"c"}}`, stderr empty (0 bytes) |
| **Decoy Fix** | `318a5449a218b2d5d882fc6993086de1f53300559f1dfd2ed0d30696c87f6e81` | Plausible decoy fix with `copy = [] : {}` and `if (source.hasOwnProperty && ...)` | 55 pass / 1 fail (Test 40: `AssertionError`) | Exits 1, `AssertionError`, output `{"a":{}}` (drops null-prototype properties) |

---

## 4. Live 17-Run Matrix Execution Results

**Evidence Directory:** `work/phase2/gate-c-runs/qs33-c4-live-01`  
**Frozen Manifest:** `docs/phase2/GATE_C4_MANIFEST.json` and `work/phase2/gate-c-runs/qs33-c4-live-01/c4-manifest.json`  
**Execution Summary:** `work/phase2/gate-c-runs/qs33-c4-live-01/c4-summary.json`  
**Evidence Index:** `work/phase2/gate-c-runs/qs33-c4-live-01/evidence-index.json`  
**Artifact Hash Registry:** `work/phase2/gate-c-runs/qs33-c4-live-01/artifact-sha256.json` (153 raw files)  
**Total Wall-Clock Time:** 408 seconds (~6 minutes 48 seconds)  

### Complete 17-Run Execution Table:

| Index | Role | Run ID | Exit Code | Tests Total | Tests Passed | Failing Test & Failure Identity | Probe Exit Code & Output | Duration |
| :---: | :--- | :----- | :-------: | :---------: | :----------: | :------------------------------ | :----------------------- | :------: |
| 1 | `buggy` | `c4-live-buggy-01-1792475793013` | 1 | 56 | 55 | Test 40 (`TypeError: source.hasOwnProperty is not a function`) | 1 (`TypeError` at `/case/lib/utils.js:47:20`) | 3,018ms |
| 2 | `buggy` | `c4-live-buggy-02-1792475835939` | 1 | 56 | 55 | Test 40 (`TypeError: source.hasOwnProperty is not a function`) | 1 (`TypeError` at `/case/lib/utils.js:47:20`) | 1,576ms |
| 3 | `buggy` | `c4-live-buggy-03-1792475861827` | 1 | 56 | 55 | Test 40 (`TypeError: source.hasOwnProperty is not a function`) | 1 (`TypeError` at `/case/lib/utils.js:47:20`) | 1,503ms |
| 4 | `buggy` | `c4-live-buggy-04-1792475888512` | 1 | 56 | 55 | Test 40 (`TypeError: source.hasOwnProperty is not a function`) | 1 (`TypeError` at `/case/lib/utils.js:47:20`) | 1,907ms |
| 5 | `buggy` | `c4-live-buggy-05-1792475912420` | 1 | 56 | 55 | Test 40 (`TypeError: source.hasOwnProperty is not a function`) | 1 (`TypeError` at `/case/lib/utils.js:47:20`) | 1,134ms |
| 6 | `buggy` | `c4-live-buggy-06-1792475947656` | 1 | 56 | 55 | Test 40 (`TypeError: source.hasOwnProperty is not a function`) | 1 (`TypeError` at `/case/lib/utils.js:47:20`) | 1,298ms |
| 7 | `buggy` | `c4-live-buggy-07-1792475975765` | 1 | 56 | 55 | Test 40 (`TypeError: source.hasOwnProperty is not a function`) | 1 (`TypeError` at `/case/lib/utils.js:47:20`) | 946ms |
| 8 | `buggy` | `c4-live-buggy-08-1792475997276` | 1 | 56 | 55 | Test 40 (`TypeError: source.hasOwnProperty is not a function`) | 1 (`TypeError` at `/case/lib/utils.js:47:20`) | 915ms |
| 9 | `buggy` | `c4-live-buggy-09-1792476016296` | 1 | 56 | 55 | Test 40 (`TypeError: source.hasOwnProperty is not a function`) | 1 (`TypeError` at `/case/lib/utils.js:47:20`) | 842ms |
| 10 | `buggy` | `c4-live-buggy-10-1792476037342` | 1 | 56 | 55 | Test 40 (`TypeError: source.hasOwnProperty is not a function`) | 1 (`TypeError` at `/case/lib/utils.js:47:20`) | 1,500ms |
| 11 | `reference` | `c4-live-reference-01-1792476058272` | 0 | 56 | 56 | None (0 failures, 0 skips, 0 TODOs) | 0 (`PASS`, `{"a":{"b":"c"}}`) | 1,325ms |
| 12 | `reference` | `c4-live-reference-02-1792476080644` | 0 | 56 | 56 | None (0 failures, 0 skips, 0 TODOs) | 0 (`PASS`, `{"a":{"b":"c"}}`) | 881ms |
| 13 | `reference` | `c4-live-reference-03-1792476100594` | 0 | 56 | 56 | None (0 failures, 0 skips, 0 TODOs) | 0 (`PASS`, `{"a":{"b":"c"}}`) | 1,385ms |
| 14 | `alternate` | `c4-live-alternate-01-1792476120704` | 0 | 56 | 56 | None (0 failures, 0 skips, 0 TODOs) | 0 (`PASS`, `{"a":{"b":"c"}}`) | 852ms |
| 15 | `alternate` | `c4-live-alternate-02-1792476139712` | 0 | 56 | 56 | None (0 failures, 0 skips, 0 TODOs) | 0 (`PASS`, `{"a":{"b":"c"}}`) | 1,220ms |
| 16 | `alternate` | `c4-live-alternate-03-1792476160538` | 0 | 56 | 56 | None (0 failures, 0 skips, 0 TODOs) | 0 (`PASS`, `{"a":{"b":"c"}}`) | 1,260ms |
| 17 | `decoy` | `c4-live-decoy-01-1792476180452` | 1 | 56 | 55 | Test 40 (`AssertionError`) | 1 (`AssertionError`, `{"a":{}}`) | 1,160ms |

---

## 5. Independent Evaluator Verdict

All 17 executions were evaluated by `evaluateExternalEvidence(manifest, QS33_CANDIDATE_TEST, matrix)` in `packages/judge/src/external.ts`:

- **Evaluator Status:** **`VERIFIED`**
- **Reason Codes:** `[]` (empty, 0 failures)
- **Deterministic Runs:** `10`
- **Deterministic Failures:** `10`

### Evaluator Checks Breakdown:

| Check | Verdict | Details |
| :---- | :-----: | :------ |
| `buggyFails` | **TRUE** | Exactly 10 buggy executions; all 10 exited 1, bound to base commit and buggy patch hash, and failed test 40. |
| `sameFailureIdentity` | **TRUE** | All 10 buggy executions failed with `TypeError` and top application frame `at exports.clone (/case/lib/utils.js:47:20)`. |
| `referenceFixPasses` | **TRUE** | Exactly 3 reference fix executions; all 3 exited 0, 56/56 tests passed, and probe succeeded. |
| `alternateFixPasses` | **TRUE** | Exactly 3 alternate fix executions; all 3 exited 0, 56/56 tests passed, and probe succeeded. |
| `decoyFixStillFails` | **TRUE** | Decoy execution exited 1, 55 tests passed, test 40 failed, and probe rejected `{"a":{}}`. |
| `deterministicRuns` | **10** | 10 buggy executions in matrix. |
| `deterministicFailures`| **10** | 10 deterministic failure reproductions. |
| `offlineExecution` | **TRUE** | All 17 executions strictly verified `--network none`. |
| `isolatedExecution` | **TRUE** | All 17 executions verified nonroot UID 1000:1000, read-only rootfs, cap-drop ALL, no-new-privileges, <=1 CPU, <=256 MiB RAM, <=64 PIDs. |
| `freshState` | **TRUE** | 17 unique run IDs, 17 fresh workspaces. |
| `noSleepBasedTiming` | **TRUE** | AST inspection confirmed zero banned time/process calls in candidate test. |
| `reviewableTest` | **TRUE** | Candidate test length (187 bytes, 7 lines) within review limits. |
| `sameCandidate` | **TRUE** | Manifest and execution candidateHash digests match candidate source. |

---

## 6. Security, Isolation & Cleanup Audit

1. **Docker Isolation Policy Enforced Across All 17 Runs:**
   - Pre-start inspect asserted:
     - `NetworkMode: "none"`
     - `ReadonlyRootfs: true`
     - `User: "1000:1000"`
     - `CapDrop: ["ALL"]`
     - `SecurityOpt: ["no-new-privileges"]`
     - `HostConfig.Binds: null` (no host directories mounted)
     - Private labeled volume used exclusively for `/case`.
2. **Watchdog Enforcement:**
   - Container PID-1 executed under `/usr/bin/timeout --signal=KILL 29s`.
   - Supervisor enforced 30s timeout on execution commands.
3. **100% Cleanup Verified:**
   - Every container killed and removed post-run (`cleaned === true`).
   - Every disposable named volume removed (`volumeName-case`).

---

## 7. Artifact Integrity Audit

All 153 raw artifact files in `work/phase2/gate-c-runs/qs33-c4-live-01` were cryptographically hashed (SHA-256) and recorded in `artifact-sha256.json`.
The automated audit confirmed:
- 10 buggy runs x 9 artifacts = 90 files
- 3 reference runs x 9 artifacts = 27 files
- 3 alternate runs x 9 artifacts = 27 files
- 1 decoy run x 9 artifacts = 9 files
- **Total:** 153 files. 153/153 match recorded SHA-256 digests.
- 0-byte standard error streams (`probe.stderr` on reference and alternate runs) faithfully preserved with digest `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

---

## 8. Milestone Transition & Acceptance

| Milestone | Status | Description |
| --------- | :----: | ----------- |
| Stage C1 | **PASS** | External supervisor vertical slice & isolated buggy execution |
| Stage C2 | **PASS** | Authentic sequential buggy/fixed live execution, probe validation, and 9 negative controls |
| Stage C3 | **PASS** | Candidate patch validation, security boundaries, counterfactual execution, and 15 negative controls |
| Stage C4 | **PASS (VERIFIED)** | Full 10/3/3/1 external matrix execution, determinism, independent evaluator status promotion to `VERIFIED` |

**Acceptance Decision:** Gate C4 is officially accepted as **PASS**. External status is promoted to **`VERIFIED`**.
Development of qs-specific upstream reproduction infrastructure is now frozen. Proceed to Part B & Part C milestone preparation.
