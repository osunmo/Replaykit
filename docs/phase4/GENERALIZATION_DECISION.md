# Phase 4 Generalization Decision: Blind AI Test Generation & Differential Evaluation on Fastify #4807

**Auditor / Architect:** Independent Research & Orchestration Agent  
**Date:** 2026-10-20  
**Target Incident:** Fastify Issue #4807 / PR #4826 (`TypeError: Cannot read properties of undefined (reading 'config')`)  
**Verdict:** **PASS / PROMOTED**  

---

## 1. Executive Summary & Decision Statement

ReplayKit has successfully generalized beyond utility libraries (`ljharb/qs`) to high-throughput HTTP backend framework runtime error handling (`fastify/fastify`):
1. **Config-Driven Architecture:** Decoupled from hardcoded `qs33-adapter.ts` through a configuration-driven reusable adapter interface (`packages/runtime/src/adapters/generic-adapter.ts`), supporting arbitrary repositories, command allowlisting, multi-stage artifact streaming, and automated framework presets.
2. **Authentic Incident Selection:** Pinned authentic upstream Fastify buggy base commit `61b86760019c85afbef6cc0f175c75870381ed04` and reference fix commit `c2b89732d583a0e0d8e0a666b2eb9b62610edf34`.
3. **Rigorous Blinding & Negative Control:** 282 sanitized workspace files audited with zero leak tokens detected. Negative control under ambiguous behavioral contract returned deterministic `INSUFFICIENT_ORACLE` without guessing assertions.
4. **Real AI Synthesis:** Local Ollama model `qwen2.5-coder:3b` synthesized a novel standalone regression test (`test/repro.test.js`, SHA-256: `2ef58646bf3f84f3ade7889199c744128c209ef9c33b2d1b6461c28918c6b998`) in 60.8s.
5. **Differential Container Evaluation:** Live four-target evaluation under `--network none`, non-root user `1000:1000`, read-only rootfs, and 256 MiB RAM:
   - **Buggy Base:** Exit code 1, reproduced native `TypeError: Cannot read properties of undefined (reading 'config')` at `/case/lib/request.js:204:55`.
   - **Reference Fix:** Exit code 0, all assertions passed (`req.routeConfig === undefined`).
   - **Alternate Fix:** Exit code 0, all assertions passed (`req.routeConfig === undefined`).
   - **Decoy Fix:** Exit code 1, rejected with `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: {} !== undefined`.
   - **Non-Regression Baseline:** `test/baseline-sanity.js` passed with exit code 0 across all 4 targets.
6. **Protected Contracts Invariant:** Protected R1 benchmark contracts (`packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts`) verified 100% byte-for-byte untouched (`git diff --exit-code`). Historical Phase 2 and Phase 3 runs preserved untouched.

---

## 2. Reusable Architecture & Decoupling

Phase 4 eliminated repository-specific assumptions from ReplayKit:
- **`packages/runtime/src/adapters/generic-adapter.ts`**:
  - `GenericAdapterConfigSchema`: Strict Zod validation covering `repository`, `baseCommit`, `image`, `testRunner`, `testCommand`, `suiteCommand`, `sourceFiles`, `patchAllowlist`, `failToPass`, `passToPass`, `expectedFailure`, `patchHashes`, and `securityPolicy`.
  - `validateCommandArguments`: Command security policy enforcing executable allowlist (`node`, `npm`, `npx`, `pnpm`, `yarn`, `mocha`, `vitest`, `tap`, `lab`) and rejecting shell meta-characters and injection vectors.
  - `stageGenericPayload`: Generic payload staging engine that injects synthesized tests, applies candidate patches without shell hooks, writes container supervisor runners, and computes cryptographic source inventories.
  - `normalizeGenericTestOutput`: Universal output normalizer supporting TAP output, standard Node assertions, uncaught exceptions, and clean passes.
  - `createGenericManifest` & `buildGenericExecutionRecord`: Full compatibility with ReplayKit's `external-official-suite-v1` contract schema.
  - `createFastifyPreset`: Turnkey preset for Fastify HTTP framework lifecycle testing.
- **`packages/runtime/src/patch-applier.ts`**:
  - Generalized from hardcoded `QS33_SOURCE_FILES` to configurable `sourceFiles` and `allowlist`, ensuring unified diffs can safely patch arbitrary repository source trees without shell execution.

