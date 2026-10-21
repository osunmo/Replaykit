# Gate Decision — Phase 3: First Blind AI Regression-Test Generation

**Date:** 2026-10-20  
**Decision:** **PASS for Phase 3 — First Authentic Blind AI Regression-Test Generation, Epistemic Controls, and Four-Target Semantic Discrimination.**  
**Target:** Authentic `ljharb/qs` Issue #33 Regression (`360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` buggy base).  
**Synthesis Model:** `qwen2.5-coder:3b` via Ollama local API (`http://127.0.0.1:11434`).  
**Classification:** `CONTRACT-CONDITIONED SYNTHESIS`.  
**Generated Test SHA-256:** `6a174eabccf0651b18f893967a068495f88a4a1fb6dc01aed56ed9307ee5b774`.  
**Evaluation Runner:** External container supervisor (`packages/runtime/src/external-supervisor.ts`) under `--network none` isolation.  

---

## 1. Executive Summary & Acceptance Decision

ReplayKit has successfully crossed the foundational boundary from **test execution** to **novel test creation**. Under strict, cryptographically verified blinding conditions—with upstream test #40, candidate patches, solution git history, and issue-specific probes completely scrubbed from the generator workspace—an actual AI coding model (`qwen2.5-coder:3b`) synthesized a novel, executable regression test from production incident telemetry and a behavioral contract.

When submitted to independent four-target evaluation across isolated Docker containers, the frozen generated test:
1. **Target 1 (Buggy Base)**: **FAILS** with exit code 1, reproducing native `TypeError: source.hasOwnProperty is not a function` at `/case/lib/utils.js:47:20`.
2. **Target 2 (Reference Fix)**: **PASSES** with exit code 0 and 0 assertion errors.
3. **Target 3 (Alternate Fix)**: **PASSES** with exit code 0 and 0 assertion errors.
4. **Target 4 (Decoy Fix)**: **FAILS** with exit code 1 on semantic correctness (`AssertionError`), independently catching that the decoy fix drops nested dictionary properties (`{ a: {} }` instead of `{ a: { b: 'c' } }`).
5. **Non-Regression Verification**: The 55 unaffected baseline official tests passed cleanly across all four targets. The generated test was the sole detector of the decoy defect.

In a companion negative control trial, ReplayKit proved epistemic honesty: when presented with an incident context lacking a behavioral contract, it yielded `status: "INSUFFICIENT_ORACLE"` without guessing or fabricating test assertions.

**Acceptance Decision:** Phase 3 is officially accepted as **PASS**.

---

## 2. Invariants & Scope Verification

1. **No Rerun of Prior Gates**:
   - Gates B, C1, C2, C3, and C4 were not rerun.
   - All historical run directories in `work/phase2/gate-b-runs/` and `work/phase2/gate-c-runs/` remain untouched.
2. **Protected R1 Immutability**:
   - `packages/judge/src/evaluate.ts`: Byte-for-byte untouched (`git diff --exit-code`).
   - `packages/contracts/src/index.ts`: Byte-for-byte untouched (`git diff --exit-code`).
3. **Single Bounded Experiment Execution**:
   - Exactly one contract-conditioned synthesis trial and one four-target evaluation matrix executed.
   - Exactly one insufficient-oracle control trial executed.
   - Zero integration with Medusa e-commerce pipelines conducted.

---

## 3. Local PowerShell Reproduction Command

To reproduce the entire Phase 3 experiment locally from scratch:

```powershell
# 1. Run strict typecheck across the monorepo
pnpm typecheck

# 2. Run unit test suite (sanitizer, generator, AST safety, TAP parsing)
pnpm exec vitest run packages/runtime/src/blind-synthesis.test.ts

# 3. Execute the full Phase 3 blind synthesis & four-target evaluation
pnpm exec tsx scripts/phase3/run-blind-synthesis.ts

# 4. Verify byte-for-byte immutability of protected R1 files
git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts
```

---

## 4. Stage S1: Workspace Sanitization & Blinding Audit

A dedicated, isolated workspace was constructed at `work/phase3/sanitized-buggy-workspace`:
- **Source Revision**: `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` (`source-buggy`).
- **Scrubbing of Test #40**:
  Lines 360–367 of `test/parse.js` containing historical test 40 (`parses plain objects correctly`) were scrubbed cleanly from the file.
  AST analysis confirmed `test/parse.js` contains exactly 39 tests (reduced from 40).
