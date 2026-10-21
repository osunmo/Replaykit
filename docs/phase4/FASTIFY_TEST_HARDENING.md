# ReplayKit Phase 4: Fastify Regression-Test Hardening & Correctness Verification

**Author:** ReplayKit Lead Engineering Agent & Independent QA Agent  
**Date:** 2026-10-20  
**Target Incident:** Fastify Issue #4807 / PR #4826  
**Artifact Classification:** **HARDENED REGRESSION TEST** (Manually Engineered Improvement)  
**Status:** **PASS / VERIFIED**  

---

## 1. Executive Summary & Problem Analysis

In Phase 4, ReplayKit successfully synthesized a novel regression test via local Ollama (`qwen2.5-coder:3b`) targeting Fastify Issue #4807. While the generated test correctly caught the historical bug and rejected the semantic decoy, an audit revealed critical testing weaknesses that could allow false-positive passes or non-deterministic execution in production CI environments.

### The Six Identified Weaknesses of the Original Test

1. **Silent Promise Rejection Swallowing:**
   ```javascript
   fastify.inject({ method: 'GET', url: '/test/%world' })
     .then(response => { ... })
     .catch(err => { console.error('Test failed:', err); });
   ```
   In standalone Node.js test scripts, catching a rejected promise and logging to stderr without calling `process.exit(non-zero)` or re-throwing marks the rejection as handled. In many runtime environments, the process would terminate with exit code `0`, reporting a false positive even when assertions fail.

2. **Unsafe Assertions Inside Framework Error Handlers:**
   Placing `assert.strictEqual(req.routeConfig, undefined)` directly inside `frameworkErrors: function(err, req, res)` causes `AssertionError` to be thrown during Fastify's internal error-handling dispatch. This risks triggering unhandled recursive error routines, leaving the `fastify.inject` HTTP request hanging indefinitely or aborting without sending a response.

3. **Missing Execution Proof for Framework Error Path:**
   The test did not assert that `frameworkErrors` was invoked at all. If routing logic changed such that `/test/%world` returned a 404 or standard 400 without calling `frameworkErrors`, the assertion would simply never run, and the test would silently succeed.

4. **Missing Verification of Route Handler Bypass:**
   The test did not assert that the registered route handler (`fastify.get('/test/:id', ...)`) was bypassed. A defective router could execute both the route handler and the error hook without detection.

5. **Lack of Assertion Counter / Proof of Execution:**
   Process success alone did not prove that all assertions were reached and executed.

6. **Missing Bounded Timeouts and Teardown Cleanup:**
   If `fastify.inject` hung due to an internal error pipeline deadlock, the test would hang indefinitely. Furthermore, `fastify.close()` was never invoked, leaking event loop handles and sockets.

---

## 2. Hardened Regression Test Architecture

