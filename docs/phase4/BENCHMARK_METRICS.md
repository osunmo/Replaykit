# ReplayKit Benchmark Metrics Record

**Date:** 2026-10-20  
**Phase:** Phase 4 Real-World Generalization  
**Scope:** Reusable evaluation metrics spanning Phase 3 (`ljharb/qs` #33) and Phase 4 (`fastify/fastify` #4807)  
**Schema:** `benchmark-metrics-v1` (`work/phase4/benchmark-metrics.json`)

---

## 1. Metric Principles & Epistemic Disclaimer

> [!WARNING] **Statistical Generalization Boundary**  
> Do not report a statistically meaningful generalization rate from only one or two cases. The metrics recorded below represent empirical measurements across $N = 2$ contract-conditioned trials and $2$ negative control trials. They demonstrate architectural feasibility and multi-target container isolation across diverse Node.js architectures, but do not claim production reliability across arbitrary uncurated repositories.

---

## 2. Reusable Evaluation Metrics (Part 5 Specifications)

| Metric | Target Specification | Phase 3 (`ljharb/qs` #33) | Phase 4 (`fastify/fastify` #4807) | Consolidated Benchmark (N = 2) |
| :--- | :--- | :---: | :---: | :---: |
| **1. Incidents Attempted** | Total distinct incidents staged | 1 | 1 | **2** |
| **2. Sufficient Behavioral Oracles** | Cases with explicit contract specification | 1 (+ 1 negative control) | 1 (+ 1 negative control) | **2 (+ 2 negative controls)** |
| **3. Generation Success Rate** | Synthesized test runnable without crash | 1 / 1 (100%) | 1 / 1 (100%) | **2 / 2 (100%)** |
| **4. Generated-Test Validity** | AST compliance, allowed assertions, safety | 1 / 1 (100%) | 1 / 1 (100%) | **2 / 2 (100%)** |
| **5. Buggy Reproduction Rate** | Pinned buggy base reproduces historical error | 1 / 1 (`TypeError`) | 1 / 1 (`TypeError`) | **2 / 2 (100%)** |
| **6. Correct-Fix Acceptance Rate** | Reference & alternate fixes pass test | 2 / 2 (100%) | 2 / 2 (100%) | **4 / 4 (100%)** |
| **7. Incorrect-Fix Rejection Rate** | Decoy fix rejected by generated test | 1 / 1 (`AssertionError`) | 1 / 1 (`AssertionError`) | **2 / 2 (100%)** |
| **8. False-Positive Rate** | Valid repairs rejected by generated test | 0 / 2 (0.0%) | 0 / 2 (0.0%) | **0 / 4 (0.0%)** |
| **9. Unrelated Regression Failures** | Baseline tests failing due to test harness | 0 (55/55 passed) | 0 (baseline passed) | **0** |
| **10. Setup and Generation Time** | Setup time + model completion latency | Setup: ~5s<br>Gen: 38,041 ms | Setup: ~12s<br>Gen: 60,810 ms | Setup: ~17s<br>Gen: 98,851 ms |
| **11. Execution Wall Time** | Multi-target differential container runtime | ~18.0s | 8.8s | **~26.8s** |
| **12. Model and Token Costs** | Local Ollama `qwen2.5-coder:3b` token usage | 544 in, 144 out<br>Cost: $0.00 | 461 in, 143 out<br>Cost: $0.00 | **1,005 in, 287 out (1,292 total)**<br>Cost: **$0.00** |
| **13. Integration Effort** | Adapter LOC / custom engineering code | Manual adapter: 1,054 LOC (`qs33-adapter.ts`) | Config preset: 38 LOC (`createFastifyPreset`) | **~96% integration code reduction** |
| **14. Security & Integrity Failures** | Breaches of isolation or hash mismatches | 0 violations<br>57/57 verified hashes | 0 violations<br>2,079/2,079 verified hashes | **0 violations, 2,136/2,136 verified hashes** |

---

## 3. Incident Breakdown & Provenance

### Incident 1: `ljharb/qs` Issue #33
- **Domain:** Utility Data Structure Parser (query string serialization).
- **Buggy Base Commit:** `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725`
- **Fixed Commit:** `6a97ad1d71d8a9069f5d6002cab3130752519ccb`
- **Provenance note:** The pinned Phase 3 trial uses the fixed commit above (see `fixtures/qs-issue-33/config.json` and `work/phase3/blinding-audit.json`). Historical `work/phase4/benchmark-metrics.json:30` retains `49735d55e2e8e974e64f7b600ea2f65ee6c17849`; that attribution remains unverified, and the historical record is preserved unchanged.
- **Error Signature:** `TypeError: source.hasOwnProperty is not a function` at `/case/lib/utils.js:47:20`.
- **Negative Control Trial:** Returned `status: "INSUFFICIENT_ORACLE"` with zero hallucinated assertions via deterministic runtime contract prevalidation.
- **Generated Test Hash:** `6a174eabccf0651b18f893967a068495f88a4a1fb6dc01aed56ed9307ee5b774`
- **Decoy Discrimination:** Solely rejected by the generated test with `AssertionError: expected { a: {} } to deeply equal { a: { b: 'c' } }`; all 55 baseline tests passed.

### Incident 2: `fastify/fastify` Issue #4807 / PR #4826
- **Domain:** Production HTTP Backend Framework (request lifecycle and router error handling).
- **Buggy Base Commit:** `61b86760019c85afbef6cc0f175c75870381ed04`
- **Fixed Commit:** `c2b89732d583a0e0d8e0a666b2eb9b62610edf34`
- **Error Signature:** `TypeError: Cannot read properties of undefined (reading 'config')` at `/case/lib/request.js:204:55`.
- **Negative Control Trial:** Returned `status: "INSUFFICIENT_ORACLE"` with zero hallucinated assertions.
- **Generated Test Hash:** `2ef58646bf3f84f3ade7889199c744128c209ef9c33b2d1b6461c28918c6b998`
- **Decoy Discrimination:** Decoy patch returned `{}` for `routeConfig`. Rejected solely by generated test with `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: {} !== undefined` at `/case/test/repro.test.js:6:12`. Baseline sanity routing passed across all 4 targets.

---

## 4. Integration Effort & Architectural Decoupling

The transition from Phase 3 to Phase 4 achieved decoupling of ReplayKit's architecture:
1. **From Custom Code to Configuration:** In Phase 3, running `qs` required a dedicated 1,054-line TypeScript file (`packages/runtime/src/adapters/qs33-adapter.ts`) implementing custom Lab TAP parsers, custom patch staging, and hardcoded file arrays. In Phase 4, Fastify was staged and evaluated using the generic adapter (`packages/runtime/src/adapters/generic-adapter.ts`) with a declarative 38-line preset (`createFastifyPreset`).
2. **Standardized Security Envelopes:** Both cases enforced identical container security policies: non-root UID `1000:1000`, `--network none`, `--read-only` root filesystem, `--cap-drop ALL`, `no-new-privileges`, 1 CPU, 256 MiB RAM, and 64 PIDs limit.
3. **Reproducibility:** All artifacts are tracked in cryptographic hash registries (`work/phase3/artifact-sha256.json` and `work/phase4/artifact-sha256.json`).