- **Anti-Leakage Scanning**:
  An automated 20-file scanner checked for:
  - Commit SHA `6a97ad1d71d8a9069f5d6002cab3130752519ccb` and short prefix `6a97ad1d`
  - Historical test title `'parses plain objects correctly'`
  - Reference patch digest `fc1d3f9205a621617ca4f86432411dfddf6422432dfcb6d80f936af920cafe8e`
  - Alternate patch digest `760d2dbd744d610b81426da10c412fc8db40b930e15ce895296157eaeb24ff28`
  - Decoy patch digest `318a5449a218b2d5d882fc6993086de1f53300559f1dfd2ed0d30696c87f6e81`
  - Probe tokens (`gate-b-probe`, `issue33-output`, `issue33-assertion`)
  - Patch files (`reference.patch`, `alternate.patch`, `decoy.patch`)
  - `.git` directory and remote references
- **Audit Outcome**: **PASS (0 leaked bytes, 0 forbidden tokens detected)**.
- **Audit Evidence**: Recorded at `work/phase3/blinding-audit.json` and `work/phase3/sanitized-workspace-manifest.json`.

---

## 5. Stage S2: Incident Evidence & Behavioral Contract

### 5.1 Observed Incident Facts (Telemetry)
- **Error Type**: `TypeError`
- **Error Value**: `source.hasOwnProperty is not a function`
- **Top Application Frame**: `at exports.clone (/case/lib/utils.js:47:20)`
- **Triggering Input**:
  ```javascript
  var dict = Object.create(null);
  dict.b = 'c';
  var input = { a: dict };
  ```

### 5.2 Behavioral Specification (Contract)
- **Classification**: `CONTRACT-CONDITIONED SYNTHESIS`
- **Specification**: `Qs.parse(object)` must recursively clone and parse nested object keys into a merged query object preserving all key-value entries regardless of prototype inheritance chain. Objects created via `Object.create(null)` represent plain key-value maps without prototype methods and must retain their properties during merging and cloning. Expected output for input `{ a: dict }` where `dict` has `b = "c"` is `{ a: { b: "c" } }`.
- **Provenance**: `upstream_issue_spec`.
- **Payload Path**: `work/phase3/incident-context/contract-conditioned-incident.json`.

---

## 6. Stage S3: AI Model Invocation & Generated Code

### 6.1 Generation Telemetry & Artifacts
- **Model**: `qwen2.5-coder:3b`
- **Provider**: Ollama local API (`http://127.0.0.1:11434/api/generate`)
- **Sampling Parameters**: Temperature = 0.2, Top P = 0.9, Stream = false
- **Generation Duration**: 38,041 ms (~38.0 seconds)
- **SHA-256 Digest**: `6a174eabccf0651b18f893967a068495f88a4a1fb6dc01aed56ed9307ee5b774`
- **Levenshtein Distance to Test 40**: 403 (structurally and lexically distinct)
- **Assertion Provenance**: `upstream_issue_spec`
- **Recorded Generator Artifacts**:
  - Exact Prompt: `work/phase3/generator-runs/generator-prompt.txt`
  - Input Payload: `work/phase3/generator-runs/generator-input.json`
  - Raw Model Response: `work/phase3/generator-runs/raw-model-response.txt`
  - Execution Manifest: `work/phase3/generator-runs/generation-manifest.json`
  - Frozen Test Code: `work/phase3/generator-runs/repro.test.js`

### 6.2 Generated Test Code (`work/phase3/generator-runs/repro.test.js`)
```javascript
var Lab = require('lab');
var Qs = require('../');

var expect = Lab.expect;
var describe = Lab.experiment;
var it = Lab.test;

describe('#parse', function () {

    it('should parse nested Object.create(null) dictionary correctly', function (done) {

        // Setup triggering input
        var dict = Object.create(null);
        dict.b = 'c';
        var input = { a: dict };

        // Call Qs.parse
        var result = Qs.parse(input);

        // Assert expected result preserving nested key-value entries
        expect(result).to.deep.equal({ a: { b: 'c' } });

        done();
    });
});
```

---

## 7. Stage S4: Hidden Four-Target Live Container Evaluation

The frozen generated test was mounted into four isolated containers and evaluated under the two-tier execution protocol:

