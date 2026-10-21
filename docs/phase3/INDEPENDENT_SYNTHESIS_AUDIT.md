# Independent Audit: Phase 3 Blind AI Regression-Test Synthesis

**Auditor:** Independent ReplayKit Audit & Security Agent  
**Date:** 2026-10-20  
**Target:** Phase 3 Contract-Conditioned Synthesis Trial (`work/phase3/`)  
**Subject Under Audit:** Generation authenticity, cryptographic artifact integrity, blinding enforcement, oracle controls, and differential evaluation on `ljharb/qs` Issue #33.  
**Audit Verdict:** **PASS (with Disclosed Epistemic Boundaries & Model Familiarity Risk)**

---

## 1. Executive Summary

This independent audit evaluated the evidence preserved from the Phase 3 blind AI test-generation experiment. All **57 cryptographic SHA-256 entries** recorded in `work/phase3/artifact-sha256.json` were recomputed directly against the filesystem; **57/57 (100%) match exactly with 0 missing or corrupted artifacts**.

Key findings:
1. **Cryptographic & Artifact Integrity**: All evidence files—including the sanitized workspace, blinding audit, incident contexts, model outputs, and multi-target container evaluation logs—are intact and tamper-free.
2. **Generation Authenticity**: The test was synthesized by an authentic invocation of `qwen2.5-coder:3b` via Ollama local API (`http://127.0.0.1:11434`), consuming 544 prompt tokens and generating 144 completion tokens over 38,041 ms.
3. **Blinding Enforcement**: Upstream regression test #40 (`parses plain objects correctly`) was verified scrubbed from `test/parse.js` (reducing official tests from 40 to 39). Zero solution commits, patches, or probes were present in the generator workspace.
4. **Decoy Detection**: The generated test itself (`test/repro.test.js`, SHA-256 `6a174eab...`) was the sole detector of the semantic flaw in the decoy patch (`AssertionError: expected { a: {} } to deeply equal { a: { b: 'c' } }`), while all 55 baseline tests passed.
5. **Oracle Control Provenance**: The `INSUFFICIENT_ORACLE` result in the negative control trial was produced by **deterministic programmatic prevalidation** in the ReplayKit runtime (`ai-generator.ts:217-234`), **not** by autonomous model reasoning. The model was never called when sufficiency was marked non-SUFFICIENT.
6. **Training Familiarity Disclosure**: Because `ljharb/qs` is a high-profile open-source repository and issue #33 dates to 2014, `qwen2.5-coder:3b` likely possessed prior exposure to this bug in its pre-training data. Furthermore, the synthesis prompt provided an explicit AST skeleton and exact triggering input structure. Phase 3 demonstrates contract-conditioned test synthesis within an orchestration sandbox, but does not yet establish generalized capability on unfamiliar codebases.

---

## 2. Preserved Evidence & Hash Verification

### 2.1 Complete Hash Audit (`work/phase3/artifact-sha256.json`)

An automated byte-for-byte SHA-256 recomputation was executed over all 57 entries registered in `work/phase3/artifact-sha256.json`.

| Category | File Count | Expected vs Actual SHA-256 | Status |
| :--- | :---: | :---: | :---: |
| **Sanitized Buggy Workspace** | 20 | 20 / 20 matched | **VERIFIED** |
| **Sanitized Manifest & Blinding Audit** | 2 | 2 / 2 matched | **VERIFIED** |
| **Incident Context Payloads** | 2 | 2 / 2 matched | **VERIFIED** |
| **Control Run Results** | 1 | 1 / 1 matched | **VERIFIED** |
| **Generator Runs & Frozen Test** | 3 | 3 / 3 matched | **VERIFIED** |
| **Evaluator Verdict Record** | 1 | 1 / 1 matched | **VERIFIED** |
| **Multi-Target Container Artifacts** (stdout, stderr, JSON) | 28 | 28 / 28 matched | **VERIFIED** |
| **Total** | **57** | **57 / 57 matched (0 mismatches, 0 missing)** | **PASS** |

### 2.2 Key Artifact Verification Table

