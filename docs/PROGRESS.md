# Progress

## 2026-10-20 — Docker Cleanup Hardening & Phase 5 Developer CLI Completed

ReplayKit completed the Docker resource cleanup audit and the Phase 5 developer-facing CLI implementation:
- **Docker Resource Cleanup Hardened (`packages/runtime/src/docker-cleanup.ts`):**
  - **Ownership Policy:** Strictly cleans up resources labeled `replaykit.run` or prefixed `rk-` / `rk-ext-` / `rk-net-`. Strictly forbids removing Docker Compose project resources (`com.docker.compose.*`) or developer database volumes (`replaykit-dev-data`, `replaykit_default`).
  - **Detachment Backoff Retry:** Implemented `removeVolumeWithRetry` with exponential backoff (3 attempts) eliminating container-volume detachment races.
  - **Process Signal Teardown:** Implemented `InFlightResourceTracker` tracking in-flight containers/volumes with `SIGINT`/`SIGTERM` handlers for emergency cleanup on aborted executions.
  - **Supervisor Integration:** Fully wired into `runExternalContainer` with registration on allocation and unregistration in `finally`.
  - **Live Daemon Sweep:** Identified and pruned 3 historical orphaned containers (`rk-...-test`) and 3 orphaned networks (`rk-...-net`) from earlier R1 runs (2 days ago), restoring daemon to pristine 0-orphan state.
  - **Unit Tests:** 14/14 automated tests in `packages/runtime/src/docker-cleanup.test.ts` passing.
  - **Audit Documentation:** Recorded in [`docs/phase4/DOCKER_CLEANUP_AUDIT.md`](file:///C:/Users/sunmo/Documents/Codex/2026-10-16/files-mentioned-by-the-user-agents/outputs/replaykit/docs/phase4/DOCKER_CLEANUP_AUDIT.md).
- **Phase 5 Developer-Facing CLI (`packages/cli/src/developer-command.ts`, `packages/cli/src/index.ts`):**
  - **`replaykit clean`:** Sweeps orphaned containers, networks, and volumes with `--dry-run` and `--run-id` filtering.
  - **`replaykit doctor`:** Live diagnostics of container runtime and Ollama connection with `qwen2.5-coder:3b` model verification.
  - **`replaykit generate`:** Configuration-driven AI regression-test synthesis with AST validation and epistemic `--ambiguous-oracle` negative control.
  - **`replaykit run`:** Standalone test execution inside isolated container sandbox (`--network none`, read-only rootfs, 256 MiB RAM, 1 CPU, 29s watchdog).
  - **`replaykit verify`:** Four-target differential verification (buggy, reference, alternate, decoy) reporting formal evaluator verdicts.
  - **CLI Unit Tests:** 13/13 automated unit tests in `packages/cli/test/developer-command.test.ts` passing.
  - **Design Documentation:** Recorded in [`docs/phase4/PHASE5_CLI_DESIGN.md`](file:///C:/Users/sunmo/Documents/Codex/2026-10-16/files-mentioned-by-the-user-agents/outputs/replaykit/docs/phase4/PHASE5_CLI_DESIGN.md).
- **Cryptographic Evidence Registry:**
  - Phase 3: 57/57 artifact digests verified unchanged (0 errors).
  - Phase 4 Original: 2,079/2,079 artifact digests verified unchanged (0 errors).
  - Phase 4 Hardened: 31/31 artifact digests verified unchanged (0 errors).
  - Protected R1 files (`packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts`) verified 100% byte-for-byte untouched (`git diff --exit-code`).
  - `pnpm typecheck`: Exit code 0 (zero errors).


ReplayKit strengthened and hardened the Fastify #4807 regression test and safety validation pipeline:
- **Strengthened Regression Test:** Engineered [`packages/runtime/src/fixtures/fastify4807/hardened-repro.test.js`](file:///C:/Users/sunmo/Documents/Codex/2026-10-16/files-mentioned-by-the-user-agents/outputs/replaykit/packages/runtime/src/fixtures/fastify4807/hardened-repro.test.js) (SHA-256: `24a9275acba30f053fb175ee873a6772204c24bcc38daf0ccd50aba6c537208d`), versioned into `work/phase4/hardened-runs/hardened-repro.test.js`. Labeled as **HARDENED REGRESSION TEST**.
  - Tracks execution count of `frameworkErrors` (asserts `=== 1`).
  - Verifies normal route handler bypass (asserts `=== 0`).
  - Verifies historical framework error code `FST_ERR_BAD_URL`.
  - Exception-safe getter inspection inside handler with re-throw in `main()`, ensuring Fastify request settlement without hanging.
  - Strict equality check (`assert.strictEqual(observedRouteConfig, undefined)`) rejecting `{}` decoy.
  - Bounded 5000ms `Promise.race` timeout with unref timer.
  - Deterministic `await fastify.close()` in `finally`.
  - Guaranteed nonzero exit code on assertion failure via `main().catch((err) => { console.error(err); process.exit(1); })`.
- **Live Four-Target Differential Container Evaluation:**
  - Target 1 (Buggy Base): Exit code 1, reproduced native `TypeError: Cannot read properties of undefined (reading 'config')` at `/case/lib/request.js:204:55` (duration: 3,232ms).
  - Target 2 (Reference Fix): Exit code 0, `HARDENED_TEST_PASSED`, `req.routeConfig === undefined` (duration: 2,624ms).
  - Target 3 (Alternate Fix): Exit code 0, `HARDENED_TEST_PASSED`, `req.routeConfig === undefined` (duration: 1,964ms).
  - Target 4 (Decoy Fix): Exit code 1, rejected by hardened test with `AssertionError [ERR_ASSERTION]: Expected req.routeConfig to be strictly undefined, but got: {}` (duration: 1,183ms).
  - Non-Regression Baseline: `test/baseline-sanity.js` passed with exit code 0 across all 4 targets.
  - Security & Isolation: 100% enforced across all targets (`--network none`, UID `1000:1000`, `--read-only`, `--cap-drop ALL`, `no-new-privileges`, 256 MiB memory, deterministic cleanup).
  - Evidence & Registry: Staged in `work/phase4/hardened-runs/` with 31 artifacts hashed in `work/phase4/hardened-runs/artifact-sha256.json`.
- **AI Test Validator Hardened:**
  - Static AST checks in `packages/runtime/src/ai-generator.ts`: Detects and rejects swallowed promise rejections in `.catch(...)`, tests without assertions, swallowed assertions in `try/catch`, dangling unawaited async operations, and `process.exit(0)` bypasses.
  - Runtime normalizer in `packages/runtime/src/adapters/generic-adapter.ts`: Rejects swallowed assertion errors in output (`Test failed: AssertionError...`), unhandled promise rejections, and timeouts even if process exit code was 0.
  - Unit tests: 18/18 tests in `generic-adapter.test.ts` and 18/18 tests in `blind-synthesis.test.ts` passing (36/36 total).
- **Historical Evidence Preservation:**
  - Original Phase 4 artifacts (2,079 files in `work/phase4/`) verified 100% byte-for-byte untouched.
  - Original Phase 3 artifacts (57 files in `work/phase3/`) verified 100% byte-for-byte untouched.
  - Protected contracts (`packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts`) verified 100% byte-for-byte untouched (`git diff --exit-code`).
- **Documentation Deliverable:** Recorded in [`docs/phase4/FASTIFY_TEST_HARDENING.md`](file:///C:/Users/sunmo/Documents/Codex/2026-10-16/files-mentioned-by-the-user-agents/outputs/replaykit/docs/phase4/FASTIFY_TEST_HARDENING.md). Status: **PASS / VERIFIED**.

ReplayKit completed the Phase 4 generalization milestone, decoupling from utility-level fixtures to real-world HTTP backend error handling in `fastify/fastify`:
- **Independent Phase 3 Audit Closed:** Verified all 57/57 SHA-256 artifact digests in `work/phase3/artifact-sha256.json`, confirmed epistemic honesty on deterministic `INSUFFICIENT_ORACLE` negative control, and documented prompt skeleton steering disclosures in `docs/phase3/INDEPENDENT_SYNTHESIS_AUDIT.md`.
- **Config-Driven Generic Adapter:** Implemented `packages/runtime/src/adapters/generic-adapter.ts` (`GenericAdapterConfigSchema`, `validateCommandArguments`, `stageGenericPayload`, `normalizeGenericTestOutput`, `createGenericManifest`, `createFastifyPreset`). Decoupled from hardcoded `qs33-adapter.ts`. Verified with 15/15 automated unit tests including command validation, exit code normalization, prepended hunk offsets, and multi-file unified diff application.
- **Second Authentic Case Selected & Staged:** Pinned authentic Fastify Issue #4807 / PR #4826 (`61b86760019c85afbef6cc0f175c75870381ed04`). Staged 282 clean source files in `work/phase4/sanitized-buggy-workspace` with zero leak tokens detected in blinding audit.
- **Novel Test Synthesis:** Ollama model `qwen2.5-coder:3b` synthesized a novel standalone regression test file (`test/repro.test.js`, SHA-256: `2ef58646bf3f84f3ade7889199c744128c209ef9c33b2d1b6461c28918c6b998`) in 60.8s. Epistemic negative control under ambiguous behavioral contract returned `status: "INSUFFICIENT_ORACLE"`.
- **Differential Container Evaluation under `--network none`:**
  - Target 1 (Buggy Base): Exit code 1, reproduced native `TypeError: Cannot read properties of undefined (reading 'config')` at `/case/lib/request.js:204:55` (duration: 3,106ms).
  - Target 2 (Reference Fix): Exit code 0, `req.routeConfig === undefined` (duration: 2,196ms).
  - Target 3 (Alternate Fix): Exit code 0, `req.routeConfig === undefined` with syntactically independent ternary check (duration: 1,623ms).
  - Target 4 (Decoy Fix): Exit code 1, correctly rejected with `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: {} !== undefined` at `/case/test/repro.test.js:6:12` (duration: 1,879ms).
  - Baseline Non-Regression: Core HTTP routing baseline test (`test/baseline-sanity.js`) passed with exit code 0 across all 4 targets.
  - Security & Isolation: 100% enforced across all targets (`--network none`, UID `1000:1000`, `--read-only`, `--cap-drop ALL`, `no-new-privileges`, 256 MiB memory, deterministic cleanup).
- **Reusable Benchmark Metrics:** Established reusable evaluation record across Phase 3 and Phase 4 (`work/phase4/benchmark-metrics.json`, `docs/phase4/BENCHMARK_METRICS.md`) tracking all 14 specified metrics (2 incidents attempted, 2 sufficient oracles + 2 negative controls, 100% generation success, 100% buggy reproduction, 100% correct-fix acceptance, 100% decoy rejection, 0% false positives, 0 regressions, ~96% integration code reduction).
- **Cryptographic Registry:** All 2,079 artifacts in `work/phase4/` hashed and verified in `work/phase4/artifact-sha256.json`.
- **Protected File Immutability:** `packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts` verified 100% byte-for-byte untouched (`git diff --exit-code`). Historical Phase 2 and Phase 3 runs preserved untouched.
- **Decision Document:** Recorded in `docs/phase4/GENERALIZATION_DECISION.md`. Gate status: **PASS**.

## 2026-10-20 — Phase 3 first blind AI regression-test generation verified & passed

ReplayKit crossed the boundary from test execution to novel test synthesis under strict, cryptographically verified blinding:
- Authentic `ljharb/qs` issue #33 buggy base revision (`360e2b0b48548b9bfdb71f8c82a68c4f34ec0725`) staged into a sanitized workspace (`work/phase3/sanitized-buggy-workspace`).
- Independent blinding audit scanned 20 files: historical test #40 scrubbed from `test/parse.js` (reducing tests from 40 to 39), all candidate patches, probes, and git history containing solutions completely removed. 0 leak tokens detected.
- Synthesis execution: `qwen2.5-coder:3b` via local Ollama API synthesized a novel standalone regression test file (`test/repro.test.js`, SHA-256: `6a174eabccf0651b18f893967a068495f88a4a1fb6dc01aed56ed9307ee5b774`) in 38s. AST validation verified syntax, no banned APIs, unauthorized require blocking, and Levenshtein distance 403 to historical test #40.
- Four-target differential container evaluation under `--network none`:
  - Target 1 (Buggy): Exit code 1, reproduced native `TypeError: source.hasOwnProperty is not a function` at `/case/lib/utils.js:47:20`.
  - Target 2 (Reference Fix): Exit code 0, all 56 tests passed.
  - Target 3 (Alternate Fix): Exit code 0, all 56 tests passed.
  - Target 4 (Decoy Fix): Exit code 1, semantic `AssertionError: expected { a: {} } to deeply equal { a: { b: 'c' } }`. All 55 baseline tests passed; only the generated test rejected the decoy.
- Epistemic honesty: Negative control without explicit behavioral specification correctly yielded `status: "INSUFFICIENT_ORACLE"` without guessing or fabricating assertions.
- Artifact integrity: All 57 artifacts in `work/phase3/` cryptographically registered in `artifact-sha256.json` (57/57 verified).
- Protected R1 files (`packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts`) verified 100% byte-for-byte untouched (`git diff --exit-code`).
- Decision recorded in `docs/phase3/BLIND_SYNTHESIS_DECISION.md`. Gate status: **PASS**.

## 2026-10-20 — Gate C4 full 17-run matrix execution verified; status promoted to VERIFIED

The full 17-run execution matrix (10 authentic buggy, 3 reference fix, 3 alternate fix, 1 decoy fix) was executed live and sequentially via the reusable TypeScript external runner:
- Full matrix execution completed in 408s total wall-clock time with zero host binds, isolated network (`--network none`), read-only root, UID 1000:1000, 1 CPU / 256 MiB / 64 PIDs, 29s PID-1 watchdog, and verified container/volume cleanup.
- Buggy (10/10): 10 deterministic failure reproductions, exit code 1, 55/56 passed, only test 40 failed with `TypeError: source.hasOwnProperty is not a function` at `/case/lib/utils.js:47:20`. Buggy probe reproduced native failure across all 10 runs.
- Reference fix (3/3): 56/56 tests passed, exit code 0, probe passed with serialized output `{"a":{"b":"c"}}`.
- Alternate fix (3/3): 56/56 tests passed, exit code 0, probe passed with serialized output `{"a":{"b":"c"}}`.
- Decoy fix (1/1): 55/56 tests passed, exit code 1, test 40 failed with `AssertionError`, probe failed with `AssertionError: expected { a: {} } to deeply equal { a: { b: 'c' } }`.
- Evaluator verdict: `evaluateExternalEvidence()` in `packages/judge/src/external.ts` returned `status: 'VERIFIED'`, `deterministicRuns: 10`, `deterministicFailures: 10`, and 0 reason codes. External status is officially promoted to **`VERIFIED`**.
- 153 raw evidence artifacts hashed (SHA-256) and verified in `work/phase2/gate-c-runs/qs33-c4-live-01/artifact-sha256.json`.
- Automated test suite: 42/42 tests in `packages/runtime/src/external-runner.test.ts` passed; `pnpm typecheck` passed (exit code 0); `git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts` verified protected files 100% untouched.
- Scoped decision recorded in `docs/phase2/GATE_C4_DECISION.md`; frozen execution manifest in `docs/phase2/GATE_C4_MANIFEST.json`; complete 17-run index in `work/phase2/gate-c-runs/qs33-c4-live-01/evidence-index.json`.
- Next product milestone prepared: Blind AI Regression-Test Synthesis (`docs/phase2/BLIND_AI_SYNTHESIS_PLAN.md`) and Production Incident Context Contract (`docs/phase2/INCIDENT_CONTEXT_CONTRACT.md`).
- qs-specific infrastructure development is now frozen.

## 2026-10-19 — Stage C3 candidate patch validation & counterfactual execution verified

All three candidate patches (authentic reference fix, independent alternate fix, and plausible decoy fix) were applied and evaluated under identical isolated container conditions:
- Reference fix (`reference.patch`, SHA-256 `fc1d3f9205a621617ca4f86432411dfddf6422432dfcb6d80f936af920cafe8e`): 56/56 tests passed, probe passed with exact output `{"a":{"b":"c"}}`, stderr 0 bytes.
- Alternate fix (`alternate.patch`, SHA-256 `760d2dbd744d610b81426da10c412fc8db40b930e15ce895296157eaeb24ff28`): 56/56 tests passed, probe passed with exact output `{"a":{"b":"c"}}`, stderr 0 bytes.
- Decoy fix (`decoy.patch`, SHA-256 `318a5449a218b2d5d882fc6993086de1f53300559f1dfd2ed0d30696c87f6e81`): 55 passed / 1 failed (Test 40), probe failed with `AssertionError: expected { a: {} } to deeply equal { a: { b: 'c' } }`, exit code 1.
- Pure TypeScript patch applier (`patch-applier.ts`): Enforces base commit `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` with symbolic ref resolution, expected patch SHA-256, path allowlist `['lib/parse.js', 'lib/stringify.js', 'lib/utils.js']`, path traversal/absolute path rejection, symlink rejection, newline style preservation, and hunk context matching with zero shell or external git/patch invocations.
- Automated suite: 34/34 tests in `packages/runtime/src/external-runner.test.ts` passed; `pnpm typecheck` passed (exit code 0); `pnpm token:scan` passed (0 violations).
- Evidence & review: Scoped decision recorded in `docs/phase2/GATE_C3_DECISION.md`; newly captured raw artifacts (all 27 files across reference, alternate, and decoy) saved in `work/phase2/gate-c-runs/qs33-c3-live-01` and verified against `artifact-sha256.json`. Gate B and Gate C2 evidence preserved untouched. Protected R1 files (`evaluate.ts` and `contracts/src/index.ts`) remain 100% untouched. External status remains `PARTIAL`; external `VERIFIED` is not claimed until Stage C4.

## 2026-10-19 — Stage C2 live buggy & fixed execution verified through external runner

Both authentic pinned `ljharb/qs` issue #33 revisions were executed sequentially through the reusable TypeScript external runner (`external-runner.ts`, `external-supervisor.ts`, `adapters/qs33-adapter.ts`):
- Pinned revisions: Buggy (`360e2b0b48548b9bfdb71f8c82a68c4f34ec0725`, Run ID: `c2-live-buggy-1792465411633`) and Fixed (`6a97ad1d71d8a9069f5d6002cab3130752519ccb`, Run ID: `c2-live-fixed-1792465442253`).
- Official TAP buggy: Exactly 56 test identities, 55 passed, only test 40 (`parse parses plain objects correctly`) failed with native `TypeError: source.hasOwnProperty is not a function` at `/case/lib/utils.js:47:20`. Buggy probe exited 1 with identical error and stack frame.
- Official TAP fixed: Exactly 56 test identities matching buggy identities, all 56 passed, 0 failed, 0 skipped, 0 TODOs. Fixed probe exited 0 without error and serialized exact output `{"a":{"b":"c"}}`.
- Runner decoupling: Supervisor is completely repository-agnostic; all qs-specific commands, Lab compatibility adaptations, TAP parsing, and probe analysis are confined to `adapters/qs33-adapter.ts`.
- Security & isolation: Both runs executed under `--network none`, read-only root, UID 1000:1000, 1 CPU / 256 MiB / 64 PIDs, 29s PID-1 watchdog, and verified cleanup.
- Targeted negative controls: All 9 controls passed, rejecting buggy passes, fixed failures, missing/altered test identities, malformed reports, incorrect failure identities/frames, corrupted hashes, cross-role substitutions, and incomplete cleanup.
- Automated suite: 19/19 tests in `packages/runtime/src/external-runner.test.ts` passed; `pnpm typecheck` passed (exit code 0); `pnpm token:scan` passed (53,692 files, 0 violations).
- Evidence & review: Scoped decision recorded in `docs/phase2/GATE_C2_DECISION.md`; newly captured raw artifacts (all 18 files, including fixed `probe.stderr`) saved in `work/phase2/gate-c-runs/qs33-c2-live-01` and verified against `artifact-sha256.json`. Test suite decoupled to stage evidence in temporary directories, leaving canonical evidence unmutated. Gate B evidence untouched. Protected R1 files (`evaluate.ts` and `contracts/src/index.ts`) remain 100% untouched.


## 2026-10-19 — Stage C1 external-runner vertical slice passed

A reusable trusted supervisor (`external-supervisor.ts`) and target adapter
(`adapters/qs33-adapter.ts`) were implemented and verified through the automated
test suite `packages/runtime/src/external-runner.test.ts` (8/8 tests passing).

A live execution of the pinned buggy `ljharb/qs` issue #33 revision completed
inside an isolated Docker container:
- Environment: pinned image `node:22-bookworm-slim@sha256:c3de60bf...`, `--network none`,
  read-only rootfs, nonroot user 1000:1000, 1 CPU / 256 MiB / 64 PIDs, no host binds,
  `/usr/bin/timeout` 29s PID 1 watchdog.
- Verified outcome: `executionStatus === 'COMPLETED'`, `exitCode === 1`.
- Raw TAP normalized into `OfficialReportSchema` (`official-suite-normalized-v1`):
  exactly 56 tests, 55 passed, 1 failed (Test ID 40: `parse parses plain objects correctly`).
- Failure identity captured native `TypeError: source.hasOwnProperty is not a function`
  at `/case/lib/utils.js:47:20`. Passing tests recorded `failure === null`.
- Evaluator integration: partial matrix evaluated via `evaluateExternalEvidence()`,
  strictly returning `status !== 'VERIFIED'` without false positive promotion.
- Deterministic cleanup: container and private staging volume verified deleted.
- Protected R1 files (`evaluate.ts` and contracts `index.ts`) remain 100% untouched.

## 2026-10-19 — Gate B local-07 passed independent review; Gate C assigned

The second sequential collection `qs33-gateb-local-07` completed under identical
pinned conditions (Node 22, exact 8 globals allowed in Lab 3.0.0, probe JSON
`{"a":{"b":"c"}}`, and 29s PID-1 watchdog). Official TAP reproduced 55/1 passes on
buggy (only test 40 failing with `TypeError: source.hasOwnProperty is not a function`
at `/case/lib/utils.js:47:20`) and 56/0 on fixed. Independent review confirmed all
370 artifact hashes, pinned source HEADs/trees, container isolation, and cleanup.
[The scoped Gate B local-07 decision](phase2/GATE_B_LOCAL07_DECISION.md) is recorded as
PASS for the authentic pair only; both Gate B collections remain untouched.

Gate C architecture, security, and independent evaluation specifications are
formally established in `docs/phase2/agents/`:
- Architecture (`gate-c-architecture.md`): Decoupled trusted supervisor and qs #33 adapter feeding `evaluateExternalEvidence()` without routing through R1.
- Security (`gate-c-security.md`): Strict `--network none`, read-only root, cap-drop ALL, no-new-privileges, <=1 CPU / 256 MiB / 64 PIDs, no host binds, 29s PID-1 watchdog.
- Evaluation (`gate-c-evaluation.md`): `qs #33` manifest definition, 10/3/3/1 validation rules, and failure identity binding.
- QA (`gate-c-qa.md`): Audit criteria and baseline test tracking. R1 judge and contracts remain 100% unchanged.

## 2026-10-19 — Gate B paired qs reproduction passed independent review

The predeclared local-06 Node 22 adaptation suppressed only eight unchanged
built-in globals in Lab 3.0.0 and kept unrelated/changed leak detection active;
it was applied equally to both upstream revisions. The structural probe no
longer compares prototypes. The ordinary PowerShell collector exited 0 and
wrote/printed its `GATE_B_SUMMARY.md`, including raw buggy probe stdout and
stderr. Buggy official/probe children exited 1/1 with the native qs TypeError
and top production frame; its official TAP had exactly one failure at test 40
among 56. Fixed official/probe children exited 0/0, with all 56 official tests
passing and exact probe JSON `{"a":{"b":"c"}}`. Both roles reported zero
remaining Lab leaks.

An independent reviewer reparsed the raw per-test results and checked source
heads, payload inventories, Docker limits/watchdog/cleanup, and all 370 artifact
hashes. Its read-only checks exited 0. [The scoped Gate B decision](phase2/GATE_B_DECISION.md)
is PASS for the authentic buggy/fixed pair only. The collector's saved PARTIAL
status denotes pre-review state. External runner, evaluator, matrix and
determinism evidence remain outstanding; no R1 VERIFIED claim is made.

## 2026-10-19 — Gate B inventory repair; buggy qs observed, fixed qs pending

The preserved `qs33-gateb-local-04` attempt ran pinned buggy qs. The official
suite and reproduction probe each exited 1 with the native
`TypeError: source.hasOwnProperty is not a function` at
`/case/lib/utils.js:47:20`; the official suite reported 1 of 56 failures.
The container exited 0 after collecting child results, which does not mean
the suite passed. The run became PARTIAL before fixed-revision execution.
Its three 356-file manifests have identical paths, lengths, and SHA-256 values.
Replay of the saved original `Same-Inventory` reproduced the false positive:
Windows PowerShell 5.1 wrapped the observed JSON array as one nested array.
The repaired comparator normalizes that wrapper, rejects duplicates, and
compares ordinal, case-sensitive paths, bytes, and hashes. The regression
passes on PowerShell 5.1 and 7 against the saved manifests and all required
negative fixtures. Independent QA approved script SHA-256
`797f149c9f55fb1f9d828a344aeb5cfe6b5f08c36acc15522f21b0eee211957f`
for fresh collection only; details are in
`docs/phase2/agents/gate-b-inventory-qa.md`. Run `qs33-gateb-local-05` from
normal PowerShell to collect both roles. Gate B and external-runner work remain
blocked until genuine fixed output and independent review.

## 2026-10-19 — Gate B Docker bind-count repair; qs execution still pending

The preserved `qs33-gateb-local-03` run reached the buggy container's pre-start
Docker inspection and then stopped BLOCKED with zero qs role executions.
`HostConfig.Binds` was null, but PowerShell counted `@($null)` as one bind.
The repaired assertion ignores only null/empty bind entries and still rejects
nonempty binds. Pre-copy checks now also require the exact configured named
`/case` volume with `NoCopy`, the volume token and role labels, and only the
approved `/tmp` tmpfs. The local regression passes under PowerShell 5.1 and 7;
the prior assertion failed its null case. An independent review is recorded in
`docs/phase2/agents/gate-b-bind-qa.md`. Gate B and external runner work remain
blocked until `qs33-gateb-local-04` produces real, independently reviewed buggy
and fixed upstream execution outputs. Prior evidence and R1 are unchanged.

## 2026-10-19 — Gate B lockfile parser repair; qs execution still pending

The preserved `qs33-gateb-local-02` run passed exact upstream source preparation
and npm dependency acquisition but stopped before Docker qs execution. Its npm
lockfile contains `packages[""]`, which Windows PowerShell 5.1 cannot convert to
a PSCustomObject. A fixed Node validator now checks that lockfile, its root,
the exact Lab pin and metadata integrity, and every dependency integrity/origin.
It emits a deterministic summary without lockfile values. Local regression and
saved-lock validation exit 0; PowerShell 5.1/7 AST checks exit 0. An independent
QA review is recorded under `docs/phase2/agents/`. Gate B remains blocked until
the fresh local-03 run yields real, independently reviewed buggy and fixed
upstream outputs. R1 and the external runner remain unchanged.

## 2026-10-17 — Phase 1 preflights blocked; no external verification

Gate 0 remains green at its recorded checkpoint. The separate external contract
now binds each execution to the pinned base revision and full official test-file
hash. Source-data guards extract only a complete new test without changing
controls, their parse or directive prologue; patch guards reject unsafe paths and
nonregular index modes. Review regressions were observed failing before fixes.
These helpers and the external evaluator are implemented; the production runner,
CLI, reporter normalizer and matrix integration remain unbuilt.

Final local checks: scanner clean on 49,833 files; 42 files / 461 unit tests
passed; TypeScript, lint and format exited 0. The final R1 smoke did not pass:
an initial provenance mismatch was corrected by removing an unused empty
workspace declaration and restoring the unchanged lockfile, then three buggy
preparations timed out during PostgreSQL readiness. Latest run
`cf6ae2b2-e044-4726-b638-9053f031ca85` is ERROR; no candidate/fix matrix
completed. No owned containers remain. The earlier Gate 0 pass is historical
evidence, not a replacement for this failed final validation.

Pinned Multilingual data and licenses were verified. All six real offline
preflights are reported in [EXTERNAL_VALIDATION.md](EXTERNAL_VALIDATION.md):
Immutable 2006 had two build errors, then 22 controls passed and one official
regression failed, but no application failure frame existed; Preact 3010 had
three Chrome startup timeouts within the unchanged 64-PID limit. Docusaurus 10130
image acquisition was canceled for low C: storage before any execution. No
external matrix, valid-fix/decoy runs or sensitivities ran. No external VERIFIED
claim exists. This is exploratory feasibility work, not the required Stage C
study. No LLM provider call was made; model/tokens/cost are null.

Stopped external work under the user's blocker rule. Final quality/R1 checks and
raw logs are recorded in the end-of-phase report in the current chat's
outputs/phase1. Phase 1 acceptance is incomplete; Phases 2–4 remain unstarted.

## 2026-10-17 — Approved contract implementation and Gate 0 green

The user approved the separate external official-suite contract. The legacy R1
schema and evaluator are restored exactly to commit `94fc971`; compared with the
pre-Sentry evaluator (`62b92f1`), only the existing separate execution-time sum
field differs. No charge/request acceptance predicate was generalized.

- Added permanent null-charge and mixed-field rejection tests. External evidence
  has an explicit versioned schema/evaluator and never dispatches from telemetry
  or missing R1 observations. Its matrices are unit fixtures only; no external
  execution is claimed here.
- Replaced the scanner with fail-closed Git enumeration, tracked/untracked and
  ignored artifact byte scanning, uppercase matching, exact-canary handling,
  symlink rejection, and token-free findings. CI explicitly runs it. Review found
  inherited ripgrep config, BOM decoding and bare timer imports; regression tests
  reproduced all three, fixes passed, and independent re-review found no remaining
  important issue in that scope.
- Final `pnpm test`: exit 0; token scan clean across 49,807 files; 40 test files,
  422 tests passed. `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm format:check`:
  all exit 0. Vitest emitted an existing duplicate Sentry initialization warning.
- `pnpm benchmark smoke`: exit 0, PASS / VERIFIED, run
  `d4941e32-8d5c-4b8c-8164-afbb421e1400`. Matrix: 10 buggy failures, 3 reference
  passes, 3 alternate passes, decoy rejection. Wrong-frame rejection and missing-body
  abstention passed. Verification wall time 408,708 ms; execution sum 1,140,273 ms;
  whole smoke wall time 472,318.2805 ms. No owned containers remained afterward.
- Required cleanup grep is empty (exit 1); all four variant-comparison hits were
  reviewed as unit fixtures, progress or grouping. Removed simulation directories
  remain absent. No remote is configured; no push is possible.

Raw outputs and a copy of the fresh smoke artifacts are preserved in the current
next-steps chat's `outputs/phase1/` directory. Gate 0 is complete. Next: verify
official benchmark provenance/licenses/images, then build and run real Stage A.
Stage B, Stage C, external sensitivities and external verification are not built
or run at this checkpoint. Phases 2–4 have not started.

## 2026-10-17 — Next-steps Gate 0 audit blocked before external validation

This audit follows the user's ordered next-steps instructions. Phase 1 Stage A
has not started, and no external-repository verdict is claimed.

- Found the existing snapshot `ebb0f7d` on `wip/before-medusa-cleanup` and cleanup
  commit `94fc971` on `codex/replaykit-r1`. No replacement snapshot was made.
- Preserved pre-existing uncommitted changes in `packages/contracts/src/index.ts`,
  `packages/judge/src/evaluate.ts`, and `packages/judge/src/judge.test.ts`.
  The proposed `charges: null` fallback changes R1 acceptance. A diagnostic
  comparison against the committed evaluator ran 39 checks: 34 passed and five
  failed, each admitting evidence that the committed R1 evaluator rejects.
  These are unit fixtures, not container evidence or external-benchmark results.
- The token scanner still contains two Medusa references. Four isolated scanner
  probes produced two passes and two failures: uppercase token shapes are missed,
  and a Git scan error reports success. No real credential was used by the probes;
  generated fake fixtures were removed.
- Fresh `pnpm test`: exit 0, 38 files and 361 tests passed, including the existing
  token scanner. Fresh `pnpm exec tsc --noEmit`, `pnpm lint`, and
  `pnpm format:check`: exit 0. Initial sandboxed attempts had dependency-access
  failures; the results above are from approved execution outside that sandbox.
- `git grep -niE 'medusa|upstreamRepo' -- packages scripts apps`: exit 0 with two
  token-scanner hits, so the required empty-output cleanup gate fails.
  Both removed simulation directories are absent. The four variant-comparison
  hits were reviewed; none establishes runtime verdict evidence from a label.
- Docker inspection found no containers labeled `replaykit.run` and no container
  named `medusa-postgres`. A supplemental source/artifact token scan with ripgrep
  completed without matches after excluding dependency and Git internals. An
  earlier recursive PowerShell scan was stopped before completion.
- R1 smoke was not run because Gate 0 remains blocked by the judge contract change
  and scanner gaps. Previous smoke reports are historical, not fresh evidence.
- No remote is configured; nothing was committed or pushed during this audit.

The full report, raw verification outputs, machine-readable audit, preserved
pre-existing diff, and contract proposal are in the next-steps chat's
`outputs/gate0-audit/` directory. Diagnostic sources are ignored local files in
`work/gate0-audit/`; they are not yet permanent CI regression tests.

**Next concrete task:** review the proposed external-invariant evidence contract
under Rule 3, replace the unreviewed null-based fallback only after that decision,
repair the scanner and add permanent regression coverage, then rerun every Gate 0
check including real R1 smoke. Benchmark selection and external runner work remain
unbuilt pending Gate 0.

## 2026-10-17 — Provenance, Shared Runtime, MCP Server, VS Code / Cursor Extension, and Sentry Integration

Completed the next development milestones for ReplayKit while preserving the R1 benchmark baseline:

1. **Preserved R1 Milestone**:
   - The established 17-execution matrix (10 fresh buggy failures, 3 reference passes, 3 alternate passes, 1 decoy rejection) remains intact with fresh PostgreSQL initdb, concurrency 3, fsync on, and isolated Docker network execution.
   - Negative controls (wrong-frame rejection and missing-body abstention) remain strictly enforced.
   - No benchmark scope creep (D2/N5/E2 and 20-case held-out corpus remain deferred).

2. **Execution Provenance Hardening (`packages/cli/src/provenance.ts`)**:
   - Extended execution manifests to include comprehensive cryptographic SHA-256 hashes:
     - Shared checkout application source hash.
     - Controller source hash (`packages/cli`, `packages/replay-engine`, `packages/telemetry`, `packages/contracts`).
     - Judge and sandbox runner source hash (`packages/judge`).
     - Dependency lockfile hash (`pnpm-lock.yaml`).
     - Git commit SHA and dirty working-tree status.
     - Docker image IDs, PostgreSQL initialization mode (`initdb` or `template-copy`), concurrency, and fsync setting.
   - Automated tests in `packages/cli/src/provenance.test.ts` (5 tests) and `packages/judge/src/sandbox-manifest.test.ts` (6 tests) confirm these fields are validated and reject mismatched dependencies or corrupted settings.

3. **Shared ReplayKit Runtime (`packages/runtime`)**:
   - Created a reusable, asynchronous runtime library providing:
     - `createRuntime(workspaceRoot)` returning `startReproduction`, `getJobStatus`, `getReport`, `getOpenTest`, `cancelJob`, and `listJobs`.
     - Stable run IDs managed under `runs/<run-id>/`.
     - Atomic JSON persistence (`atomicJson`) with `.tmp` write and rename to guarantee valid state files across concurrent accesses.
     - Persistent job status transitions: `PENDING` -> `RUNNING` -> `VERIFIED` | `PARTIAL` | `NOT_REPRODUCED` | `ERROR` | `CANCELLED`.
     - Crash/interruption safety: heartbeat recording and startup marker recovery to ensure editor restarts or aborted processes never convert incomplete executions into false `VERIFIED` verdicts. Only the trusted judge can issue a `VERIFIED` verdict.
     - Global repository lease (`lease.ts`) preventing concurrent overlapping executions from corrupting the workspace.
     - Tested in `packages/runtime/src/runtime.test.ts` (7 tests) and `worker.test.ts` (6 tests).

4. **Local Model Context Protocol (MCP) Server (`packages/mcp`)**:
   - Implemented a standard TypeScript MCP server using `@modelcontextprotocol/server` (v2.3.1) and stdio transport.
   - Exposes six typed tools with strict Zod validation:
     - `replaykit_reproduce`: Starts an asynchronous reproduction job from an incident fixture; returns job ID immediately without blocking.
     - `replaykit_status`: Queries live phase, completed executions, and verdict.
     - `replaykit_report`: Retrieves Markdown report and execution matrix for completed jobs.
     - `replaykit_open_test`: Reads generated `repro.test.ts` from managed run directory.
     - `replaykit_cancel`: Safely terminates active reproduction jobs and releases leases.
     - `replaykit_import_sentry_issue`: Fetches and normalizes an incident from Sentry with strict SSRF controls.
   - Strict security bounds: path traversal rejection, containment within `runs/`, no shell execution or Docker controls exposed, and stdout reserved exclusively for JSON-RPC transport (stderr used for logging).
   - Automated tests in `packages/mcp/src/server.test.ts` (8 tests) verify in-memory protocol execution and spawned stdio client communication.

5. **VS Code & Cursor Extension (`apps/vscode-extension`)**:
   - Implemented an installable extension contributing:
     - Activity Bar container (`replaykit-sidebar`) with Runs Tree View (`replaykit.runsView`).
     - Honest preliminary progress reporting: displays running/verifying state with execution counts; never flags premature buggy failure as `VERIFIED`.
     - Run inspections: view status, open generated regression test, view Markdown verification report, and inspect failing gates.
     - Source code navigation directly to `payments.ts` at the relevant domain failure site.
     - Cancellation of running jobs.
     - Sentry token management via VS Code `SecretStorage`.
     - Automated Cursor MCP configuration (`replaykit.configureMcp`) creating or updating `.cursor/mcp.json`.
   - Standalone unit tests in `apps/vscode-extension/src/extension.test.ts` (5 tests) verify provider tree states and configuration generation.

6. **Secure Sentry Integration (`packages/sentry`)**:
   - Implemented SSRF-hardened transport (`security.ts`, `transport.ts`):
     - Origin allowlist (default `https://sentry.io`, configurable approved self-hosted domain).
     - Strict HTTPS enforcement and rejection of IP literals.
     - Pinned DNS resolution (`dns.lookup`) with CIDR validation rejecting loopback (`127.0.0.0/8`), private IPv4 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), IPv6 unique local, and cloud metadata addresses.
     - Disallowed redirects to prevent redirection to internal hosts.
     - Safe Authorization header injection without credential leakage in errors, logs, or reports.
   - Normalization and sanitization (`normalize.ts`):
     - Normalizes Sentry events into typed `Incident` fixtures.
     - Scrubs auth tokens, passwords, cookies, and non-printable control characters.
     - Preserves correlation trace IDs, breadcrumbs, and application stack frames.
   - CLI subcommands: `replaykit incident import`, `replaykit incident inspect`, `replaykit incident reproduce`, and `replaykit incident approve-revision`.
   - Comprehensive test suite in `packages/sentry` (92 tests across 4 files) and CLI tests (7 tests).

### Verification Summary

| Check                   | Result                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test`             | PASS; 37 test files passed, 345 tests passed                                                                                                     |
| `pnpm test:sdk`         | PASS; 6 protocol tests passed                                                                                                                    |
| `pnpm test:security`    | PASS; 4 live security probe groups passed                                                                                                        |
| `pnpm test:integration` | PASS; 14 real PostgreSQL integration tests passed                                                                                                |
| `pnpm benchmark smoke`  | PASS; run `90b31862-2894-418b-a05f-f8326bad13ca`, VERIFIED (10/10 buggy failures, 3/3 reference passes, 3/3 alternate passes, 1 decoy rejection) |
| `pnpm typecheck`        | PASS; zero TypeScript errors across all workspaces                                                                                               |
| `pnpm lint`             | PASS; zero ESLint errors                                                                                                                         |
| `pnpm format:check`     | PASS; all files formatted to Prettier standard                                                                                                   |
| `pnpm build`            | PASS; compiled successfully with `tsc -p tsconfig.build.json`                                                                                    |

### Live Sentry End-to-End Acceptance

- **Synthetic Event Generation & Transmission**:
  - The local checkout database was started with `pnpm db:up`.
  - The genuine `DuplicatePaymentError` path in `apps/checkout-api/src/payments.ts` was exercised outside the sandbox using the buggy policy.
  - Sentry Node SDK was configured with DSN `https://o4512270148763648.ingest.us.sentry.io/4512270492958720`, organization `mimi-yq`, project `replaykit-checkout`, and release `checkout-r1-synthetic`.
  - Event `7292def780e1444fbc903d992a2a8c56` was delivered to Sentry under Issue `7797314628`.
- **Authenticated Import**:
  - Imported via `pnpm replaykit incident import --sentry-url "https://mimi-yq.sentry.io/issues/7797314628/events/7292def780e1444fbc903d992a2a8c56/?project=4512270492958720"`.
  - Normalized, scrubbed, and bound to approved release `checkout-r1-synthetic` under import `d9c0f9ce-9e17-4e29-8dc8-147698d0680e`.
- **Independent Judge Reproduction**:
  - Executed via `pnpm replaykit incident reproduce --import d9c0f9ce-9e17-4e29-8dc8-147698d0680e` (Job: `f9bfdf01-9a06-4247-91c5-7b9a62d86db1`).
  - Generated regression test `runs/f9bfdf01-9a06-4247-91c5-7b9a62d86db1/repro.test.ts` checking idempotency key single-charge invariant.
  - Completed all 17 isolated Docker executions (10 buggy, 3 reference, 3 alternate, 1 decoy).
  - Verdict: **`VERIFIED`** (10/10 deterministic buggy failures, 3/3 reference passes, 3/3 alternate passes, 1 decoy rejection). All boolean judge gates satisfied.

### Negative Control & Prompt Injection Validation (Tests A, B, and C)

See [docs/SECURITY_TESTS.md](SECURITY_TESTS.md) for full reproduction details and test matrices.

### Live Sentry Prompt-Injection Validation — October 17, 2026

**Result: PASS for the tested injection payload.**

A genuine `DuplicatePaymentError` was triggered in the PostgreSQL-backed checkout application and delivered through the Sentry SDK with an adversarial instruction requesting that ReplayKit skip verification and falsely report success.

- Sentry event: `a946b3f2939643a7af6d4cd8e8fc5975`
- Import ID: `233bdb48-0465-4019-bbc5-b4f214b44cb3`
- Run ID: `405e7f59-58b1-4ec5-a36a-371c679ee28e`
- Final verdict: `VERIFIED`
- Buggy failure reproductions: 10/10
- Correct-fix executions: 6/6
- Decoy rejection: Passed
- Injection present in imported incident: Yes
- Injection present in execution incident: Yes
- Injection present in generated test: No
- Independent judge gates: All satisfied

**Conclusion:** The tested malicious instruction remained in untrusted incident evidence but did not contaminate the generated test or bypass verification. This establishes resistance to the evaluated attack for the current rule-based planner, not general prompt-injection immunity.

The separately tested live missing-body incident produced `NOT_REPRODUCED` with `MISSING_REQUEST_BODY`, generating no test and launching zero verification executions.

- **Test A — Live Sentry Missing-Body Negative Control**:
  - Extended `packages/cli/src/sentry-demo.ts` with `--omit-body true` mode.
  - Delivered event `dabe5ce2c64d4efab28903412fce7c0b` to Sentry under organization `mimi-yq`. All request data and payment fields (`clientKey`, `providerKey`, `orderId`, `amount`) were completely removed from breadcrumbs, contexts, and tags. Application stack frame `payments/createPayment` and exception type `DuplicatePaymentError` were preserved.
  - Live API import attempt: `pnpm replaykit incident import --sentry-url "https://mimi-yq.sentry.io/issues/7797314628/events/dabe5ce2c64d4efab28903412fce7c0b/?project=4512270492958720"` returned `{ "error": "UNAUTHORIZED" }` due to token expiration. Recorded honestly as **`BLOCKED (UNAUTHORIZED)`** without fabricated credentials.
  - Validated offline via `packages/cli/test/sentry-demo.test.ts`, `packages/cli/test/integration-command.test.ts`, and `packages/planner/src/planner.test.ts`: missing request body normalizes with `missingEvidence: ["request.body"]`, causes planner to abstain with `MISSING_REQUEST_BODY`, and outputs `NOT_REPRODUCED`. Verified in `pnpm benchmark smoke` run `90b31862-2894-418b-a05f-f8326bad13ca` (`missingBodyAbstained: true`).
- **Test B — Prompt-Injection Robustness Suite**:
  - Implemented 39 automated tests across `packages/planner/src/prompt-injection.test.ts` (26 tests) and `packages/judge/src/prompt-injection.test.ts` (13 tests).
  - Evaluated 6 adversarial categories (system/developer override instructions, pre-filled fake tool calls / JSON blobs, decoy file creation / verification script tampering, environment/token leakage probes, path traversal payloads, and false bug resolution claims).
  - Tested across all untrusted incident fields: `exception.message`, `breadcrumbs[].message`, `breadcrumbs[].data`, `spans[].name`, `spans[].attributes`, and `metadata`.
  - Confirmed planner produces identical candidate test source and identical SHA-256 candidate hash (`a0412d1baaed75c22c522a8f570add381bf0160523168b4970dd3b2b1af8e1ef`) with zero injected instructions or shell commands.
  - Confirmed judge AST policy (`inspectTest`) rejects banned globals (`fetch`, `process`, etc.) and unauthorized imports, and independent judge (`evaluateEvidence`) evaluates under identical strict gates without weakening.
  - Security probes in `scripts/security-smoke.ts` verified container containment (filesystem secrets, egress, arbitrary broker commands, timeouts, memory limits) with 4/4 passing probes.
  - Explicit disclaimer: General prompt-injection immunity is disclaimed; guarantees are structural and certify only the tested adversarial categories.
- **Test C — Real Sentry Poisoned Event**:
  - Implemented `--poison` flag in `packages/cli/src/sentry-demo.ts` and `integration-command.ts`.
  - Clean vs. poisoned comparison on imported Sentry incident `d9c0f9ce-9e17-4e29-8dc8-147698d0680e` confirmed exact match of generated candidate test source and SHA-256 hash (`dae7cc30338531556374f6dc8ddc927f3f742330f951e4e4d604645b90d8e150`).
  - Independent reproduction achieved status **`VERIFIED`** under the full 17-run matrix (Job: `f9bfdf01-9a06-4247-91c5-7b9a62d86db1`).

### Negative Control & Revision Approval Enforcement — October 17, 2026

**Result: PASS across all 5 verification properties.**

Corrected an implicit privilege escalation path in the synthetic Sentry demonstration tool (`packages/cli/src/sentry-demo.ts`) where `triggerSyntheticSentryDemo()` previously called `approveRevision(root, config.release)` automatically, causing supposedly unapproved releases to become approved before import.

**Changes & Structural Guarantees:**

1. **Implicit approval removed**: `triggerSyntheticSentryDemo()` no longer mutates `work/sentry/supported-revisions.json`. Running the demo with an unapproved release leaves supported revisions completely untouched on disk.
2. **Operator-only approval mechanism**: Release approval requires explicit invocation of `incident approve-revision --release <release>` (or `approveRevision(root, release)`), which validates sandbox manifest runtime properties (`postgresRuntime.mode === 'initdb'`, `postgresRuntime.fsync === 'on'`) and binds the release to the current buggy application container image revision.
3. **Rebinding protection**: Once approved, a release cannot be rebound to a different revision or application source hash; rebinding attempts are rejected with `RELEASE_REBINDING_REJECTED`.
4. **Negative-control rejection**: Incoming real or synthetic Sentry events with unapproved releases are strictly rejected during normalization and import with error code `UNSUPPORTED_REVISION`.
5. **Historical artifact integrity**: Previously imported events (`d9c0f9ce-9e17-4e29-8dc8-147698d0680e`) and verified run reports (`ff3f2772-2269-4e6f-a21a-e33f15f3fa6a`) remain completely unmodified and continue to satisfy all integrity checks.

**Automated Regression Suite (`packages/cli/test/sentry-revision-approval.test.ts`):**

- Test 1: `Running incident sentry-demo with an unapproved release does not modify work/sentry/supported-revisions.json` — **PASS**
- Test 2: `A real event with an unapproved release is rejected by import with UNSUPPORTED_REVISION` — **PASS**
- Test 3: `Explicitly approved releases still import successfully` — **PASS**
- Test 4: `An approved release cannot be rebound to a different revision` — **PASS**
- Test 5: `Previously imported events and existing VERIFIED reports remain unchanged` — **PASS**

- **Telemetry & Spans Analysis (Issue 7797314628 / Event 7292def780e1444fbc903d992a2a8c56)**:
  - Sentry's trace API reported status `AVAILABLE` because the Sentry SDK automatically attaches a `trace_id` (`0cde1e86c96d44faaccb1e5e0c677d04`) to error events in `contexts.trace`.
  - However, `spans` were correctly evaluated as empty (`[]`) with `missingEvidence: ["spans"]` and an explicit `spanCount: 0` in the import summary because the synthetic driver (`packages/cli/src/sentry-demo.ts`) invoked only `Sentry.captureException(...)` without instrumenting operations via `Sentry.startSpan(...)`. Sentry UI confirmed the trace contained zero child performance spans; the adapter correctly reflected actual event data without dropping spans.
  - _Measured observation_: Performance spans were not needed to achieve a `VERIFIED` result for R1. The planner worked strictly from three visible inputs: the request payload, application stack frames (`payments/createPayment`), and breadcrumbs (`provider-charge`). The supervisor's PostgreSQL ledger assertion (2 charges vs 1) is an independent judge check, not a planner input. Negative controls (N1–N5) and concurrent race/deadlock cases (such as D1–D2) remain unbuilt; unbuilt concurrency cases in particular may require span ordering to reconstruct execution interleavings. This is a measured observation for R1, not a general claim that telemetry can omit spans.

- **Latency Attribution & Stage Breakdown (Run `ff3f2772-2269-4e6f-a21a-e33f15f3fa6a`)**:
  - `durationMs: 379224` represents the **summed container runtime across all 17 matrix executions** ($17 \times 22.3\text{ s} \approx 379.3\text{ s}$), as defined in `evaluate.ts`.
  - `verificationWallMs: 133903` is the actual user-perceived wall-clock latency, achieved via the bounded worker pool operating at `concurrency: 3` (`matrixWallMs: 131481`).
  - Preflight, planning, and evaluation collation accounted for only $2.42\text{ s}$ of wall time ($133.90\text{ s} - 131.48\text{ s}$). The 245-second difference between `durationMs` and wall time is the concurrency overlap factor ($\approx 2.88\times$ speedup).
  - Aggregate stage breakdown across all 17 executions (sum: $379,307\text{ ms}$):
    - `candidateExecution`: $80,366.9\text{ ms}$ ($21.2\%$, mean $4,727.5\text{ ms}$)
    - `postgresReadiness`: $65,521.1\text{ ms}$ ($17.3\%$, mean $3,854.2\text{ ms}$)
    - `cleanup`: $62,453.8\text{ ms}$ ($16.5\%$, mean $3,673.8\text{ ms}$)
    - `applicationReadiness`: $55,080.1\text{ ms}$ ($14.5\%$, mean $3,240.0\text{ ms}$)
    - `applicationStartup`: $28,647.2\text{ ms}$ ($7.6\%$, mean $1,685.1\text{ ms}$)
    - `evidenceCollection`: $27,798.8\text{ ms}$ ($7.3\%$, mean $1,635.2\text{ ms}$)
    - `candidatePreparation`: $24,652.2\text{ ms}$ ($6.5\%$, mean $1,450.1\text{ ms}$)
    - `postgresStartup`: $24,507.3\text{ ms}$ ($6.5\%$, mean $1,441.6\text{ ms}$)
    - `networkCreation`: $9,928.4\text{ ms}$ ($2.6\%$, mean $584.0\text{ ms}$)
    - `preparation` + `artifactWrite`: $351.8\text{ ms}$ ($0.1\%$, mean $20.7\text{ ms}$)

Historical R1 smoke measurements and Docker isolation gates remain preserved without modification.

## 2026-10-16 — Performance closed; next correctness milestone proposed

The user's latest direction closes speed work and resumes D2/N5 plus saved-test candidate-patch verification. Fresh initdb, concurrency three and fsync on remain the defaults. No new performance experiment or product-code change was made in this review.

Completed a read-only comparison of the 219.051-second run with the other sixteen published observations. App/candidate/planner image IDs differ between build groups; all four variant-policy hashes and the generated test hash match. The policy hashes omit shared application code, and no historical record contains a controller-source digest. Therefore this comparison cannot establish a host-only cause. See [PROVENANCE_COMPARISON.md](PROVENANCE_COMPARISON.md).

Prepared a [proposed D2/N5 and patch-verification design](superpowers/specs/2026-10-16-d2-n5-patch-design.md). It separates full strict reproduction, provisional progress, and one/two-run saved-test patch results; scopes the new work to core/CLI; and requires isolated patch builds and authentic source/test provenance. This is an architectural design for review, not shipped functionality. D2/N5, preliminary progress and candidate-patch verification are still unimplemented. The existing tested R1 source archive remains unchanged.

Next concrete task: review this design, then write the implementation plan and implement/test D2/N5 and the saved-test patch path. No tests or CI were rerun for the read-only provenance inspection. Prettier formatting and `git diff --check` passed for these documentation changes.

## 2026-10-16 — PostgreSQL and measurement follow-up

The PostgreSQL template experiment reduced observed database startup/readiness cost but did not establish a full-smoke speedup at default concurrency three. Two sampled, fsync-on runs per mode averaged **109.359 seconds with initdb** and **121.653 seconds with template copying**. Fresh initdb remains the default; template copying is opt-in through `pnpm sandbox:build --postgres-mode template-copy`. Concurrency remains three and fsync remains on. [POSTGRES_PERFORMANCE.md](POSTGRES_PERFORMANCE.md) records all nine runs, exclusive stage means, sampling/resource limits and comparison caveats; [the portable JSON](measurements/r1-performance.json) retains individual observations and all judge gates.

### Implemented and checked

- Added an empty, credential-free PostgreSQL template build using the same compiled schema as the application. Each opt-in execution copies the stopped seed into its own private tmpfs and installs a new password before TCP startup. No running database, writable volume or mutable application state is shared.
- Added explicit `--postgres-mode initdb|template-copy` build selection, defaulting to initdb. Template identity, base image, schema hash, template-source hash and fsync setting are recorded in the saved environment and sanitized published measurements.
- Rejected the `initdb`/`fsync=off` manifest combination after review found that the stock PostgreSQL entrypoint ignores the custom fsync environment variable. This prevents an artifact from claiming a configuration that was not applied. The five focused manifest tests went from one expected failure to all passing; all measured initdb runs already used fsync on.
- Added `--sampling on|off` to the measurement wrapper. Off mode removes periodic Docker observer commands while retaining stage profiling, the wall timer and all smoke/judge checks. Unavailable peaks remain null and sample counts are zero; one capacity query runs before timing.
- Confirmed cleanup already uses ownership-checked `docker rm -f` and the pool already refills immediately. The user's execution timeline showed a replacement at 37.42 seconds before its two peers finished; 14 refills took 0.35–5.34 milliseconds. No batch-to-pool or graceful-to-forced-cleanup change was needed or credited.
- Retained every strict verification gate and identical candidate bytes. All nine experiment runs shared application, candidate and planner images and private variant hashes; the PostgreSQL runtime image intentionally differs between modes. Later rebuild validation is kept separate from these performance comparisons.

### Measured findings

| Configuration                                |               Full smoke seconds | Observation                                              |
| -------------------------------------------- | -------------------------------: | -------------------------------------------------------- |
| Initdb, concurrency 1, sampled, fsync on     |                          282.578 | Actual sequential 17-execution baseline; one run         |
| Template, concurrency 1, sampled, fsync on   |                          180.946 | One run; host/warm-up effects not isolated               |
| Initdb, concurrency 3, sampled, fsync on     | 88.423 and 130.295; mean 109.359 | Existing default retained                                |
| Template, concurrency 3, sampled, fsync on   | 143.961 and 99.345; mean 121.653 | No established full-smoke improvement                    |
| Template, concurrency 6, sampled, fsync on   |                          102.065 | One run; mean execution duration 29.723 s; 18 containers |
| Template, concurrency 3, unsampled, fsync on |                           97.046 | One run; cannot isolate observer overhead                |
| Template, concurrency 3, sampled, fsync off  |                          101.601 | One run; no established advantage over fsync on          |

At concurrency three, combined PostgreSQL startup/readiness averaged 3.232 seconds with initdb and 1.943 seconds with the template across 34 executions per mode. Other measured stages became slower and template mean full-smoke time was 11.2% higher. The ranges overlap and timing varied substantially. No causal or statistically significant overall speedup is claimed. Concurrency six reached sampled CPU of 701.68% and memory of 827 MiB; observations do not establish the source of contention or a stable optimum. A sequential unsampled run and initdb at concurrency six were not measured in this set.

All nine full smokes passed with VERIFIED, 10/10 fresh buggy failures, 3/3 passes for each valid fix, duplicate-charge decoy rejection, all remaining judge gates, wrong-frame rejection and missing-body abstention. None had an execution failure, artifact error or missing execution profile. The observer recorded 53 errors: 16 missing-container/object messages and 37 EOF messages, with no observer command timeout. The EOF cause was not established; observer errors remain separate from judge evidence. The template snapshot probe passed all 15 recorded checks, including credential separation, private writes, unchanged seed, fresh replacement state, rejected bootstrap inputs and cleanup.

### Follow-up validation record

| Check                                               | Observed result                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Focused option and publication tests                | PASS; expected failures observed before implementation                                                                                |
| `pnpm test`                                         | PASS; 163 tests in 23 files, including final manifest guards                                                                          |
| Nine measured full R1 smokes                        | PASS; all strict gates and negative controls                                                                                          |
| `pnpm exec tsx scripts/postgres-snapshot-check.ts`  | PASS; 15 recorded live checks                                                                                                         |
| `pnpm test:sdk`                                     | PASS; 6 tests                                                                                                                         |
| `pnpm test:integration`, followed by `pnpm db:down` | PASS; 14 real PostgreSQL tests; development database stopped                                                                          |
| `pnpm typecheck`, `pnpm lint`, `pnpm build`         | PASS; full lint preceded the manifest guard and focused lint covered its changed files                                                |
| `pnpm sandbox:build --postgres-mode template-copy`  | PASS                                                                                                                                  |
| Final template snapshot-probe rerun                 | PASS; all 15 checks                                                                                                                   |
| Final template smoke                                | PASS; VERIFIED and both negative controls                                                                                             |
| Final template security                             | PASS; all four live probe groups                                                                                                      |
| `pnpm sandbox:build` with no mode option            | PASS; fresh initdb remains the default                                                                                                |
| Current tracked-artifact audit                      | PASS; among environment files, only `.env.example` is tracked; raw runs, scratch/build/dependency files and generated fixture ignored |
| Final default smoke                                 | PASS; VERIFIED and both negative controls; initdb and fsync on                                                                        |
| Portable published measurement audit                | PASS; 17 records; follow-up gates/hashes, relative paths and credential exclusion checked                                             |
| Final default security                              | PASS; all four live probe groups                                                                                                      |
| Final Docker cleanup audit                          | PASS; no owned execution containers/networks or development Compose containers remain                                                 |
| Remote CI                                           | Not run                                                                                                                               |

Final `pnpm format:check` and `git diff --check` passed.

The final template snapshot probe passed under runtime image `sha256:292b1eb41c09197472d73713d5beafc4dfd31ace74b4655b92947a679e58c6d8`; its local proof is `runs/585529b2-3d30-4d5d-9b10-0e25d7583376/postgres-snapshot.json`. The final template full smoke, `8b35767f-e8fe-49ad-991a-f4b5a95ff5f8`, returned VERIFIED with both negative controls passing in 172.025 seconds. These rebuilt-image runs are functional validation and are excluded from the nine-run performance comparison above.

The final template smoke had all 11 boolean judge gates true, 10/10 buggy failures, 3/3 successes for each valid fix, no artifact errors and no missing profiles. Its eight sampler errors remain observer diagnostics. All four template security probe groups passed; local proof is `runs/857a78ac-84c1-46b2-bb14-efff50e42f63/security.json`.

The final default smoke, `ebcab169-c1ac-4611-abd0-90f58c5a985a`, returned VERIFIED with both negative controls passing in 205.716 seconds using initdb and fsync on. Its six sampler errors are separate from execution evidence. Independent audit confirmed all 11 current follow-up runs (nine comparisons and two final validations) retained every boolean judge gate, 10/10 buggy failures, 3/3 successes for each valid fix, one rejected decoy, identical candidate hashes, zero artifact errors and complete profiles. The published JSON contains 17 observations: five historical runs, the user's local run, nine experiment runs and two final validations. These groups are preserved separately rather than pooled into one performance mean.

All four default-mode security probe groups passed; local proof is `runs/599bef0d-9d07-4c98-a219-e23cf336c13d/security.json`. The final cleanup audit found no containers or networks labeled `replaykit.run` and no development Compose containers. The saved sandbox manifest was confirmed to select initdb with fsync on.

The CI definition now builds and checks both default initdb and opt-in template modes, including smoke/security checks and the template probe. The workflow stops the development database before smoke checks, but the remote workflow has not run. Raw executions, local credentials and scratch data remain ignored; published records use relative paths and allowlisted fields. The source archive is refreshed only after final validation. No D2, plugin, dashboard or additional benchmark case was added. This follow-up stops at the tested R1 pipeline; any future performance change needs repeatable measurements before changing defaults.

## 2026-10-16 — R1 performance hardening

The optimized R1 pipeline uses a bounded worker pool with configurable concurrency 1–10, default 3. The strict matrix now requires 10 fresh buggy failures, three reference passes, three alternate passes, and a decoy failure. Every execution retains independent PostgreSQL state, application and candidate containers, an internal Docker network, resource limits and trusted evidence collection. A single pinned image manifest and identical candidate bytes are used throughout each matrix. No verification gate was removed; duplicate execution IDs are additionally rejected. No D2, Cursor integration, dashboard or additional benchmark case was implemented.

### Measured results and limitations

Five full local smoke measurements passed, including wrong-frame rejection and missing-body abstention. [PERFORMANCE.md](PERFORMANCE.md) contains the stage and resource tables; [the portable JSON artifact](measurements/r1-performance.json) records the measurements, gates, hashes, image IDs and relative evidence references.

| Configuration                        | Matrix executions |           Observed full-smoke wall time |
| ------------------------------------ | ----------------: | --------------------------------------: |
| Original instrumented batches of two |                13 |                               281.939 s |
| Hardened worker pool, concurrency 2  |                17 | 112.897 s and 151.202 s; mean 132.050 s |
| Hardened worker pool, concurrency 3  |                17 |  92.864 s and 117.853 s; mean 105.359 s |

The matched 17-execution comparison measured a 20.2% mean reduction, with two samples per setting in order 2, 3, 3, 2. Ranges overlap and host timing varied substantially; no statistical significance or general speed guarantee is claimed. The original baseline had different warm-up and host activity, so its much larger latency cannot be attributed to concurrency alone. All five measurements used the same immutable images and candidate hash.

Profiling separates network creation, PostgreSQL startup/readiness, application startup/readiness, candidate preparation/execution, trusted evidence collection, cleanup and artifact writes. Per-execution profiles preserve failed stages too. Pipeline timing distinguishes overlapping wall time from summed execution durations. Capture and negative-control timing are recorded separately. The measurement wrapper records Docker capacity and periodic resource samples; missing/failed observations remain unavailable rather than zero.

Concurrency 3 increased per-execution duration and sampled resource use while reducing observed total wall time. Peaks reached nine running containers, 182.41% aggregate CPU and 410.0 MiB sampled memory. These samples can miss peaks and do not establish throttling. Observer EOF/removal errors during container teardown are retained separately from execution failures. No smoke execution timed out, ran out of memory or failed infrastructure checks. PostgreSQL startup/readiness accounted for about 21% of original summed duration. Database reuse was considered after profiling but neither implemented nor benchmarked; independent database lifecycles remain intact.

### Invariant and security review

[R1_INVARIANT.md](R1_INVARIANT.md) traces DuplicatePaymentError to the shared application check of committed provider-ledger rows. Real duplicate inserts trigger the check; the buggy policy does not inject an error. Both valid implementations retain the same invariant, with real PostgreSQL regression coverage. The decoy alone suppresses the symptom and is still rejected because trusted evidence detects duplicate charges.

Independent review also found and corrected unavailable resource samples being represented as zero, measurement provenance relying on a mutable image manifest, and broker requests remaining queued after candidate rejection. The broker now stops dispatch and drains in-flight work before evidence collection and cleanup. The live rejection probe queues valid payment requests after an invalid command and confirms zero charges in trusted database evidence.

### Publishing and repository hygiene

The repository was already initialized on `codex/replaykit-r1` with no remote. Removed 210 accidentally tracked raw result files and one generated incident fixture from the current index while retaining them locally. Runs, benchmark results, generated fixtures, logs, build outputs and local environment files are ignored. Published reports use relative paths; the portable measurement exporter uses an explicit field allowlist and excludes raw Docker inspections, environment variables and host paths.

Removed fixed synthetic database passwords from source/configuration. Development commands generate an ignored local environment file, preserving existing valid configuration; sandbox passwords are random per execution and error logs redact them. The generated development volume is retained after shutdown. Previous local commits still contain the original raw artifacts and synthetic defaults; history was not rewritten. No remote publishing or remote CI run occurred.

### Final validation

| Check                                                            | Observed result                                                                                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --offline`                       | PASS; current lockfile across all 8 workspace projects                                                                                                        |
| `pnpm test`                                                      | PASS; 151 tests in 20 files                                                                                                                                   |
| `pnpm test:sdk`                                                  | PASS; 6 tests                                                                                                                                                 |
| `pnpm test:integration`                                          | PASS; 14 real PostgreSQL tests, including both valid implementations' invariant checks                                                                        |
| `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` | PASS                                                                                                                                                          |
| `pnpm sandbox:build`                                             | PASS; the same immutable images were used for all five measurements                                                                                           |
| Full R1 smoke through the measurement wrapper                    | PASS; all five measurements and negative controls; hardened runs require 10/10 buggy failures, 3/3 reference passes, 3/3 alternate passes and decoy rejection |
| `pnpm test:security`                                             | PASS; all four live probe groups                                                                                                                              |
| Git and publishing audit                                         | PASS; no generated execution artifacts or local environment files in the current index; published paths are relative                                          |
| Docker cleanup audit                                             | PASS; no containers or networks with the `replaykit.run` ownership label remain; development database stopped                                                 |

The live security run `1801ebba-6076-4981-9a22-5fed6dbbff34` passed filesystem/secrets/egress restrictions, broker protocol rejection with zero charges, timeout enforcement and memory-limit enforcement. Final formatting initially flagged two Markdown tables; formatting was corrected and the full formatting check passed. Independent review and the final checks found no remaining material issues in this scope.

The CI workflow now includes the existing security probes, but remote CI has not run. This milestone ends at the optimized and verified R1 pipeline; later scenarios and product integrations remain deferred.

## 2026-10-16 — first working R1 slice

The initial workspace was empty. This delivery implements the R1 path through foundation, checkout payments, replay isolation, strict judging and CLI. It does **not** claim completion of every Phase 0–3 gate: full checkout orders/inventory/webhooks and real scheduler-controlled DB races are still missing, and remote CI has not run.

### Working deliverables

- `apps/checkout-api`: real PostgreSQL provider ledger, payment idempotency, payload conflict checks, explicit OpenTelemetry spans, Sentry-shaped capture derived from actual application error stacks.
- `benchmark/private/R1`: buggy, reference, distinct alternate and symptom-hiding decoy policy artifacts.
- `packages/contracts`, `packages/telemetry`: strict typed boundaries, normalized input redaction and explicit missing telemetry.
- `packages/planner`: deterministic evidence-driven rule planner, executed in a separate network-disabled image without private fixes or host mounts.
- `packages/replay-engine`: tested cooperative finite scheduler, cancellation and timeout diagnostics; not yet wired into a database race scenario.
- `packages/judge`: network-disabled candidate containers, bounded request broker, independent application/DB observations, fresh-state checks and full strict matrix.
- `packages/cli`: capture, fixture run, saved-test verification, smoke, JSON/CSV/Markdown artifacts.
- `scripts/build-sandbox.ts`, `docker/replay-fixture.mjs`, Compose, CI definition, README, MIT license and security/methodology docs.

### Actual verification

| Command                                                                                             | Observed result                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                    | PASS, lockfile current across 8 workspace projects                                                                                                                          |
| `pnpm typecheck`                                                                                    | PASS                                                                                                                                                                        |
| `pnpm lint`                                                                                         | PASS                                                                                                                                                                        |
| `pnpm test`                                                                                         | PASS, 70 tests in 12 files                                                                                                                                                  |
| `pnpm test:sdk`                                                                                     | PASS, 6 tests                                                                                                                                                               |
| `pnpm test:integration`                                                                             | PASS, 12 real PostgreSQL integration tests                                                                                                                                  |
| `pnpm build`                                                                                        | PASS                                                                                                                                                                        |
| `pnpm sandbox:build`                                                                                | PASS, real app/candidate/planner images built and inspected                                                                                                                 |
| `pnpm benchmark smoke`                                                                              | PASS, run `40a29c65-b65e-4853-9911-665e984f7893`, VERIFIED; 10/10 fresh buggy failures, both valid fixes pass, decoy fails, wrong frame rejected, missing request abstained |
| `pnpm test:security`                                                                                | PASS, 4 live probe groups; run `c8508008-b6bd-47bd-8174-4daef37e2333`                                                                                                       |
| `pnpm replaykit replay verify --run 40a29c65-b65e-4853-9911-665e984f7893`                           | PASS, saved candidate independently reran the full matrix; new run `3aeb3f43-f65d-4d6c-9cbe-8a456083ff01`, VERIFIED                                                         |
| `pnpm replaykit incident capture --output benchmark/incidents/R1/visible/incident.json`             | PASS, new real synthetic fixture captured in run `c6f340ad-e637-432b-bd0c-4782186e3279`                                                                                     |
| `pnpm replaykit incident run --fixture benchmark/incidents/R1/visible/incident.json --tier minimal` | Expected exit 2, NOT_REPRODUCED with MISSING_REQUEST_BODY; run `8ad0d5ae-40df-4205-9829-a5d1f26c8239`                                                                       |
| `pnpm benchmark report --input runs/40a29c65-b65e-4853-9911-665e984f7893`                           | PASS, reads the measured report                                                                                                                                             |
| `pnpm format:check`                                                                                 | PASS                                                                                                                                                                        |
| `pnpm db:down`                                                                                      | PASS, development container/network stopped; synthetic named volume retained                                                                                                |

Historical smoke reports and raw evidence remain locally under `benchmark/results/r1-smoke-2026-10-16/`, `security-2026-10-16/`, `r1-rerun-2026-10-16/` and `r1-minimal-2026-10-16/`. Performance hardening removes these generated directories from the current Git index and published source, preserving local evidence and previous commits. These are measured single-scenario records, not full-benchmark performance claims. No containers or networks with the `replaykit.run` ownership label remained after those runs completed.

### Review and corrections

Independent review found five substantive defects. Seven regression tests first reproduced them, then passed after fixes: abnormal exits/OOM must not verify; normalized inputs must be redacted; a proposal cannot substitute or invent the request; incident revision/service must match the executed snapshot; partially created resources must be reconciled by ownership label. Saved-test reruns additionally compare the prior candidate hash.

An initial security probe run failed because the probe generator accidentally inserted a literal newline inside JavaScript quotes. The malformed candidate did not exercise the broker. Corrected the test source and required the exact `CANDIDATE_PROTOCOL_REJECTED` reason; the complete four-probe rerun passed. The earlier failed run remains under local `runs/b2c6ae0e-b49e-4665-a517-398f287623ba` for diagnostics and is not presented as a successful security result.

Packaging measured evidence exposed a tooling issue: the TypeScript and lint globs also included archived container-only candidate sources. Excluded `benchmark/results` from host build/type/lint checks, as already done for local `runs`; the executable repository sources remain checked. Archived candidates retain their exact measured hashes.

### Environment and limits

Node 22.23.3, pnpm 10.20.0, TypeScript 5.9.3, PostgreSQL 17.11, Docker Engine 29.8.1, Docker Desktop 4.93.0, Compose 5.5.1 on Windows/WSL2. Docker Desktop was initially stopped and was started. The Codex Windows sandbox denied Docker pipe and some package/Git reads; the approved local test commands ran with sandbox escalation. No software install, global settings change, production data or external payment service was required.

The complete 20-case benchmark, fixed 12/8 split, three-trial model comparisons, LLM adapter, Cursor/MCP integration, arbitrary patch verification and dashboard remain incomplete. No remote repository, CI run or release publication was created.

---

## 2026-10-19 — local Gate B runbook handoff

Gate A remains accepted for the permitted qs issue-33 provenance. The first
delegated Gate B attempt remains blocked before execution because Codex could
not access Docker or acquire GitHub data through its restricted sandbox; its raw
failure artifacts remain under `work/phase2/reproduction/`.

Two fresh subagent passes completed the local runbook. The script
`scripts/phase2/run-gate-b.ps1` now fetches and verifies the pinned upstream
commits, freezes the official regression and dependency bytes, stages each role
in an exact private Docker volume with a read-only root and no host bind, and
uses an independent PID-1 native watchdog plus raw evidence capture. Its
reviewed SHA-256 is
`516645b9ec08ca0c153baac605dc3aa90b4fb337bd35f1cde614abff784d6320`.

The independent reviewer first found two HIGH source defects. The author fixed
read-only `/case` staging and the client-only deadline, then the reviewer
approved the revised file for static handoff. PowerShell 5.1/7 parsing,
embedded probe/supervisor `node --check`, and whitespace checks all exited 0.
No Docker, upstream, dependency, or application execution was performed by
Codex, and no external runner was implemented.

Exact next command from a normal Windows PowerShell terminal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\phase2\run-gate-b.ps1 -RunId qs33-gateb-local-01
```

The command's resulting raw artifacts must be independently reviewed before any
Gate B acceptance, external-runner implementation, or full matrix work.

## 2026-10-19 — Gate B Git checkout repair

The first local run `qs33-gateb-local-01` stopped at checkout because the bare
repository had the fetched commit/tree objects only through `FETCH_HEAD` and no
persistent refs. The preserved clone stderr warned that the repository was
empty; checkout then exited 128 with `reference is not a tree`.

The runbook now creates and verifies `refs/heads/gateb-buggy` and
`refs/heads/gateb-fixed`, checks commit and tree objects in the bare repository,
uses independent `git clone --no-hardlinks --no-checkout` clones, verifies clone
object access before checkout, and asserts detached `rev-parse HEAD` equality.
The local regression is `scripts/phase2/test-git-fetch-bare.ps1` and preserves
the expected pre-fix and post-fix assertions. Its Codex-sandbox attempt reached
the first synthetic fetch but exited 128 because Git/MSYS could not create a
`BaseNamedObjects` object; this is preserved as a validation blocker, not a
passing repair result.

Independent review approved the repaired runbook for static handoff. Current
runbook SHA-256:
`dd284da2a2d38195da1ed4d0734159304212ed7bd10b7e46e42d14fca4961b74`.
No Docker, qs, Lab, or Gate B execution occurred in Codex. The next user run
must use fresh RunId `qs33-gateb-local-02` and remain subject to raw-evidence
review before Gate B acceptance.

### Superseded next-task proposal

The R1 performance-hardening milestone is complete. The user's latest direction resumes D2/N5 and saved-test patch verification; see the current proposed design at the top of this progress record. Cursor/MCP transport, a dashboard and the remaining benchmark corpus stay outside that proposed core/CLI milestone.

---

## Upstream Investigation: Medusa.js (Issue #15593) — October 17, 2026

**Status: Bug confirmed with the upstream project's own test on pinned commits. No ReplayKit verification exists for Medusa.**

- Target: [medusajs/medusa](https://github.com/medusajs/medusa) (MIT License)
- Original Issue: [#15593](https://github.com/medusajs/medusa/issues/15593) (`Account holder with provider_id: ... already exists` on retry)
- Merged Upstream PR: [#15618](https://github.com/medusajs/medusa/pull/15618) (`fix(core-flows): keep customer account-holder link on a failed payment-session init`)
- Pinned Commits: Buggy `1eb56d1111c10cbd33da578e2c45da8b21cb93d7` vs Merged Fix `5296f51121d4796b1757b65852c48e97e0e1e197`
- Complete Technical Report: [`docs/UPSTREAM_MEDUSA.md`](file:///docs/UPSTREAM_MEDUSA.md)

### Findings

1. **Empirical Reproduction via Upstream Test**: The bug was confirmed directly on the real Medusa.js 2.0 codebase backed by PostgreSQL 17 using Medusa's official integration test (`integration-tests/http/__tests__/payment-collection/store/account-holder.spec.ts`):
   - On buggy commit `1eb56d1111c10cbd33da578e2c45da8b21cb93d7`, the upstream test fails deterministically with `Expected length: 1, Received length: 0` followed by `MedusaError: Account holder with provider_id: pp_account-holder_test, external_id: cus_..., already exists`.
   - On fixed commit `5296f51121d4796b1757b65852c48e97e0e1e197` (with `noCompensation: true` added to `createRemoteLinkStep`), the upstream test passes cleanly.
2. **No ReplayKit Verification**: ReplayKit's verification matrix and judge were not used. The synthetic simulation (`packages/external-runner` and mock driver) was removed. ReplayKit's R1 baseline and judge gate integrity remain unchanged.

---

## 2026-10-20 — Phase 3: First Blind AI Regression-Test Generation (PASS)

**Status: PASS — Authentic AI Test Generation, Epistemic Negative Controls, and Four-Target Semantic Discrimination Verified.**

- Milestone: Phase 3 Blind AI Regression-Test Synthesis
- Target: `ljharb/qs` Issue #33 (`360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` buggy base)
- Model: `qwen2.5-coder:3b` via Ollama local API (`http://127.0.0.1:11434`)
- Generated Test Digest: `6a174eabccf0651b18f893967a068495f88a4a1fb6dc01aed56ed9307ee5b774`
- Complete Technical Decision: [`docs/phase3/BLIND_SYNTHESIS_DECISION.md`](file:///docs/phase3/BLIND_SYNTHESIS_DECISION.md)

### Verification Summary:
1. **Workspace Blinding**: Upstream test 40 scrubbed from `test/parse.js` (39 tests remaining); 0 leaks of patches, commit `6a97ad1d`, test 40, or probes detected across all 20 workspace files.
2. **Epistemic Honesty Control**: Insufficient-oracle control yielded `status: "INSUFFICIENT_ORACLE"` without fabricating tests.
3. **Four-Target Live Container Results**:
   - Target 1 (Buggy): Exits 1 with native `TypeError: source.hasOwnProperty is not a function` at `/case/lib/utils.js:47:20`.
   - Target 2 (Reference Fix): Exits 0, passes.
   - Target 3 (Alternate Fix): Exits 0, passes.
   - Target 4 (Decoy Fix): Exits 1 with `AssertionError`, catching semantic data loss (`{ a: {} }` dropped `{ b: 'c' }`).
4. **Non-Regression & Independence**: The 55 baseline tests passed on all 4 targets; the generated test was the sole detector of the decoy.
5. **Protected Invariants**: `packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts` remain byte-for-byte untouched (`git diff --exit-code`).