| Target Index | Target Role | Patch Digest / Base | Generated Test Exit Code | Generated Test Outcome & Failure Type | Combined Suite Result (56 Tests) | Decoy Semantic Rejection |
| :---: | :--- | :--- | :---: | :--- | :---: | :---: |
| **Target 1** | `buggy` | Commit `360e2b0b...` (No patch) | **1** | `FAIL` — `TypeError: source.hasOwnProperty is not a function` at `/case/lib/utils.js:47:20` | 55 Pass / 1 Fail (repro test fails) | Defect reproduced |
| **Target 2** | `reference` | `fc1d3f9205a621617ca4f86432411dfddf6422432dfcb6d80f936af920cafe8e` | **0** | `PASS` — All assertions succeed (`result.a.b === 'c'`) | 56 Pass / 0 Fail | Valid upstream repair passes |
| **Target 3** | `alternate` | `760d2dbd744d610b81426da10c412fc8db40b930e15ce895296157eaeb24ff28` | **0** | `PASS` — All assertions succeed (`result.a.b === 'c'`) | 56 Pass / 0 Fail | Valid alternate repair passes |
| **Target 4** | `decoy` | `318a5449a218b2d5d882fc6993086de1f53300559f1dfd2ed0d30696c87f6e81` | **1** | `FAIL` — `AssertionError`: deep equal failed (`{ a: {} }` dropped `{ b: 'c' }`) | 55 Pass / 1 Fail (repro test fails) | **REJECTED ON SEMANTICS** |

### Key Evaluation Findings:
1. **The Generated Test Itself Rejects the Decoy**:
   The decoy fix passed all 55 baseline tests. The **only** test that failed in the decoy container was the newly generated test (`test/repro.test.js`). This conclusively proves that the generated test tested semantic object preservation rather than merely shallow exception absence.
2. **Deterministic Reproduction**:
   On the buggy revision, the generated test deterministically exhibited the identical `TypeError` and stack frame (`/case/lib/utils.js:47:20`) observed in production telemetry.
3. **Non-Regression Invariant**:
   Adding `repro.test.js` did not cause regressions in any of the 55 baseline tests on reference or alternate fixes.

---

## 8. Stage S5: Independent Controls & Verification

### 8.1 Insufficient-Oracle Control Trial
- Incident payload: `work/phase3/incident-context/insufficient-oracle-incident.json`.
- Missing context: Behavioral contract for prototype-less objects omitted (`oracle.sourceType: "inferred"`, `oracle.confidence: "ambiguous"`).
- Generator outcome: **`status: "INSUFFICIENT_ORACLE"`**.
- Blocking reason: `"No documented contract specifies whether prototype-less dictionary keys should be preserved, ignored, or converted to empty objects. Without a behavioral contract, expected output cannot be derived."`
- Emitted test source: `null`.
- Verification: Demonstrates that ReplayKit does not fabricate assertions when the oracle is underspecified.

### 8.2 Security, Isolation & Cleanup
- Pre-start inspect asserted `--network none`, nonroot `1000:1000`, read-only rootfs, `cap-drop ALL`, `no-new-privileges`, CPU <= 1, RAM <= 256 MiB, PIDs <= 64.
- 100% of containers and private named volumes removed post-run (`cleaned: true`).

### 8.3 Cryptographic Artifact Registry & Integrity
All 57 raw artifacts in `work/phase3` were hashed (SHA-256) and verified in `work/phase3/artifact-sha256.json`.
The verification audit confirms 57/57 files match their recorded digests:
- 1 sanitized workspace manifest (`sanitized-workspace-manifest.json`)
- 1 blinding audit record (`blinding-audit.json`)
- 2 incident context payloads (`contract-conditioned-incident.json` & `insufficient-oracle-incident.json`)
- 20 sanitized workspace files (authentic qs buggy source with test 40 scrubbed)
- 1 control trial result (`insufficient-oracle-result.json`)
- 5 generator runs artifacts (`generator-prompt.txt`, `generator-input.json`, `raw-model-response.txt`, `generation-manifest.json`, `repro.test.js`)
- 1 evaluation verdict record (`evaluator-runs/evaluation-verdict.json`)
- 26 target execution artifacts across 4 container runs (buggy, reference, alternate, decoy)
- 0 hash mismatches (57/57 verified OK).

---

## 9. Limitations & Unresolved Risks

1. **Contract-Conditioned Boundary**:
   The test was synthesized with an explicit behavioral contract (`preserve key-value entries regardless of prototype inheritance chain`). Without this contract, the generator correctly yields `INSUFFICIENT_ORACLE`. Synthesis without a behavioral contract remains an open research challenge.
2. **Single Trial Scope**:
   One successful trial on `ljharb/qs` issue #33 establishes feasibility for this defect class, but does not prove general reliability across arbitrary repositories or dynamic languages.
3. **Execution Sandboxing Prerequisite**:
   Execution requires Docker with Linux container support. Environments lacking Docker must execute via external runner hooks.