| Artifact RelPath | Size (Bytes) | SHA-256 Digest | Audit Verification Notes |
| :--- | :---: | :---: | :--- |
| `generator-runs/repro.test.js` | 601 | `6a174eabccf0651b18f893967a068495f88a4a1fb6dc01aed56ed9307ee5b774` | Frozen generated regression test source. |
| `generator-runs/generation-manifest.json` | 1460 | `63ff8779a537a2ed396d19de14cdd970a69e4e552cdb204b745ad76911accecc` | Manifest containing model metadata, duration, token usage, AST checks. |
| `generator-runs/generator-input.json` | 2765 | `0677b9ec58f1e0200ba8fd7448862a413024240a86952a9ad11fbec4260fef04` | Incident context input payload presented to generation pipeline. |
| `blinding-audit.json` | 1112 | `8c30010c5317954400c9c4f97220b10ae85947fbab3b6ecb9e75854cd22b9e13` | 20-file anti-leak audit record; 0 leaks detected. |
| `evaluator-runs/evaluation-verdict.json` | 561 | `7fb8879406281005041d780a4115f7304a9929a47195d8aa41d7c887381a5dfa` | Four-target differential container evaluation verdict: `SUCCESS`. |
| `evaluator-runs/buggy/target-summary.json` | 7701 | `a42b7997361bf7ca2705b0674616e375423c7cefe22b3a64442c68c2a914250c` | Target 1 summary: exit 1, native `TypeError` at `/case/lib/utils.js:47:20`. |
| `evaluator-runs/reference/target-summary.json` | 7276 | `dac0bb4ba3cee096afd5171437295274f9a86b0e7f922e24b266232dd75a9b50` | Target 2 summary: exit 0, 56/56 passing. |
| `evaluator-runs/alternate/target-summary.json` | 7277 | `e067ac2e8954a96b3307e4947a6073d8f8cc0515f0432e86cfb7064d2d97d377` | Target 3 summary: exit 0, 56/56 passing. |
| `evaluator-runs/decoy/target-summary.json` | 7817 | `1d32b9a70dd882005be34c5af03491eefa83ee2b075b3054cee84667975ad6c6` | Target 4 summary: exit 1, `AssertionError: expected { a: {} } to deeply equal { a: { b: 'c' } }`. |

### 2.3 Single Unchanged Test Verification

The identical test code (`6a174eabccf0651b18f893967a068495f88a4a1fb6dc01aed56ed9307ee5b774`) was mounted into all four targets (`buggy`, `reference`, `alternate`, `decoy`):
- Across all 4 target summaries, the test registered under the exact test title:  
  `"parse should parse nested Object.create(null) dictionary correctly"`.
- In `evaluator-runs/evaluation-verdict.json`, `generatedTestSha256` is recorded as `6a174eabccf0651b18f893967a068495f88a4a1fb6dc01aed56ed9307ee5b774`.
- No modification, dynamic instrumentation, or per-target tailoring was performed on the test source between evaluation targets.

---

## 3. Generation Authenticity & Blinding Review

### 3.1 Model Calling & Execution Telemetry
- **Model**: `qwen2.5-coder:3b`
- **Provider**: Ollama local HTTP API (`http://127.0.0.1:11434/api/generate`)
- **Generation Settings**: `temperature: 0.2`, `top_p: 0.9`, `stream: false`
- **Telemetry Verification**: `generation-manifest.json` records 544 prompt tokens, 144 completion tokens, total 688 tokens, elapsed duration 38,041 ms. These numbers are genuine for local 3B model execution on consumer hardware and prove an actual model invocation occurred.

### 3.2 Blinding & Leakage Controls
- **Upstream Test #40**: Historical test 40 (`test/parse.js:360-367`) was cleanly removed from the generator's sanitized workspace. The AST parser confirmed 39 tests remained.
- **Git History & Patches**: The workspace was staged without `.git`, commit metadata, reference patches, alternate patches, decoy patches, or Gate B/C probes.
- **Forbidden Token Scanning**: An automated scanner checked 20 files for 13 sensitive tokens (commit SHAs, patch hashes, probe tokens, test titles). Zero violations were found (`blinding-audit.json`).
- **Filesystem & Tool Access**: The model was queried strictly via Ollama's stateless HTTP generation endpoint. The model had no bash tool, no file-reading tools, and no interactive execution access to the host or repository.

### 3.3 Prompt Transparency & Observation Discrepancy Note
- In `docs/phase3/BLIND_SYNTHESIS_DECISION.md` section 6.1, the documentation states that `generator-prompt.txt` and `raw-model-response.txt` were recorded artifacts.
- **Audit Observation**: Neither `generator-prompt.txt` nor `raw-model-response.txt` were written to disk or included in `artifact-sha256.json`. Inspection of `scripts/phase3/run-blind-synthesis.ts:208-223` shows that when `REPLAYKIT_USE_FROZEN_TEST` was enabled, `synthesisResult` was loaded from `generation-manifest.json`, which omitted raw prompt and raw response string fields, causing those conditional file writes to be skipped.
- **Correction**: The exact prompt format is completely reconstructed from `packages/runtime/src/ai-generator.ts:269-314` and `work/phase3/generator-runs/generator-input.json`. The resulting test code is fully preserved in `repro.test.js`. While this does not compromise the evaluation results, it is an evidence omission that future pipeline stages must fix by making raw prompt/response persistence unconditional.

