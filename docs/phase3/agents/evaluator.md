# Phase 3 Evaluator Agent Report — Four-Target Blind Evaluation Matrix

**Agent Role:** Evaluator Agent (Agent D)  
**Date:** 2026-10-20  
**Target:** Independent Four-Target Evaluation of AI-Generated Regression Test  
**Status:** COMPLETE & AUDITED  

---

## 1. Candidate Test Under Evaluation

The candidate test was synthesized by `qwen2.5-coder:3b` and cryptographically frozen prior to evaluation:
- **Test File:** `test/repro.test.js`
- **SHA-256 Digest:** `6a174eabccf0651b18f893967a068495f88a4a1fb6dc01aed56ed9307ee5b774`
- **Test Title:** `should parse nested Object.create(null) dictionary correctly`
- **Assertion:** `expect(result).to.deep.equal({ a: { b: 'c' } })`

---

## 2. Four-Target Differential Testbed

The evaluator mounted the frozen candidate test into four isolated Docker container testbeds:

```
                      +-----------------------------------+
                      |   AI-Generated repro.test.js     |
                      |   SHA-256: 6a174eabccf0651b...   |
                      +-----------------+-----------------+
                                        |
              +-------------------------+-------------------------+
              |                         |                         |                         |
              v                         v                         v                         v
       [Target 1: Buggy]       [Target 2: Ref Fix]       [Target 3: Alt Fix]       [Target 4: Decoy]
       Commit: 360e2b0b        Patch: reference.patch    Patch: alternate.patch    Patch: decoy.patch
              |                         |                         |                         |
              v                         v                         v                         v
         Must FAIL:                Must PASS:                Must PASS:                Must FAIL:
       TypeError: source.          All assertions            All assertions            AssertionError:
        hasOwnProperty is             succeed                   succeed               deep equal failed
         not a function            (exit code 0)             (exit code 0)             (exit code 1)
          (exit code 1)
```

---

## 3. Two-Tier Container Execution Protocol

Inside each target container, the supervisor executed two sequential test runs:
1. **Isolated Generated Test Run**:
   `node --require /case/gate-b-lab-adaptation.cjs node_modules/lab/bin/lab test/repro.test.js -r tap`
   - Measures the isolated behavior of the AI-generated test alone against the target code.
2. **Combined Suite Run (Non-Regression Check)**:
   `node --require /case/gate-b-lab-adaptation.cjs node_modules/lab/bin/lab -r tap`
   - Executes the 55 baseline tests alongside the newly added candidate test (56 total tests).
   - Verifies that unaffected tests continue to pass and proves that the generated test is the sole detector of the decoy.

---

## 4. Evaluation Criteria & Decision Matrix

| Target | Target Description | Expected Generated Exit Code | Expected Failure Identity | Decoy Rejection Reason |
| :--- | :--- | :---: | :--- | :--- |
| **Target 1: Buggy** | Base commit `360e2b0b...` without patch | **1** | `TypeError: source.hasOwnProperty is not a function` at `/case/lib/utils.js:47:20` | Native defect reproduction |
| **Target 2: Reference Fix** | Authentic fix `fc1d3f92...` using `Object.prototype.hasOwnProperty.call` | **0** | None (clean pass) | Valid upstream repair passes |
| **Target 3: Alternate Fix** | Independent fix `760d2dbd...` using `Boolean(Object.getOwnPropertyDescriptor)` | **0** | None (clean pass) | Valid alternate repair passes |
| **Target 4: Decoy Fix** | Subtle decoy `318a5449...` using `copy = [] : {}` and `source.hasOwnProperty && ...` | **1** | `AssertionError` | Decoy drops properties producing `{ a: {} }`; generated test rejects semantic regression |

---

## 5. Security & Isolation Verification

Across all four target executions:
- `networkMode: "none"` verified.
- `user: "1000:1000"` verified.
- `readonlyRoot: true` verified.
- `capDropAll: true` and `noNewPrivileges: true` verified.
- PID-1 29s watchdog active.
- Guaranteed teardown: 100% of ephemeral containers and named volumes removed.
