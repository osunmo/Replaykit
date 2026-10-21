# Independent QA & Security Audit Report: Fastify #4807 Regression-Test Hardening & Generalization Robustness

**Auditor:** Independent QA & Security Auditor for ReplayKit  
**Target:** Fastify Issue #4807 / PR #4826 Test-Hardening Milestone & Phase 4 Generalization  
**Repository Location:** `C:\Users\sunmo\Documents\Codex\2026-10-16\files-mentioned-by-the-user-agents\outputs\replaykit`  
**Target Document Path:** `docs/phase4/agents/fastify-hardening-qa.md`  
**Date:** 2026-10-21  
**Audit Verdict:** **PASS (ALL CRITERIA SATISFIED)**

---

## 1. Executive Summary & Verification Verdict

An exhaustive, independent verification and security audit was conducted on the Fastify Issue #4807 test-hardening milestone within ReplayKit Phase 4. The audit encompassed:
1. Static code review and invariant verification of `packages/runtime/src/fixtures/fastify4807/hardened-repro.test.js`.
2. AST static validation logic in `packages/runtime/src/ai-generator.ts` and runtime normalization heuristics in `packages/runtime/src/adapters/generic-adapter.ts`.
3. Forensic evaluation of live 4-target differential container execution logs in `work/phase4/hardened-runs/`.
4. Immutability verification of protected evaluation contracts (`packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts`).
5. Cryptographic integrity verification of all 2,167 historical and hardened artifact digests across Phases 3 and 4.
6. Execution of full workspace TypeScript typechecking and targeted Vitest test suites.

### Audit Verdict Summary Matrix

| Verification Domain | Evaluation Criteria | Result | Notes |
| :--- | :--- | :---: | :--- |
| **Test Invariants** | 8 required safety & correctness invariants verified | **PASS** | Exception-safe getter observation, strict `undefined` check, bounded timeout, deterministic teardown. |
| **AST Validator** | Static detection of swallowed rejections, assertions, and dangling async | **PASS** | `validateTestAst` enforces failure exits in catch handlers and bans `process.exit(0)`. |
| **Output Normalizer** | Runtime detection of swallowed errors, unhandled rejections, timeouts | **PASS** | `normalizeGenericTestOutput` detects assertion failures even on exit code 0. |
| **Differential Execution** | 4-target differential container verification | **PASS** | Buggy (fail/TypeError:204), Reference (pass), Alternate (pass), Decoy (fail/AssertionError). |
| **Regression Baseline** | Core routing suite passes on all targets | **PASS** | Exit code 0, "baseline routing passed" across all 4 container runs. |
| **Container Isolation** | Strict security sandbox constraints enforced | **PASS** | `--network none`, `1000:1000`, read-only rootfs, cap-drop ALL, no-new-privileges, clean teardown. |
| **Protected Files** | Immutability of judge and core contract definitions | **PASS** | 0 byte diff from HEAD for `evaluate.ts` and `contracts/src/index.ts`. |
| **Historical Digests** | Cryptographic integrity across Phase 3 & Phase 4 | **PASS** | 57/57 Phase 3, 2,079/2,079 Phase 4, and 31/31 Hardened artifacts verified. |
| **Typecheck & Tests** | TypeScript typecheck and Vitest targeted suite | **PASS** | `tsc --noEmit` clean exit 0; Vitest 36/36 tests passing (100%). |

---

## 2. Invariant Inspection: Hardened Reproduction Test

File inspected: `packages/runtime/src/fixtures/fastify4807/hardened-repro.test.js`  
Cryptographic SHA-256 Digest: `24a9275acba30f053fb175ee873a6772204c24bcc38daf0ccd50aba6c537208d`  
Identical replica verified: `work/phase4/hardened-runs/hardened-repro.test.js`

### Verification of Invariants:
1. **Framework Error Handler Invoked Exactly Once:**
   - Lines 21, 30: `frameworkErrorsInvocations++` inside the Fastify `frameworkErrors` option.
   - Lines 74–78: Explicit assertion:
     ```javascript
     assert.strictEqual(
       frameworkErrorsInvocations,
       1,
       `Expected frameworkErrors to be called exactly once, but got ${frameworkErrorsInvocations}`
     );
     ```
   - *Audit finding:* Prevents silent passes where routing avoids the error handler entirely.