The strengthened regression test was implemented at [`packages/runtime/src/fixtures/fastify4807/hardened-repro.test.js`](file:///C:/Users/sunmo/Documents/Codex/2026-10-16/files-mentioned-by-the-user-agents/outputs/replaykit/packages/runtime/src/fixtures/fastify4807/hardened-repro.test.js) and versioned into [`work/phase4/hardened-runs/hardened-repro.test.js`](file:///C:/Users/sunmo/Documents/Codex/2026-10-16/files-mentioned-by-the-user-agents/outputs/replaykit/work/phase4/hardened-runs/hardened-repro.test.js).

**SHA-256:** `24a9275acba30f053fb175ee873a6772204c24bcc38daf0ccd50aba6c537208d`

### Source Code

```javascript
'use strict';

/**
 * HARDENED REGRESSION TEST for Fastify Issue #4807 / PR #4826
 *
 * Verifies that when a malformed URI triggers the frameworkErrors handler
 * before route context is bound, accessing req.routeConfig is safe and
 * returns strictly undefined.
 *
 * Distinguishes:
 * - Buggy base: throws TypeError: Cannot read properties of undefined (reading 'config')
 * - Reference fix: returns undefined
 * - Alternate fix: returns undefined
 * - Semantic decoy: returns {} (rejected by assertion)
 */

const Fastify = require('fastify');
const assert = require('node:assert');

async function main() {
  let frameworkErrorsInvocations = 0;
  let routeHandlerInvocations = 0;
  let routeConfigThrew = false;
  let routeConfigError = null;
  let observedRouteConfig = null;
  let observedErrorCode = null;

  const fastify = Fastify({
    frameworkErrors: function (err, req, res) {
      frameworkErrorsInvocations++;
      observedErrorCode = err && err.code ? err.code : null;

      // Safely observe req.routeConfig without throwing inside frameworkErrors
      try {
        observedRouteConfig = req.routeConfig;
      } catch (e) {
        routeConfigThrew = true;
        routeConfigError = e;
      }

      res.send('error handled');
    }
  });

  let timeoutTimer;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutTimer = setTimeout(() => {
      reject(new Error('Test timed out after 5000ms: Fastify injection did not settle'));
    }, 5000);
    if (typeof timeoutTimer.unref === 'function') {
      timeoutTimer.unref();
    }
  });

  try {
    fastify.get('/test/:id', (req, res) => {
      routeHandlerInvocations++;
      res.send('ok');
    });

    const response = await Promise.race([
      fastify.inject({
        method: 'GET',
        url: '/test/%world'
      }),
      timeoutPromise
    ]);

    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }

    // Invariant 1: Framework error handler was invoked exactly once
    assert.strictEqual(
      frameworkErrorsInvocations,
      1,
      `Expected frameworkErrors to be called exactly once, but got ${frameworkErrorsInvocations}`
    );

    // Invariant 2: Normal route handler was completely bypassed
    assert.strictEqual(
      routeHandlerInvocations,
      0,
      `Expected normal route handler to be bypassed, but it executed ${routeHandlerInvocations} times`
    );

    // Invariant 3: Framework error code matches historical Fastify behavior
    assert.strictEqual(
      observedErrorCode,
      'FST_ERR_BAD_URL',
      `Expected framework error code to be 'FST_ERR_BAD_URL', but got '${observedErrorCode}'`
    );

    // Invariant 4: Accessing req.routeConfig must not throw
    // On authentic buggy code, this re-throws the native TypeError outside the handler
    if (routeConfigThrew) {
      throw routeConfigError;
    }

    // Invariant 5: Returned value must be strictly undefined (rejects decoy returning {})
    assert.strictEqual(
      observedRouteConfig,
      undefined,
      `Expected req.routeConfig to be strictly undefined, but got: ${JSON.stringify(observedRouteConfig)}`
    );

    // Invariant 6: Response status and body match the handled framework error response
    assert.strictEqual(response.statusCode, 200, `Expected status 200, got ${response.statusCode}`);
    assert.strictEqual(response.body, 'error handled', `Expected body 'error handled', got '${response.body}'`);

    console.log('HARDENED_TEST_PASSED: All Fastify #4807 regression invariants verified successfully.');
  } finally {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }
    await fastify.close();
  }
}

main().catch((err) => {
  console.error('HARDENED_TEST_FAILED:');
  console.error(err);
  process.exit(1);
});
```

---

## 3. Four-Target Live Container Differential Validation Results

The hardened regression test was evaluated across all four targets in fresh Docker containers under `--network none`, non-root user `1000:1000`, `--read-only` rootfs, `--cap-drop ALL`, `no-new-privileges`, and 256 MiB RAM:

| Target Role | Candidate Patch | Test Exit | Suite Exit | Evaluation Outcome | Failure Signature / Notes |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Buggy Base** | *None* | **1** | **0** | **PASS (Expected Failure)** | Re-throws native `TypeError: Cannot read properties of undefined (reading 'config')` at `/case/lib/request.js:204:55`. Baseline suite passed. Duration: 3,232ms. |
| **Reference Fix** | `reference.patch` (`?.config`) | **0** | **0** | **PASS** | Clean exit 0; `HARDENED_TEST_PASSED`; `req.routeConfig === undefined`; baseline suite passed. Duration: 2,624ms. |
| **Alternate Fix** | `alternate.patch` (ternary guard) | **0** | **0** | **PASS** | Clean exit 0; `HARDENED_TEST_PASSED`; syntactically independent repair passed; baseline suite passed. Duration: 1,964ms. |
| **Decoy Fix** | `decoy.patch` (`{}` fallback) | **1** | **0** | **REJECTED (Correct Rejection)** | Rejected by hardened test: `AssertionError [ERR_ASSERTION]: Expected req.routeConfig to be strictly undefined, but got: {}`. Baseline suite passed. Duration: 1,183ms. |

### Invariant Checks Verified Across Differential Targets

1. **Framework Error Handler Execution:** Invocations verified `=== 1`.
2. **Route Handler Bypass:** Invocations verified `=== 0`.
3. **Historical Error Code:** Verified `err.code === 'FST_ERR_BAD_URL'`.
4. **Exception Safety Outside Handler:** Getter exception caught inside `frameworkErrors` so Fastify finishes the request; re-thrown in `main()` to fail the test cleanly without hanging.
5. **Strictly Undefined Getter Value:** Decoy returning `{}` rejected by strict equality check (`{} !== undefined`).
6. **Guaranteed Teardown:** `await fastify.close()` executed in `finally`.
7. **Timeout Protection:** 5000ms bounded `Promise.race` race with unref timer.
8. **Deterministic Failure Exit:** `.catch(err => { process.exit(1); })` ensures exit code 1 on any failure.
9. **Core Routing Baseline:** Non-regression test (`test/baseline-sanity.js`) exited 0 across all 4 targets.

Verdict recorded as `SUCCESS` in [`work/phase4/hardened-runs/evaluation-verdict.json`](file:///C:/Users/sunmo/Documents/Codex/2026-10-16/files-mentioned-by-the-user-agents/outputs/replaykit/work/phase4/hardened-runs/evaluation-verdict.json).

---

## 4. Enhanced AI Test Validator & Safety Protections

To prevent future AI-generated tests from introducing these false-positive failure modes, ReplayKit's validation pipeline was hardened across both static AST analysis and runtime output normalization:

### 1. Static AST Validator (`packages/runtime/src/ai-generator.ts`)
- **Swallowed Promise Rejections:** Inspects `.catch(...)` calls. Rejects callbacks that only invoke `console.log` / `console.error` (or are empty) without `throw`, `assert`, `expect`, `t.fail`, `process.exit(1)`, or `process.exitCode = 1`.
- **Missing Assertions:** Scans the AST for recognized assertion identifiers (`assert`, `expect`, `t.equal`, `t.ok`, `should`). Rejects tests with 0 assertions.
- **Swallowed Assertions in `try/catch`:** Detects `try` blocks containing assertion calls where the matching `catch` block swallows the error without re-throwing or verifying failure.
- **Dangling Async Operations:** Detects floating expression statements calling asynchronous methods (e.g. `.inject()`, `.request()`, `fetch()`) that are neither awaited, returned, nor chained with `.then()`.
- **Banned `process.exit(0)`:** Detects and bans explicit calls to `process.exit(0)` which could force a false-positive pass, while allowing `process.exit(1)` in failure handlers.

### 2. Runtime Output Normalizer (`packages/runtime/src/adapters/generic-adapter.ts`)
- **Swallowed Error Detection:** In `normalizeGenericTestOutput`, even if a process terminates with exit code `0`, any presence of `AssertionError`, `Test failed:`, or `HARDENED_TEST_FAILED:` in stdout/stderr immediately classifies the test as `failed` with type `AssertionError` or `SwallowedAssertionError`.
- **Unhandled Rejection Detection:** Detects `UnhandledPromiseRejectionWarning` or `ERR_UNHANDLED_REJECTION` and classifies as `failed` with `UnhandledRejectionError`.
- **Timeout Normalization:** Detects `timed out` or `timeout` and classifies as `failed` with `TimeoutError`.

### 3. Automated Unit Test Coverage
- [`packages/runtime/src/adapters/generic-adapter.test.ts`](file:///C:/Users/sunmo/Documents/Codex/2026-10-16/files-mentioned-by-the-user-agents/outputs/replaykit/packages/runtime/src/adapters/generic-adapter.test.ts): 18/18 tests passing.
- [`packages/runtime/src/blind-synthesis.test.ts`](file:///C:/Users/sunmo/Documents/Codex/2026-10-16/files-mentioned-by-the-user-agents/outputs/replaykit/packages/runtime/src/blind-synthesis.test.ts): 18/18 tests passing.
- **Total:** 36/36 tests passing (100%).

---

## 5. Preservation of Historical Evidence

In accordance with Task 5, all historical artifacts from prior phases were preserved:

- `work/phase4/generator-runs/repro.test.js`: **Untouched** (SHA-256 `2ef58646...`).
- `work/phase4/artifact-sha256.json`: **Untouched** (2,079/2,079 verified).
- `work/phase4/evaluator-runs/`: **Untouched**.
- `work/phase2/` and `work/phase3/`: **Untouched** (57/57 verified).
- `packages/judge/src/evaluate.ts`: **Untouched** (`git diff --exit-code` exited 0).
- `packages/contracts/src/index.ts`: **Untouched** (`git diff --exit-code` exited 0).

All hardened run artifacts are housed independently in [`work/phase4/hardened-runs/`](file:///C:/Users/sunmo/Documents/Codex/2026-10-16/files-mentioned-by-the-user-agents/outputs/replaykit/work/phase4/hardened-runs/) with their own cryptographic manifest [`work/phase4/hardened-runs/artifact-sha256.json`](file:///C:/Users/sunmo/Documents/Codex/2026-10-16/files-mentioned-by-the-user-agents/outputs/replaykit/work/phase4/hardened-runs/artifact-sha256.json) (31 artifacts).

---

## 6. Single Windows PowerShell Verification Procedure

Run the following command from the repository root (`C:\Users\sunmo\Documents\Codex\2026-10-16\files-mentioned-by-the-user-agents\outputs\replaykit`) to verify protected contracts, all artifact digests across historical and hardened runs, the 36 unit tests, workspace typecheck, and the hardened evaluation verdict:

```powershell
& {
  Write-Host "=== 1. Checking Protected Files Immutability ===" -ForegroundColor Cyan
  git diff --exit-code packages/judge/src/evaluate.ts packages/contracts/src/index.ts
  if ($LASTEXITCODE -ne 0) { throw "Protected files modified!" }

  Write-Host "`n=== 2. Verifying Preserved Historical Phase 4 Hashes (2,079 files) ===" -ForegroundColor Cyan
  node -e "const fs=require('fs'),c=require('crypto'),p=require('path'),d=JSON.parse(fs.readFileSync('work/phase4/artifact-sha256.json','utf8'));let ok=0,err=0;for(const[f,h]of Object.entries(d)){try{if(c.createHash('sha256').update(fs.readFileSync(p.join('work/phase4',f))).digest('hex')===h)ok++;else err++;}catch{err++;}}console.log('Phase 4 Historical: ' + ok + '/2079 verified, ' + err + ' errors');if(err>0)process.exit(1);"

  Write-Host "`n=== 3. Verifying Hardened Runs Hashes (31 files) ===" -ForegroundColor Cyan
  node -e "const fs=require('fs'),c=require('crypto'),p=require('path'),d=JSON.parse(fs.readFileSync('work/phase4/hardened-runs/artifact-sha256.json','utf8'));let ok=0,err=0;for(const[f,h]of Object.entries(d)){try{if(c.createHash('sha256').update(fs.readFileSync(p.join('work/phase4/hardened-runs',f))).digest('hex')===h)ok++;else err++;}catch{err++;}}console.log('Hardened Runs: ' + ok + '/31 verified, ' + err + ' errors');if(err>0)process.exit(1);"

  Write-Host "`n=== 4. Running Targeted Unit Tests (Generic Adapter & AI Validator) ===" -ForegroundColor Cyan
  pnpm vitest run packages/runtime/src/adapters/generic-adapter.test.ts packages/runtime/src/blind-synthesis.test.ts

  Write-Host "`n=== 5. Running Typecheck ===" -ForegroundColor Cyan
  pnpm typecheck

  Write-Host "`n=== 6. Inspecting Hardened Evaluation Verdict ===" -ForegroundColor Cyan
  Get-Content work/phase4/hardened-runs/evaluation-verdict.json
}
```
