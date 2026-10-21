# Gate C Evaluation Specification — External Manifest & Evaluator Binding

**Role:** Independent Evaluation Agent (Agent D)  
**Date:** 2026-10-19  
**Status:** ACTIVE / SPECIFIED  
**Target:** Validation criteria for `evaluateExternalEvidence()`  
**Reference Schema:** `packages/contracts/src/external.ts`  
**Reference Evaluator:** `packages/judge/src/external.ts`

---

## 1. External Manifest Definition for `qs #33`

The manifest adheres to `ExternalManifestSchema`:

```typescript
export const QS_33_MANIFEST: ExternalManifest = {
  contract: 'external-official-suite-v1',
  instanceId: 'qs__issue-33',
  baseCommit: '360e2b0b48548b9bfdb71f8c82a68c4f34ec0725',
  image: 'node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392',
  testFile: 'test/parse.js',
  testFileHash: 'be7137407c865b889674d1bb7a9a8317e8f605ff4ae189ef2a751feb0b9451a5',
  testPatchHash: 'a1b2c3d4e5f6...7890', // Hash of patch adding test 40
  candidateHash: '...',               // Hash of candidate test
  sourceFiles: [
    'index.js',
    'lib/parse.js',
    'lib/stringify.js',
    'lib/utils.js',
    'test/parse.js',
    'test/stringify.js',
    // ... all 17 tracked source files
  ],
  failToPass: [
    'parse parses plain objects correctly'
  ],
  passToPass: [
    // The other 55 Lab tests verified in Gate B
    'parse parses a simple string',
    // ...
  ],
  expectedFailure: {
    type: 'TypeError',
    topApplicationFrame: 'at exports.clone (/case/lib/utils.js:47:20)',
  },
  patchHashes: {
    buggy: '0000000000000000000000000000000000000000000000000000000000000000',
    reference: '6a97ad1d71d8a9069f5d6002cab3130752519ccb...',
    alternate: '...',
    decoy: '...',
  },
};
```

---

## 2. Matrix Validation Rules (10 / 3 / 3 / 1)

`evaluateExternalEvidence(manifest, candidateSource, matrix)` enforces the following gates:

| Variant | Runs Required | Expected Outcome | Failure Identity Check |
| :--- | :--- | :--- | :--- |
| **Buggy** | Exactly 10 | Exit 1, fails `failToPass`, passes `passToPass`, no unrelated fails | Must contain `TypeError` and `at exports.clone (/case/lib/utils.js:47:20)` |
| **Reference** | Exactly 3 | Exit 0, passes all 56 tests, `failure === null` | N/A |
| **Alternate** | Exactly 3 | Exit 0, passes all 56 tests, `failure === null` | N/A |
| **Decoy** | Exactly 1 | Exit 1, fails `failToPass`, passes `passToPass` | Symptom masking or incomplete fix fails invariant |

### Gate Checks Evaluated:
1. `buggyFails`: 10/10 fail deterministically on `failToPass`.
2. `sameFailureIdentity`: 10/10 exhibit native `TypeError` and frame `/case/lib/utils.js:47:20`.
3. `referenceFixPasses`: 3/3 pass all 56 tests.
4. `alternateFixPasses`: 3/3 pass all 56 tests.
5. `decoyFixStillFails`: 1/1 fails domain invariant.
6. `offlineExecution`: All 17 executions have `networkMode === 'none'`.
7. `isolatedExecution`: All 17 executions have UID 1000, readonly root, capDropAll, noNewPrivileges, <=1 CPU, <=256 MiB, <=64 PIDs.
8. `freshState`: All 17 run IDs distinct, fresh workspaces.
9. `reviewableTest`: Candidate source within size bounds and free from sleep/banned APIs.
10. `sameCandidate`: Consistent candidate hash across all executions.

---

## 3. Ground Truth Verification Strategy

- No simulation or mocked execution outputs: all 17 executions must be generated from real container runs conducted by the trusted supervisor.
- Normalized reports must faithfully match raw TAP plan and per-test lines.
- Evaluator must return `VERIFIED` only when all 10 checks succeed and 0 reason codes are returned.