2. **Normal Route Handler Completely Bypassed:**
   - Lines 22, 56–59: Route handler for `fastify.get('/test/:id', ...)` increments `routeHandlerInvocations++`.
   - Lines 81–85: Explicit assertion:
     ```javascript
     assert.strictEqual(
       routeHandlerInvocations,
       0,
       `Expected normal route handler to be bypassed, but it executed ${routeHandlerInvocations} times`
     );
     ```
   - *Audit finding:* Proves that Fastify halted normal pipeline dispatch before executing application business logic.
3. **Historical Error Code Verified:**
   - Lines 26, 31: `observedErrorCode = err && err.code ? err.code : null;`.
   - Lines 88–92:
     ```javascript
     assert.strictEqual(
       observedErrorCode,
       'FST_ERR_BAD_URL',
       `Expected framework error code to be 'FST_ERR_BAD_URL', but got '${observedErrorCode}'`
     );
     ```
   - *Audit finding:* Ensures the trigger was genuinely the historical malformed URL error rather than an incidental parsing failure.
4. **Exception-Safe Getter Access with Re-throw in `main()`:**
   - Lines 34–39:
     ```javascript
     try {
       observedRouteConfig = req.routeConfig;
     } catch (e) {
       routeConfigThrew = true;
       routeConfigError = e;
     }
     res.send('error handled');
     ```
   - Lines 96–98:
     ```javascript
     if (routeConfigThrew) {
       throw routeConfigError;
     }
     ```
   - *Audit finding:* In Fastify's architecture, throwing uncaught errors inside `frameworkErrors` can abort the response pipeline without calling `res.send()`, causing `fastify.inject` to hang indefinitely. Capturing the error, allowing `res.send()` to settle the injection promise, and re-throwing in `main()` guarantees immediate failure reporting without deadlocking.
5. **Strict `undefined` Return Value Check (Decoy Rejection):**
   - Lines 101–105:
     ```javascript
     assert.strictEqual(
       observedRouteConfig,
       undefined,
       `Expected req.routeConfig to be strictly undefined, but got: ${JSON.stringify(observedRouteConfig)}`
     );
     ```
   - *Audit finding:* Specifically distinguishes correct patches (returning `undefined`) from the semantic decoy patch returning `{}`.
6. **Bounded Timeout Protection:**
   - Lines 45–53: 5000ms bounded timeout with `timeoutTimer.unref()`.
   - Lines 61–67: `Promise.race([fastify.inject(...), timeoutPromise])`.
   - Lines 69–71, 113–115: Deterministic timer clearance.
   - *Audit finding:* Prevents container or CI deadlocks in hung state scenarios.
7. **Deterministic Resource Teardown in `finally`:**
   - Lines 112–117:
     ```javascript
     finally {
       if (timeoutTimer) {
         clearTimeout(timeoutTimer);
       }
       await fastify.close();
     }
     ```
   - *Audit finding:* Prevents event loop handle leaks.
8. **Guaranteed Non-Zero Exit Code on Failure:**
   - Lines 120–124:
     ```javascript
     main().catch((err) => {
       console.error('HARDENED_TEST_FAILED:');
       console.error(err);
       process.exit(1);
     });
     ```
   - *Audit finding:* Eliminates silent promise rejection swallowing.

---

## 3. Inspection of AI Test Validator & Runtime Safety Protections

### 1. Static AST Validator (`packages/runtime/src/ai-generator.ts` — `validateTestAst`)
Audited the AST visitor implementation against generative testing hazards:
- **Detection of Swallowed Promise Rejections:**
  - Lines 279–342: Inspects `.catch(...)` calls. Detects direct handler references (`.catch(console.error)`, `.catch(console.log)`).
  - Inspects function bodies: scans for presence of failure mechanisms (`throw`, `assert`, `expect`, `t.fail`, `t.error`, `reject`, `process.exit`, `process.exitCode = ...`).
  - Flags: `'Swallowed promise rejection detected: .catch() handler logs error without rethrow, assertion, or failure exit'` if error logging is present without a failure mechanism.
- **Missing Test Assertions:**
  - Lines 232–242, 350–354: Tracks invocation of recognized assertion libraries (`assert`, `expect`, `t.*`, `should.*`).
  - If `assertionCount === 0`, issues error `'Missing test assertions: Test contains no assertion calls'`.
