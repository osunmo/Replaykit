# Phase 3 QA & Quality Assurance Specification — Verification Criteria & Negative Controls

**Agent Role:** QA & Validation Agent (Agent E)  
**Date:** 2026-10-20  
**Target:** Independent Quality Assurance of Phase 3 Blind AI Synthesis Trial  
**Status:** COMPLETE & AUDITED  

---

## 1. Quality Assurance Verification Gates

The QA agent verified that the synthesis trial satisfies the following seven independent quality gates:

### Gate 1: Blinding & Anti-Leakage Audit
- Generator workspace: `work/phase3/sanitized-buggy-workspace`.
- Total files audited: 20 files.
- Test 40 status: Completely absent. Verified test count in `test/parse.js` is 39 (reduced from 40).
- Leak scanner: Scanned for commit `6a97ad1d`, test 40 title `'parses plain objects correctly'`, patch hashes, and historical probes.
- Result: **PASS (0 leaks detected)**.

### Gate 2: Insufficient-Oracle Negative Control
- When provided with an incident payload lacking a behavioral specification (`status: "INSUFFICIENT_ORACLE"`), the generator:
  - Immediately abstains from guessing.
  - Returns `status: "INSUFFICIENT_ORACLE"` with an explicit reason code.
  - Emits 0 fabricated assertions or hallucinated tests.
- Result: **PASS (Epistemic honesty verified)**.

### Gate 3: Authentic AI Model Invocation
- Invocation: Live call to `qwen2.5-coder:3b` hosted on local Ollama API (`127.0.0.1:11434`).
- No mocking, hardcoding, or replaying of pre-baked code.
- Telemetry: Real generation duration, prompt token counts, and completion token counts recorded in `generation-manifest.json`.
- Result: **PASS (Authentic model generation verified)**.

### Gate 4: Test Novelty & Non-Duplication
- AST validation: Tested for valid JavaScript syntax under Node 22 without syntax errors.
- Safety check: Zero banned APIs (`fetch`, `process.exit`, `setTimeout`, etc.).
- Lexical distance: Verified Levenshtein edit distance and structural differences compared to withheld upstream test 40.
- Result: **PASS (Novel test structure verified)**.

### Gate 5: Four-Target Differential Discrimination
- **Target 1 (Buggy)**: Fails with exit code 1, exhibiting native `TypeError: source.hasOwnProperty is not a function` at `/case/lib/utils.js:47:20`.
- **Target 2 (Reference Fix)**: Passes with exit code 0 and 0 assertion failures.
- **Target 3 (Alternate Fix)**: Passes with exit code 0 and 0 assertion failures.
- **Target 4 (Decoy Fix)**: Fails with exit code 1, exhibiting `AssertionError` verifying that dictionary properties were dropped by the decoy fix.
- Non-Regression: All 55 baseline tests pass on all four targets. The generated test itself is the sole detector of the decoy.
- Result: **PASS (Four-target discrimination verified)**.

### Gate 6: Container Isolation & Security
- All four executions conducted under `--network none`, `1000:1000`, read-only rootfs, `cap-drop ALL`, `no-new-privileges`, CPU <= 1, RAM <= 256 MiB, PIDs <= 64.
- 100% cleanup of containers and private named volumes verified.
- Result: **PASS (Security invariants upheld)**.

### Gate 7: Protected R1 Invariant
- `packages/judge/src/evaluate.ts`: Byte-for-byte identical (`git diff --exit-code`).
- `packages/contracts/src/index.ts`: Byte-for-byte identical (`git diff --exit-code`).
- Result: **PASS (Immutability verified)**.
