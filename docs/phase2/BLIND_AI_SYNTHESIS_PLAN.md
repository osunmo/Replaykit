# Blind AI Regression-Test Synthesis — Next Product Milestone & Experiment Plan

**Document Version:** 1.0.0  
**Date:** 2026-10-20  
**Status:** PROPOSED & FROZEN FOR POST-GATE-C4 MILESTONE  
**Target:** Authentic `ljharb/qs` Issue #33 Blind Reproduction & Test Synthesis  

---

## 1. Executive Summary & Objective

With Gate C4 passing, external official upstream test benchmark execution is frozen. The next product milestone for ReplayKit is **not** another pre-existing official suite execution. Rather, it is demonstrating that ReplayKit can **synthesize a genuinely novel, executable regression test** solely from production incident telemetry and behavioral contracts, without access to upstream regression tests, historical fixes, or ground-truth patches.

This experiment proves:
1. **Oracle Derivation**: ReplayKit can derive an authentic expected-behavior assertion from behavioral specifications and incident inputs without hallucinating or blindly echoing error states.
2. **Four-Target Differential Discrimination**: The generated test independently:
   - Fails on the buggy base revision with a meaningful failure.
   - Passes on the authentic reference fix.
   - Passes on an independently synthesized alternate correct fix.
   - **Rejects the subtle decoy fix** on semantic correctness grounds (proving it tests deep object preservation rather than merely shallow exception absence).
3. **Novelty & Non-Duplication**: The test is structurally distinct from the withheld upstream test 40 and avoids copying historical assertions.
4. **Epistemic Honesty (`INSUFFICIENT_ORACLE`)**: If the permitted incident context cannot support an unambiguous behavioral contract, the generator must explicitly yield `INSUFFICIENT_ORACLE` rather than fabricate assertions.

---

## 2. Permitted Generator Input vs. Strictly Withheld Context

### 2.1 Permitted Inputs to Generator Workspace

The generator agent receives a clean, isolated workspace containing **only**:

1. **Buggy Repository Tree (Filtered)**:
   - Commit `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` (`source-buggy`).
   - The test file `test/parse.js` is included, **with historical regression test #40 completely scrubbed** (see Section 2.2).
   - Upstream documentation (`README.md`, `CHANGELOG.md` up to 2.2.1).
2. **Production-Style Incident Telemetry**:
   - **Error Type**: `TypeError: source.hasOwnProperty is not a function`.
   - **Stack Trace**:
     ```
     TypeError: source.hasOwnProperty is not a function
         at exports.clone (/case/lib/utils.js:47:20)
         at exports.clone (/case/lib/utils.js:48:31)
         at module.exports [as parse] (/case/lib/parse.js:141:89)
     ```
   - **Triggering Payload**: An object containing a null-prototype dictionary:
     ```javascript
     // Incident context: Object.create(null) passed into Qs.parse
     var obj = Object.create(null);
     obj.b = 'c';
     var input = { a: obj };
     ```
3. **Explicitly Permitted Behavioral Contract**:
   - Upstream API Specification: `Qs.parse(object)` must recursively clone and parse nested object keys into a merged query object preserving all key-value entries regardless of prototype inheritance chain. Objects created via `Object.create(null)` represent plain key-value maps without prototype methods and must retain their properties during merging and cloning.
4. **Runtime Specification**:
   - Node 22 environment with Mocha/Lab syntax (`it(...)`, `expect(...)`).

### 2.2 Strictly Withheld Context & Anti-Leakage Sandbox

To guarantee true blind synthesis, the following are **completely scrubbed** from the generator workspace:

| Withheld Asset | Description | Scrubbing & Anti-Leakage Mechanism |
| -------------- | ----------- | ---------------------------------- |
| Upstream Test #40 | `test('parse parses plain objects correctly', ...)` in `test/parse.js` | Removed from on-disk test file in generator workspace; line numbers and AST adjusted so no traces or comments remain. |
| Upstream Fix Commit | `6a97ad1d71d8a9069f5d6002cab3130752519ccb` | No git history or remote refs referencing this commit exist in generator workspace. Bare repository refs detached at buggy HEAD. |
| Reference Patch | `reference.patch` | Omitted from generator filesystem; forbidden in prompt and system context. |
| Alternate Patch | `alternate.patch` | Omitted from generator filesystem. |
| Decoy Patch | `decoy.patch` | Omitted from generator filesystem. |
| Historical Probes | `gate-b-probe.cjs` | Omitted from generator filesystem; no probe scripts present. |
| Gate Decisions & Logs | `docs/phase2/GATE_*` and `work/phase2/*` | Not mounted or readable within generator sandbox. |