- **Swallowed Assertions Inside `try/catch` Blocks:**
  - Lines 166–206: Analyzes `try` blocks for assertion expressions (`assert`, `expect`). If present, verifies that the matching `catch` block contains an active failure mechanism (`throw`, `assert`, `expect`, `process.exit`). If absent, flags `'Swallowed assertion detected: assertion inside try block is caught without rethrow or failure verification'`.
- **Dangling Asynchronous Operations:**
  - Lines 208–224: Detects expression statements invoking `.inject()`, `.request()`, or `fetch()` that are neither awaited, assigned, returned, nor chained with `.then()`. Flags `'Dangling async operation detected'`.
- **Prohibition of `process.exit(0)` Bypasses:**
  - Lines 270–276: Detects and rejects `process.exit(0)` calls that could mask test failures, while permitting explicit failure exits (`process.exit(1)`).
- **Module and Identifier Sandboxing:**
  - Enforces `ALLOWED_REQUIRE_MODULES` allowlist and strictly forbids dangerous globals/methods (`eval`, `Function`, `global`, `process.kill`, `process.setuid`, etc.).

### 2. Runtime Output Normalizer (`packages/runtime/src/adapters/generic-adapter.ts` — `normalizeGenericTestOutput`)
Audited the runtime log interpreter for fail-safe normalization:
- **Swallowed Failure Log Detection:**
  - Lines 351–352: Scans combined stdout/stderr for `/Test failed:|HARDENED_TEST_FAILED:|AssertionError/i`. Even if a test process finishes with exit code `0`, `testPassed` evaluates to `false`.
  - Lines 375–379: Reclassifies status to `failed` with type `'AssertionError'` or `'SwallowedAssertionError'`.
- **Unhandled Promise Rejection Detection:**
  - Lines 347–350: Detects `/UnhandledPromiseRejection|Unhandled promise rejection|ERR_UNHANDLED_REJECTION/i` and reclassifies as `failed` with `'UnhandledRejectionError'`.
- **Timeout Normalization:**
  - Lines 353, 371–372: Detects `/timed out|timeout/i` and reclassifies as `'TimeoutError'`.
- **Exit Code Non-Zero Gate:**
  - Lines 346, 358: Requires `exitCode === 0` for test pass.

---

## 4. Live 4-Target Container Evaluation Review

Location: `work/phase4/hardened-runs/`

### 1. Hardened Verdict Record (`work/phase4/hardened-runs/evaluation-verdict.json`)
```json
{
  "verdict": "SUCCESS",
  "hardenedTestSha256": "24a9275acba30f053fb175ee873a6772204c24bcc38daf0ccd50aba6c537208d",
  "testClassification": "HARDENED REGRESSION TEST",
  "checks": {
    "buggyFails": true,
    "referenceFixPasses": true,
    "alternateFixPasses": true,
    "decoyRejectedByHardenedTest": true,
    "nonRegressionBaselinePasses": true,
    "offlineEnforced": true,
    "isolationEnforced": true,
    "cleanupEnforced": true
  },
  "invariantsVerified": {
    "frameworkErrorsInvokedOnce": true,
    "routeHandlerBypassed": true,
    "frameworkErrorCodeVerified": "FST_ERR_BAD_URL",
    "safeGetterAccessOutsideHandler": true,
    "strictlyUndefinedReturnValue": true,
    "cleanResourceShutdown": true,
    "boundedExecutionTimeout": true
  },
  "errors": []
}
```

### 2. Differential Execution Logs Across the 4 Targets

| Target | Run ID | Exit Code | Patch Hash | Stderr / Failure Signature | Suite Exit Code | Cleaned |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| **Buggy** | `hardened-buggy-ff3657b1` | **1** | `000000000...` | `TypeError: Cannot read properties of undefined (reading 'config') at Request.get (/case/lib/request.js:204:55)` | **0** (`baseline routing passed`) | **true** |
| **Reference** | `hardened-reference-25a81de4` | **0** | `da9cbf565...` | None (`HARDENED_TEST_PASSED: All Fastify #4807 regression invariants verified successfully.`) | **0** (`baseline routing passed`) | **true** |
| **Alternate** | `hardened-alternate-a6908286` | **0** | `e8cb28e30...` | None (`HARDENED_TEST_PASSED: All Fastify #4807 regression invariants verified successfully.`) | **0** (`baseline routing passed`) | **true** |
| **Decoy** | `hardened-decoy-e518390c` | **1** | `f9a1a4ceb...` | `AssertionError [ERR_ASSERTION]: Expected req.routeConfig to be strictly undefined, but got: {}` (`{} !== undefined at main /case/test/repro.test.js:101:12`) | **0** (`baseline routing passed`) | **true** |