---

## 3. Incident Selection & Blinding Audit

| Property | Value / Verification |
| :--- | :--- |
| **Target Repository** | `https://github.com/fastify/fastify.git` |
| **Defect Domain** | HTTP Request Lifecycle & Error Handling (`frameworkErrors` route context access) |
| **Buggy Base Commit** | `61b86760019c85afbef6cc0f175c75870381ed04` |
| **Upstream Fix Commit** | `c2b89732d583a0e0d8e0a666b2eb9b62610edf34` (PR #4826) |
| **Staged Workspace** | `work/phase4/sanitized-buggy-workspace` (282 files) |
| **Blinding Audit Result** | **PASS** — 0 leak findings across 282 files (`work/phase4/blinding-audit.json`) |
| **Withheld Information** | PR #4826 diffs, upstream test additions, git commit messages, author handles, patch digests |

---

## 4. Blind AI Test Synthesis Record

- **Model:** `qwen2.5-coder:3b` via Ollama local API (`http://127.0.0.1:11434`)
- **Temperature:** `0.2`
- **Synthesis Duration:** `60,810 ms`
- **Prompt Token Usage:** 461 prompt tokens, 143 completion tokens (604 total tokens)
- **Negative Control Status:** `INSUFFICIENT_ORACLE` (`control-runs/insufficient-oracle-result.json`)
- **Synthesized Test Source (`work/phase4/generator-runs/repro.test.js`):**
```javascript
const Fastify = require('fastify');
const assert = require('node:assert');

const fastify = Fastify({
  frameworkErrors: function (err, req, res) {
    assert.strictEqual(req.routeConfig, undefined);
    res.send('error handled');
  }
});

fastify.get('/test/:id', (req, res) => {
  res.send('ok');
});

fastify.inject({
  method: 'GET',
  url: '/test/%world'
}).then(response => {
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.body, 'error handled');
}).catch(err => {
  console.error('Test failed:', err);
});
```
- **Synthesized Test SHA-256:** `2ef58646bf3f84f3ade7889199c744128c209ef9c33b2d1b6461c28918c6b998`
- **AST Safety & Policy Checks:** Syntax valid, no banned APIs, unauthorized modules blocked, non-empty assertions.

---

## 5. Four-Target Differential Container Evaluation Record

All targets executed inside fresh Docker containers under pinned image `node:22-bookworm-slim@sha256:c3de60bf...`:

| Target Role | Patch Applied | Patch SHA-256 | Test Exit | Suite Exit | Outcome | Details / Failure Signature |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **Buggy Base** | *None* | `00000000...` | **1** | **0** | **PASS (Expected Failure)** | Native `TypeError: Cannot read properties of undefined (reading 'config')` at `/case/lib/request.js:204:55`. Baseline suite passed (`baseline routing passed`). Duration: 3,106ms. |
| **Reference Fix** | `reference.patch` (`?.config`) | `da9cbf56...` | **0** | **0** | **PASS** | Test cleanly passed with 0 errors. `req.routeConfig === undefined`. Response status 200. Baseline suite passed. Duration: 2,196ms. |
| **Alternate Fix** | `alternate.patch` (ternary guard) | `e8cb28e3...` | **0** | **0** | **PASS** | Test cleanly passed with 0 errors. Syntactically independent ternary check. Baseline suite passed. Duration: 1,623ms. |
| **Decoy Fix** | `decoy.patch` (fallback to `{}`) | `f9a1a4ce...` | **1** | **0** | **REJECTED (Correct Rejection)** | Rejected by generated test: `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: {} !== undefined` at `/case/test/repro.test.js:6:12`. Baseline suite passed. Duration: 1,879ms. |

### Security & Isolation Verification
- **Network Mode:** `--network none` enforced across 100% of target executions.
- **Security Options:** Non-root UID `1000:1000`, `--read-only` rootfs, `--cap-drop ALL`, `no-new-privileges`.
- **Resource Limits:** `cpus: 1`, `memory: 256m`, `pids-limit: 64`.
- **Deterministic Cleanup:** Containers and volumes deleted immediately post-execution (`cleaned: true`).

---

## 6. Cryptographic Artifact Registry & Immutability

1. **Artifact Registry (`work/phase4/artifact-sha256.json`):**
   - 2,079 artifacts registered and hashed (SHA-256) across incident context, generator runs, control runs, evaluator runs, sanitized workspace, and benchmark metrics (`work/phase4/benchmark-metrics.json`).
2. **Benchmark Metrics Record:**
   - Documented in `docs/phase4/BENCHMARK_METRICS.md` and `work/phase4/benchmark-metrics.json` covering all 14 specified benchmark metrics across Phase 3 and Phase 4.
3. **Protected Files Immutability:**
   - `packages/judge/src/evaluate.ts`: Unmodified (`git diff --exit-code` exits 0).
   - `packages/contracts/src/index.ts`: Unmodified (`git diff --exit-code` exits 0).
4. **Historical Run Isolation:**
   - `work/phase2/gate-b-runs/`: Untouched.
   - `work/phase2/gate-c-runs/`: Untouched.
   - `work/phase3/`: Untouched (all 57 historical hashes preserved).

---

## 7. Epistemic Disclosures & Reviewer Guidance

- **Training Familiarity Disclosure:** Fastify is a major Node.js open-source framework, and PR #4826 was merged in May 2023. Pre-trained LLMs (including `qwen2.5-coder:3b`) may have encountered discussions or issue descriptions of Fastify #4807 in their training data. However, the exact test code produced was synthesized dynamically from the incident contract prompt and differs in structure from upstream repository tests.
- **Decoy Sensitivity:** The decoy fix returned `{}` for `routeConfig`. The synthesized test specifically asserted `assert.strictEqual(req.routeConfig, undefined)`, which successfully caught and rejected the semantic decoy.
- **Statistical Generalization Boundary:** $N = 2$ represents an empirical feasibility trial, not a statistically valid generalization claim for arbitrary uncurated repositories.
- **Next Steps:** Benchmark multi-turn refinement on multi-file backend bugs; extend adapter library to Python (`fastapi`, `pytest`) and Go (`gin`, `testing`).

---

## 8. Operator Evidence Inspection & Verification Command

To verify protected files, recompute all 2,136 artifact digests across Phase 3 and Phase 4, run targeted generic adapter unit tests, and inspect the Phase 4 evaluation verdict in a single Windows PowerShell command:

```powershell
& {
  Write-Host "=== 1. Checking Protected Files Immutability ===" -ForegroundColor Cyan
  git diff --exit-code packages/judge/src/evaluate.ts packages/contracts/src/index.ts
  if ($LASTEXITCODE -ne 0) { throw "Protected files have been modified!" }

  Write-Host "`n=== 2. Verifying Phase 3 Preserved Hashes (57 files) ===" -ForegroundColor Cyan
  node -e "const fs=require('fs'),c=require('crypto'),p=require('path'),d=JSON.parse(fs.readFileSync('work/phase3/artifact-sha256.json','utf8'));let ok=0,err=0;for(const[f,h]of Object.entries(d)){try{if(c.createHash('sha256').update(fs.readFileSync(p.join('work/phase3',f))).digest('hex')===h)ok++;else err++;}catch{err++;}}console.log('Phase 3: ' + ok + '/57 verified, ' + err + ' errors');if(err>0)process.exit(1);"

  Write-Host "`n=== 3. Verifying Phase 4 Hashes (2,079 files) ===" -ForegroundColor Cyan
  node -e "const fs=require('fs'),c=require('crypto'),p=require('path'),d=JSON.parse(fs.readFileSync('work/phase4/artifact-sha256.json','utf8'));let ok=0,err=0;for(const[f,h]of Object.entries(d)){try{if(c.createHash('sha256').update(fs.readFileSync(p.join('work/phase4',f))).digest('hex')===h)ok++;else err++;}catch{err++;}}console.log('Phase 4: ' + ok + '/2079 verified, ' + err + ' errors');if(err>0)process.exit(1);"

  Write-Host "`n=== 4. Running Targeted Generic Adapter & Synthesis Unit Tests ===" -ForegroundColor Cyan
  pnpm vitest run packages/runtime/src/adapters/generic-adapter.test.ts packages/runtime/src/blind-synthesis.test.ts

  Write-Host "`n=== 5. Running Typecheck ===" -ForegroundColor Cyan
  pnpm typecheck

  Write-Host "`n=== 6. Inspecting Phase 4 Evaluation Verdict ===" -ForegroundColor Cyan
  Get-Content work/phase4/evaluator-runs/evaluation-verdict.json
}
```