#### Air-Gapping & Environment Boundaries:
- Generator runs in an ephemeral container with `--network none` and an empty tmpfs for scratch.
- File system read access is locked to `/workspace/clean-source` containing only the scrubbed buggy source and incident JSON.
- Tool inspection is restricted: no access to parent repo directories, git logs outside local detached HEAD, or persistent cache.

---

## 3. Generator Task & Oracle Derivation Rules

The generator agent must output a single standalone test file (`repro.test.js` or `repro.test.ts`).

### 3.1 Synthesis Requirements
1. **Executable Test**: Must execute under the project's test framework (`Lab` or `Mocha`/`Chai`).
2. **Oracle Identification**: Must identify an assertion derived from the permitted behavioral contract (e.g. `expect(result.a.b).to.equal('c')` or `expect(result).to.deep.equal({ a: { b: 'c' } })`).
3. **Failure on Buggy**: The test must trigger the unhandled `TypeError: source.hasOwnProperty is not a function` at `/case/lib/utils.js:47:20` when executed against the buggy base commit.
4. **Pass on Clean Fix**: The test must pass cleanly without warning or error when executed against the reference fix and alternate fix.
5. **Decoy Rejection**: Crucially, if executed against the decoy fix (which swallows the error by doing `if (source.hasOwnProperty && ...)` and producing `{ a: {} }`), the test **must fail on its assertion** (e.g., asserting that `result.a.b === 'c'` or deep equality), rejecting the decoy.
6. **No Duplication of Upstream Test**: The test must NOT copy the exact lexical structure, variable names, or title of withheld test 40.
7. **Conservative Fallback (`INSUFFICIENT_ORACLE`)**: If the incident context or documentation is ambiguous as to what property values should result, the generator must emit:
   ```json
   { "status": "INSUFFICIENT_ORACLE", "reason": "Expected values cannot be derived without ambiguous assumptions" }
   ```
   rather than guessing or asserting arbitrary output.

---

## 4. Independent Four-Target Evaluation Matrix

Once the generator produces `repro.test.js`, ReplayKit's independent evaluation supervisor (completely separate from the generator) mounts `repro.test.js` into four isolated testbeds:

```
                  +-----------------------------------+
                  |   AI-Generated repro.test.js     |
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

### 4.1 Evaluation Criteria for Trial Success:
1. **Target 1 (Buggy)**: Test must FAIL with exit code 1, exhibiting native `TypeError` matching the incident stack frame.
2. **Target 2 (Reference Fix)**: Test must PASS with exit code 0 and 0 assertion errors.
3. **Target 3 (Alternate Fix)**: Test must PASS with exit code 0 and 0 assertion errors.
4. **Target 4 (Decoy Fix)**: Test must FAIL with exit code 1 with an `AssertionError` verifying that property `b: 'c'` was NOT dropped.
5. **Non-Regression Check**: The generated test file, when added to the existing 55 passing official tests, must not cause any of the 55 unaffected tests to fail.
6. **Lexical Independence Check**: Levenshtein edit distance and AST similarity check against withheld test 40 to ensure independence.

---

## 5. Experiment Outputs & Telemetry

Every trial records a structured JSON experiment manifest:
- `trialId`: Unique UUID.
- `model`: Model name and sampling parameters (temperature, top_p, seed).
- `inputTelemetry`: Exact incident payload provided to generator.
- `withheldVerification`: Cryptographic confirmation that withheld assets were absent from generator environment.
- `generatedCode`: Raw test file generated by model.
- `oracleDerivationNotes`: Rationale provided by model for chosen assertions.
- `targetExecutions`: Array of 4 execution results (status, exitCode, stdout, stderr, stackFrame).
- `decoyDetected`: Boolean indicating whether Target 4 failed on assertion error.
- `similarityToUpstream`: AST and textual similarity metrics compared to withheld test.
- `verdict`: `SUCCESS` | `DECOY_MISSED` | `FIX_FAILED` | `FALSE_POSITIVE` | `INSUFFICIENT_ORACLE`.
- `timings`: Wall-clock generation time and execution duration.

---

## 6. Execution Phasing & Gates

1. **Phase 1: Workspace Sanitizer & Blinding Fixture**:
   - Construct automated tool to generate scrubbed buggy workspace (`work/phase3/sanitized-buggy-workspace`).
   - Audit sanitized workspace with automated scanner to ensure 0 bytes of withheld test 40 or patches exist.
2. **Phase 2: Generator Prompt & Contract Binding**:
   - Finalize incident context schema and behavioral specification prompt.
3. **Phase 3: Supervisor Multi-Target Dispatcher**:
   - Extend `external-runner.ts` to execute a custom candidate test file against the 4 pre-staged target trees without changing R1 contracts.
4. **Phase 4: Single Blind Trial Execution**:
   - Run trial under strict isolation and record results.