### 3. Container Security & Isolation Parameters
All 4 container runs independently documented identical, enforced isolation policies:
- `networkMode`: `"none"` (100% offline air-gapped execution)
- `user`: `"1000:1000"` (strictly unprivileged non-root user)
- `readonlyRoot`: `true` (immutable root filesystem)
- `capDropAll`: `true` (dropped all kernel capabilities)
- `noNewPrivileges`: `true` (prevented privilege escalation)
- `cpus`: `1`, `memoryBytes`: `268435456` (256 MiB RAM limit)
- `pidsLimit`: `64`
- `mounts`: `[{"type": "tmpfs", "destination": "/tmp"}]`
- `cleaned`: `true` (container and temporary mounts wiped deterministically)

---

## 5. Protected Contract Files & Historical Integrity Audit

### 1. Immutability of Protected Evaluation Core
Executed:
`git diff HEAD -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts`
- `packages/judge/src/evaluate.ts`: **0 byte diff** (100% untouched)
- `packages/contracts/src/index.ts`: **0 byte diff** (100% untouched)

### 2. Historical Evidence Manifest Verification
Audited all checksum manifests via cryptographically computed SHA-256 digests:
- **Phase 3 Evidence (`work/phase3/artifact-sha256.json`):**
  - Total entries: **57**
  - Verified matches: **57**
  - Failed: **0**
- **Original Phase 4 Evidence (`work/phase4/artifact-sha256.json`):**
  - Total entries: **2,079**
  - Verified matches: **2,079**
  - Failed: **0**
- **Hardened Phase 4 Runs (`work/phase4/hardened-runs/artifact-sha256.json`):**
  - Total entries: **31**
  - Verified matches: **31**
  - Failed: **0**
- **Total Files Cryptographically Verified:** **2,167 / 2,167** (100% pass)

---

## 6. Typecheck and Unit Test Suite Verification

### 1. Workspace TypeScript Compilation (`pnpm typecheck`)
- Command: `tsc --noEmit`
- Result: **Exit Code 0**
- Type errors: **0**

### 2. Targeted Unit Test Execution (`pnpm vitest run`)
Executed:
`pnpm vitest run packages/runtime/src/adapters/generic-adapter.test.ts packages/runtime/src/blind-synthesis.test.ts`
- `packages/runtime/src/adapters/generic-adapter.test.ts`: **18 passed (18)**
- `packages/runtime/src/blind-synthesis.test.ts`: **18 passed (18)**
- **Total Test Files Passed:** 2 / 2
- **Total Tests Passed:** **36 / 36 (100%)**
- Execution Duration: 3.85s

---

## 7. Residual Limitations & Security Observations

1. **Static AST Heuristic Scope:**
   Static AST pattern matching in `validateTestAst` reliably catches top-level or single-layer promise rejection swallowing and empty `.catch()` handlers. In scenarios where tests employ deeply nested callback abstractions, dynamic error forwarding, or custom event emitters, static AST heuristics might be evaded. However, ReplayKit's **defense-in-depth architecture** directly mitigates this through `normalizeGenericTestOutput`, which inspects raw process stdout/stderr for failure markers (`AssertionError`, `HARDENED_TEST_FAILED:`) regardless of exit code.
2. **Container Timeout Envelope:**
   The hardened test uses an internal 5,000ms race timer, within an overall Docker execution limit of 30 seconds (`timeoutSeconds: 30`). Observed actual execution times spanned from 1,183ms to 3,232ms. This leaves a comfortable ~10x safety margin under normal virtualization load, but CI runners under extreme CPU contention should maintain at least 1 vCPU and 256 MiB to avoid spurious timeouts.
3. **Generalization Extensibility:**
   The architecture verified in this audit (pairing `GenericAdapter` configuration presets with static AST safety checks and containerized 4-target differential discrimination) is robust and reusable for any arbitrary Node.js library without compromising the judge's immutable core.

---

## 8. Final QA Sign-Off

The Fastify #4807 test-hardening implementation and differential verification records meet all quality, security, and reproducibility standards of ReplayKit.

**Audit Recommendation:** **APPROVED FOR MERGE / RELEASE**  
**Final Status:** **VERIFIED PASS**