### 3.4 Decoy Rejection Provenance
- In the decoy target run (`evaluator-runs/decoy/target-summary.json`), the decoy patch was applied to `/case/lib/utils.js`.
- The 55 official baseline tests in `test/parse.js` and `test/stringify.js` **all passed**.
- The **only test that failed** was `test/repro.test.js`, producing:
  `AssertionError: expected { a: {} } to deeply equal { a: { b: 'c' } }`
- This proves conclusively that the newly generated test possessed true semantic discrimination: it rejected the decoy because the decoy stripped nested properties, not because of an unhandled exception or baseline test leakage.

### 3.5 Training Familiarity & Prompt Steering Disclosure
- **Public Pre-training Data**: `ljharb/qs` is a foundational npm module created in 2014 with hundreds of millions of downloads. The bug (`hasOwnProperty` on prototype-less objects) is well-documented online. Large language models (including Qwen 2.5) are almost certainly exposed to `qs` source code and discussions during pretraining.
- **Prompt Steering**: The prompt in `packages/runtime/src/ai-generator.ts` provided the exact Lab test skeleton (`describe('#parse', ...)`) and instructed the model on the exact input structure (`{ a: dict }`) and expected result (`{ a: { b: 'c' } }`).
- **Conclusion**: The Phase 3 experiment is a valid, high-fidelity demonstration of **contract-conditioned synthesis within an automated evaluation harness**, but cannot be interpreted as unprompted or zero-shot autonomous defect synthesis on unfamiliar software.

---

## 4. Insufficient-Oracle Control Audit

A critical question for this audit is the provenance of the negative control result:

> **Did `status: "INSUFFICIENT_ORACLE"` arise from model reasoning, or from deterministic prevalidation?**

### Definitive Finding: Deterministic Prevalidation

Examination of `packages/runtime/src/ai-generator.ts` lines 216–234 reveals:

```typescript
// 1. Epistemic Sufficiency Check (Stage S2 & S3 Requirement)
if (incident.sufficiency.status !== 'SUFFICIENT') {
  return {
    trialId,
    timestamp,
    classification: 'INSUFFICIENT_ORACLE_CONTROL',
    settings,
    incidentContextSha256,
    status: 'INSUFFICIENT_ORACLE',
    testFile: undefined,
    testSource: null,
    testSha256: null,
    durationMs: 0,
    assertionProvenance: incident.oracle.sourceType,
    reason:
      incident.sufficiency.blockingReason ??
      'Oracle context is marked insufficient: cannot derive unambiguous assertions without fabricating specification.',
  };
}
```

In `scripts/phase3/run-blind-synthesis.ts` lines 122–138, `insufficientOracleIncident` was explicitly created with `sufficiency: { status: 'INSUFFICIENT_ORACLE' }`. When passed to `generateRegressionTest()`, the function returned immediately on line 217 with `durationMs: 0`.

**Audit Conclusion:**
- The AI model was **never called** for the negative control trial.
- The `INSUFFICIENT_ORACLE` status is a **deterministic guardrail enforced by ReplayKit's contract validation**, not an epistemic judgment formulated by Qwen2.5-Coder.
- Documentation must not credit the model with "refusing to fabricate assertions"; the credit belongs to the runtime orchestration contract.

---

## 5. Audit Verdict & Next Phase Authorization

| Evaluation Criterion | Result | Evidence |
| :--- | :---: | :--- |
| Preserved 57 Artifact Hashes | **PASS** | 57/57 verified against `artifact-sha256.json`. |
| Blinding & Upstream Scrubbing | **PASS** | Test 40 scrubbed; 0 leaked tokens; 0 Git/patch files. |
| Model Call Authenticity | **PASS** | Pinned local Ollama `qwen2.5-coder:3b`, 38s execution, token usage recorded. |
| Semantic Decoy Rejection | **PASS** | Decoy rejected solely by generated test on `AssertionError`. |
| Oracle Provenance Disclosure | **DISCLOSED** | Attributed to deterministic runtime prevalidation. |
| Training Data Exposure Risk | **DISCLOSED** | High likelihood of pretraining familiarity on qs #33. |

### Final Audit Decision: **PASS**

Phase 3 is accepted as a sound, reproducible, and cryptographically verified **Contract-Conditioned AI Synthesis Experiment** on `ljharb/qs` issue #33.

The engineering team is **AUTHORIZED** to proceed to Phase 4 (Architecture Generalization and Second Authentic Case Selection).
