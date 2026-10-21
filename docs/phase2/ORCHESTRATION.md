# ReplayKit Phase 2 orchestration

Started 2026-10-18 (America/Chicago). The user's newly supplied orchestration
instructions define this milestone: real upstream reproduction, reusable external
execution and independent verification. This supersedes the earlier numbered
Phase 2 CI-only outline; it does not authorize weakening R1 or restoring simulation.

## Stage gates

Current: Gate C **Architecture, Security, Evaluation & Runner Implementation**, following
independent review and acceptance of both authentic paired reproductions:
- `qs33-gateb-local-06` (scoped pass in [GATE_B_DECISION.md](GATE_B_DECISION.md))
- `qs33-gateb-local-07` (scoped pass in [GATE_B_LOCAL07_DECISION.md](GATE_B_LOCAL07_DECISION.md))

Both Gate B evidence collections remain untouched. Gate A candidate selection was
accepted on 2026-10-18. Gate C implements the trusted supervisor and target adapter
for qs #33 without routing through R1, passing measured evidence directly to
the existing external evaluator (`packages/judge/src/external.ts`). Gate D
will independently audit actual execution and matrix results. Gate E integrates
and validates. No full 10/3/3/1 matrix before runner and evaluator integration
passes QA.

## Agent roster and ownership

| Role / scheduled agent       | Owned files                                                                                    | Inputs / dependencies                                                                    | Acceptance                                                                                                                             | Status                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| A / phase2_research          | docs/phase2/agents/research.md; work/phase2/research/                                          | Primary upstream issues/fixes, prior failed preflights                                   | At most 3 JS/TS candidates, immutable revisions, feasibility ranking, real sources                                                     | Research turn safety-restricted; preservation-only closure requested, no retry                              |
| B / phase2_architecture      | docs/phase2/agents/architecture.md                                                             | Current CLI/runtime/planner/contracts/judge                                              | Read-only analysis, minimal interface and file ownership proposal                                                                      | Completed PARTIAL; lead read actual Markdown report                                                         |
| C / phase2_security          | docs/phase2/agents/security.md                                                                 | Isolation/provenance implementation, disk and Windows constraints                        | Concrete controls/negative tests; no R1 edits or Docker workloads                                                                      | Completed PARTIAL; lead read actual Markdown report                                                         |
| D / phase2_verification      | docs/phase2/agents/verification.md                                                             | Existing strict evaluators, independent from generation                                  | Identity/hash/counterfactual/decoy evidence criteria                                                                                   | Completed PARTIAL; lead read actual Markdown report                                                         |
| E / phase2_execution         | docs/phase2/agents/reproduction.md; work/phase2/reproduction/; outputs/phase2/gate-b/          | Gate A qs #33 pins and cached Node image                                                 | Two sequential, identical-condition upstream runs with raw outputs, exit/state, real production frame and official regression evidence | Completed BLOCKED; Docker access/review unavailable before execution; runner implementation remains blocked |
| F / gate_b_script_author     | scripts/phase2/run-gate-b.ps1                                                                  | Gate A pins, local PowerShell/Docker/Git/npm                                             | Concrete local evidence collector; no sandbox Docker execution                                                                         | Completed; script static checks pass; no runtime execution                                                  |
| G / gate_b_script_reviewer   | docs/phase2/agents/gate-b-runbook-review.md                                                    | Exact script hash and prior high findings                                                | Independent source/isolation/evidence/cleanup review                                                                                   | Completed APPROVED for static handoff; no runtime execution                                                 |
| H / gate_b_git_repair        | scripts/phase2/test-git-fetch-bare.ps1; docs/phase2/GIT_FETCH_REPAIR.md                        | Failed `qs33-gateb-local-01` checkout evidence                                           | Persistent bare refs, tree/object checks, independent clones and detached SHA assertions                                               | Completed; static review APPROVED; local regression blocked by sandbox Git/MSYS access                      |
| I / gate_b_lock_qa           | docs/phase2/agents/gate-b-lock-qa.md                                                           | Actual `qs33-gateb-local-02` lockfile, repaired script and validator                     | Independent review of JSON compatibility, dependency checks, provenance and safe local regression                                      | Completed; approved for a fresh local collection attempt only; no qs execution or Gate B pass               |
| J / gate_b_bind_qa           | docs/phase2/agents/gate-b-bind-qa.md                                                           | Saved `qs33-gateb-local-03` inspect/report, minimal bind repair and isolation regression | Independent null-array/count and Docker isolation review                                                                               | Completed; approved for fresh local collection only; Gate B blocked                                         |
| K / gate_b_inventory_qa      | docs/phase2/agents/gate-b-inventory-qa.md                                                      | Saved `qs33-gateb-local-04` manifests, raw buggy output, inventory repair and regression | Independent replay, strict comparison negatives, execution-identity and reviewed-hash audit                                            | Completed; approved for fresh local collection only; no fixed execution or Gate B pass                      |
| L / gate_b_lab_adaptation    | Read-only Lab 3.0.0 analysis                                                                   | Saved local-05 raw Lab failure and source                                                | Specify an exact eight-global compatibility rule without disabling unrelated leak detection                                            | Completed; predeclared adapter contract informed local-06                                                   |
| M / gate_b_per_test_analysis | Read-only TAP analysis                                                                         | Saved local-05 TAP, Lab reporter                                                         | Define per-test acceptance, child-exit and test-identity rules                                                                         | Completed; 56-ID TAP contract informed local-06                                                             |
| N / gate_b_local06_qa        | docs/phase2/agents/gate-b-local06-qa.md; docs/phase2/agents/gate-b-local06-execution-review.md | Frozen script hashes and actual local-06 raw artifacts                                   | Independent pre-run source audit and post-run raw-evidence verification                                                                | Completed; source review found no blocker and raw review accepted authentic paired reproduction only        |
| N2 / gate_b_local07_review   | docs/phase2/agents/gate-b-local07-execution-review.md; docs/phase2/GATE_B_LOCAL07_DECISION.md    | Saved raw local-07 artifacts, TAP streams, container inspects, 370 hashes                | Independent read-only verification; scoped Gate B PASS for authentic buggy/fixed pair                                                  | Completed; raw verification passed; scoped decision recorded                                                |
| O / gate_c_architecture      | docs/phase2/agents/gate-c-architecture.md                                                      | Interface between trusted supervisor, qs-33 adapter, and external evaluator             | Concrete component contracts; strict decoupling from R1                                                                                | Completed ACTIVE / SPECIFIED                                                                                |
| P / gate_c_security          | docs/phase2/agents/gate-c-security.md                                                          | Docker isolation enforcement, limits, 29s PID-1 watchdog, resource ownership             | Zero host mounts, `--network none`, <=1 CPU/256 MiB/64 PIDs, cleanup verification                                                       | Completed ACTIVE / SPECIFIED                                                                                |
| Q / gate_c_evaluation        | docs/phase2/agents/gate-c-evaluation.md                                                        | `ExternalManifestSchema`, `OfficialReportSchema`, `evaluateExternalEvidence` binding      | Manifest definition, 10/3/3/1 validation rules, failure identity verification                                                           | Completed ACTIVE / SPECIFIED                                                                                |
| R / gate_c_runner            | packages/runtime/src/external-supervisor.ts; packages/runtime/src/adapters/qs33-adapter.ts; packages/runtime/src/external-runner.ts; packages/runtime/src/patch-applier.ts; packages/runtime/src/candidate-patches.ts | Gate C architecture/security/evaluation specifications                                   | Executable trusted supervisor and qs-33 adapter feeding `evaluateExternalEvidence`                                                    | Completed: Stage C1, C2 & C3 PASS                                                                           |
| S / gate_c_qa                | docs/phase2/agents/gate-c-qa.md; packages/runtime/src/external-runner.test.ts; docs/phase2/GATE_C2_DECISION.md; docs/phase2/GATE_C3_DECISION.md | Integrated execution path, test baseline, and non-regression                             | Independent audit of runner, verified zero R1 changes, clean baseline unit suite, 33/33 tests pass, live buggy/fixed pair & candidate triplet verified | Completed: Stage C3 verified                                                                                |
| QA / dedicated later agent   | docs/phase2/agents/qa-audit.md                                                                 | Actual integrated call path and raw artifacts                                            | Independent audit; reject unsupported verification claims                                                                              | Not started                                                                                                 |
| Lead / root                  | docs/phase2/ORCHESTRATION.md; docs/phase2/FINAL_REPORT.md                                      | All accepted reports and actual outputs                                                  | Gate decisions, integration, final serial checks and report                                                                            | Active                                                                                                      |

## Resource and collaboration rules

Disjoint report ownership now; Gate B is passed for the paired reproduction. Only the lead
grants the single heavy-Docker/build lease. No simultaneous dependency installs,
benchmarks or R1 smoke. Preserve images, volumes, evidence and workspaces.
Protected: packages/judge/src/evaluate.ts and packages/contracts/src/index.ts
must stay unchanged. No secrets in reports. Token scan before every commit.
Every agent report records commands, exit codes, artifacts and PASS/PARTIAL/BLOCKED.

## Baseline and risks

Baseline HEAD 15647d5; working tree initially clean. Prior phase: 461 unit tests,
typecheck/lint/format passed; latest R1 smoke ERROR during PostgreSQL readiness.
External production runner remains unbuilt. Prior external attempts failed
identity (Immutable), browser/PID startup (Preact), and storage (Docusaurus).
Current lead measurements: C: free 16,814,694,400 bytes (~15.66 GiB), Docker
29.8.1, cached Node22 image/digest c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392,
326,104,305 bytes. Inventory showed three pre-existing exited R1 test containers
(517d430f, 6bb2f8f1, 0dbb9919 prefixes); they are not Phase 2 resources and remain
untouched. No Phase 2 Docker workload has run.

## Accepted analysis and historical blockers

The older blocked/partial entries below describe their respective attempts,
not the current Gate B state. Local-06 evidence and the subsequent scoped
decision are recorded at the end of this section.

- Architecture and security reports exist as plain Markdown and were read from
  disk; neither source nor tests were changed. No SVG/embedded HTML is needed.
- Reuse explicit separate external command, approved external schema/evaluator,
  shell-free Docker wrapper and exclusive workload lease. Do not reuse payment
  broker/ledger contracts. Keep pinned official regression/control bytes alongside
  the same generated candidate, with actual report and production-stack evidence.
- One immutable environment plus fresh workspaces can satisfy the existing single
  image identity; role-specific source hashes and real applied patches still need
  proof. Report hashes alone do not prove reporter authenticity.
- The research turn was flagged for possible cybersecurity risk, an execution
  restriction distinct from an SVG/display issue. Do not retry/rephrase or route
  around the restricted research. Preserve permitted already observed findings
  and summarize limits. A preservation-only closure report has been requested.
- Preliminary permitted finding: qs issue33, ordinary object-parsing correctness
  bug, parent 360e2b0b48548b9bfdb71f8c82a68c4f34ec0725 and proposed fixed commit
  6a97ad1d71d8a9069f5d6002cab3130752519ccb. Primary issue page was independently
  read by lead; local metadata and the final preservation report now reconcile.
- Gate A decision (2026-10-18): **PASS for candidate provenance selection only**.
  The permitted issue record identifies closed qs #33; `qs-33-fix.json` records
  fixed `6a97ad1d71d8a9069f5d6002cab3130752519ccb` with sole parent buggy
  `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725`; the saved fix message closes #33;
  the saved diff identifies four production-file changes and the complete
  official `parses plain objects correctly` regression; the saved package
  manifests show qs 2.2.1, CommonJS `index.js`, and no runtime dependencies;
  the saved Makefile records the upstream Lab command; and saved license bytes
  are available for redistribution. This pins a candidate for bounded Gate B,
  but is not execution evidence or a VERIFIED claim.
- Gate B prerequisites remain open: full immutable source archives/materialized
  tree hashes, an integrity-checked old Lab dependency closure or truthful
  compatibility result, actual buggy/fixed outputs, measured container state and
  cleanup, and a captured real production exception frame. The execution agent
  may acquire and verify these inputs as data under the pinned candidate and
  must stop honestly if the official Lab suite cannot run on the pinned runtime.
- Research remains closed under the earlier content-safety restriction. The
  execution task is ordinary correctness reproduction only; it must not retry
  restricted research, inspect advisories, or route around safeguards.
- Gate B execution outcome (2026-10-19 UTC): **BLOCKED before execution**.
  `python work/phase2/reproduction/prepare.py` exited 1 on DNS while acquiring
  the pinned parent metadata. The four read-only Docker checks each exited 1
  with the Docker Desktop named-pipe permission error; the two identical
  escalated read-only inventory attempts were not executed because automatic
  approval review was at capacity. No upstream source, Lab suite, dependency
  install, Docker container, or runner ran. The execution agent preserved raw
  stdout/stderr/argv/status records, frozen probe and official-test bytes,
  license and artifact hashes under `work/phase2/reproduction/` and released
  the exclusive lease without creating resources.
- Because no buggy/fixed pair, official regression result, or real production
  frame exists, Gate B is not passed and Gate C/runner implementation/full
  matrix remain blocked. The permitted next action is to restore the approved
  Docker/network access path, then rerun this same bounded Gate B preparation
  and sequential pair; do not substitute host execution, a homemade runner,
  agent summaries, or the current installed qs package.
- Local runbook handoff (2026-10-19): `scripts/phase2/run-gate-b.ps1` is frozen
  at reviewed SHA-256
  `dd284da2a2d38195da1ed4d0734159304212ed7bd10b7e46e42d14fca4961b74`.
  Independent review first found two HIGH issues (read-only `/case` staging and
  client-only timeout); the author corrected them with an exact labeled private
  volume and a PID-1 native watchdog, then the reviewer approved the revised
  source for static handoff. This is not measured Gate B evidence.
- Git checkout repair (2026-10-19): the first local run's bare repository had
  both pinned commit/tree objects but no persistent refs; only `FETCH_HEAD` was
  populated. The repaired script creates and verifies `refs/heads/gateb-buggy`
  and `refs/heads/gateb-fixed`, checks commit/tree accessibility in the bare
  repo and each independent `--no-hardlinks` clone, and asserts detached full-SHA
  HEAD after checkout. The companion local regression test preserves the
  expected pre-fix empty-clone/checkout failure and post-fix assertions, but its
  Codex-sandbox attempt stopped at Git fetch exit 128 before those assertions.
  No runtime Gate B evidence exists yet.
- Lockfile parser repair (2026-10-19): `qs33-gateb-local-02` completed exact
  source preparation and npm `lab-lock`/`lab-ci` (both exit 0), then stopped at
  Windows PowerShell 5.1 `ConvertFrom-Json` on the generated lockfile's
  `packages[""]` key. Its report remains BLOCKED with zero qs role executions.
  The preserved lockfile SHA-256 is
  `cb06631e8c6cb83e8199e3411184fabe674410427cf48b53dba7553f8cee750b`.
  A fixed Node validator now parses the lockfile as strict UTF-8 JSON data,
  validates the exact Lab pin, registry metadata integrity, every dependency's
  integrity and origin, and records a deterministic summary without untrusted
  values. The test accepts an empty root and distinct case-sensitive keys,
  rejects malformed/unsupported input and credential-bearing URLs; local
  regression and saved-lock validation both exit 0. PS 5.1 and 7 AST checks
  each exit 0. Independent QA approved the exact reviewed script/helper hashes for a fresh local collection attempt only. No qs execution or
  Gate B acceptance is claimed.
- Docker bind-count repair (2026-10-19): `qs33-gateb-local-03` reached the
  buggy container's pre-start inspect, then reported BLOCKED with zero role
  executions. The saved inspect has `HostConfig.Binds = null`, one approved
  writable `/case` named volume, matching token/role labels, and the expected
  read-only/offline/nonroot/watchdog settings. PowerShell counts `@($null)` as
  one; the old zero-bind check therefore failed falsely. The revised check
  ignores only null/empty entries and still rejects nonempty binds. Narrow
  additional assertions verify exactly one configured `/case` volume with
  `NoCopy`, matching volume role label, and only the approved `/tmp` tmpfs.
  The regression failed on the old assertion (PS 5.1 exit 1), then passed on
  PS 5.1 and 7 (exit 0 each); both parsers reported zero errors. Independent
  QA approved the final script for a fresh local collection attempt only and
  verified the saved local-03 inspect and volume against the repaired checks.
  Current script SHA-256:
  `2c36a290a57c4af614a66926a9dbe72d919b910ca1a50124c8ca7bf38734dbd5`.
  No qs execution, Gate B acceptance, or runner implementation is claimed.
- Inventory false-positive repair (2026-10-19): the preserved
  `qs33-gateb-local-04` run executed pinned buggy qs. Its official suite and
  reproduction probe each exited 1 with native
  `TypeError: source.hasOwnProperty is not a function` at
  `/case/lib/utils.js:47:20`; the official suite reported 1 of 56 failures.
  The supervisor/container exit 0 means collection completed, not that the
  official suite passed. The run stopped before fixed-revision execution with
  `Inventory mismatch: buggy container input bytes before execution`, so its
  report remains PARTIAL. The prepared, before, and after manifests each have
  356 matching entries. Replaying the exact preserved `Same-Inventory`
  showed that Windows PowerShell 5.1 wraps the observed `ConvertFrom-Json`
  array in one `Object[]`; the old function compared 356 rendered rows with
  one. Flattening that wrapper makes the original comparison pass, and
  PowerShell 7.6.5 receives flat arrays. Culture/case sorting did not cause
  this false positive. The revised function normalizes only that wrapper and
  compares strict path, byte length, and SHA-256 inventories using ordinal,
  case-sensitive keys with duplicate rejection. The exact buggy stack-frame
  checks now match pinned source line 47. The regression using the saved
  manifests accepts both positive pairs and rejects changed hash, size,
  missing/extra file, case change, and duplicates; PowerShell 5.1 and 7 both
  exit 0. Independent QA reviewed the current script SHA-256
  `797f149c9f55fb1f9d828a344aeb5cfe6b5f08c36acc15522f21b0eee211957f`
  and test SHA-256
  `e7838c5949f6d44aa45719613541116257cbe08200b60dc6c3cfe76dce2b92ee`.
  Evidence: `work/phase2/gate-b-runs/qs33-gateb-local-04/`;
  review: `docs/phase2/agents/gate-b-inventory-qa.md`. Prior evidence and
  protected R1 files remain unchanged. No fixed result, Gate B acceptance, or
  external-runner implementation is claimed.

## Local-06 Gate B decision and next actions

The predeclared [Node 22 contract](GATE_B_NODE22_CONTRACT.md) fixed the exact
eight-global Lab adaptation, 56-test TAP expectations, structural probe, and
source/runtime pins before the `qs33-gateb-local-06` attempt. Its frozen
collector SHA-256 is
`4be0fbf690a2a70b25e2699cf1b7ac06d5f7a4c23c39459f1f14ca53d36f81ee`.
The ordinary PowerShell collection command exited 0 and printed its saved
[`GATE_B_SUMMARY.md`](../../work/phase2/gate-b-runs/qs33-gateb-local-06/GATE_B_SUMMARY.md).
The collector's own status is PARTIAL because independent review was pending.

Actual sequential upstream results: buggy official/probe child exits 1/1,
fixed exits 0/0; collector containers exit 0/0. The official TAP results
contain exactly the same 56 test IDs and titles in both roles. Buggy has only
test 40 failing with native `TypeError: source.hasOwnProperty is not a function`
and top qs frame `/case/lib/utils.js:47:20`; fixed has 56 passes, zero failures,
skips, or TODOs. The fixed probe does not throw and serializes exactly
`{"a":{"b":"c"}}`; the buggy probe's raw stdout and stderr are printed in
the saved summary. Both roles report the same eight predeclared unchanged
globals and zero remaining leaks. Source heads, 357-file payload inventories,
Docker isolation/watchdog/cleanup, and all 370 artifact hashes were checked.

The [independent execution review](agents/gate-b-local06-execution-review.md)
ran its raw-evidence checks with exit 0 and accepted **Gate B PASS for this
authentic paired reproduction only**. See the explicit
[decision](GATE_B_DECISION.md) for evidence paths and scope. The external
runner, decoy/alternate matrix, independent evaluator decision, and 10-run
determinism remain unimplemented or unverified. Gate C work may begin, with
disjoint ownership and later dedicated QA of the integrated call path; preserve
protected R1 behavior and reject unsupported VERIFIED claims.

## Stage C1, C2 & C3 external runner execution and verification

Stage C1, C2, and C3 implemented and verified the reusable TypeScript external supervisor (`external-supervisor.ts`), target adapter (`adapters/qs33-adapter.ts`), pure TypeScript patch applier (`patch-applier.ts`), candidate patches (`candidate-patches.ts`), and external runner (`external-runner.ts`):
- Stage C1: Completed initial vertical slice with authentic live buggy execution inside isolated Docker container.
- Stage C2: Completed sequential live execution of both authentic pinned revisions:
  - Buggy (`360e2b0b48548b9bfdb71f8c82a68c4f34ec0725`): 56 test identities, 55 pass, only test 40 fails with `TypeError: source.hasOwnProperty is not a function` at `/case/lib/utils.js:47:20`. Buggy probe fails with exit code 1 and identical error/frame.
  - Fixed (`6a97ad1d71d8a9069f5d6002cab3130752519ccb`): Same 56 test identities, 56 pass, 0 fail/skip/TODO. Fixed probe exits 0 with `{"a":{"b":"c"}}`.
  - 9 targeted negative controls passed.
  - Raw evidence recorded in `work/phase2/gate-c-runs/qs33-c2-live-01`.
  - Independent QA audit recorded in `docs/phase2/agents/gate-c-qa.md` (Section 5).
  - Decision documented in `docs/phase2/GATE_C2_DECISION.md`.
- Stage C3: Completed counterfactual candidate-patch evaluation distinguishing reference fix, alternate correct fix, and subtle decoy:
  - Reference fix: status `COMPLETED`, exit code 0, 56/56 pass, probe passes with exact output `{"a":{"b":"c"}}`.
  - Alternate fix: status `COMPLETED`, exit code 0, 56/56 pass, probe passes with exact output `{"a":{"b":"c"}}`.
  - Decoy fix: status `COMPLETED`, exit code 1, 55 pass / 1 fail (Test 40), probe fails assertion with output `{"a":{}}`.
  - Pure TypeScript patch applier (`patch-applier.ts`) enforces base commit revision, patch SHA-256 digest, strict path allowlist, and symlink/traversal rejection without shell hooks.
  - 15 targeted negative controls passed in `packages/runtime/src/external-runner.test.ts`.
  - Raw evidence recorded in `work/phase2/gate-c-runs/qs33-c3-live-01`.
  - Decision documented in `docs/phase2/GATE_C3_DECISION.md`.
  - Independent QA audit recorded in `docs/phase2/agents/gate-c-qa.md` (Section 6).
- Status: Stage C1 PASS, Stage C2 PASS, Stage C3 PASS, Stage C4 PASS. Evaluator status promoted to `VERIFIED`.

## Stage C4 external matrix execution and evaluator verification

Stage C4 completed the execution of the full 17-run matrix (10 buggy, 3 reference, 3 alternate, 1 decoy) through the reusable TypeScript external runner:
- Full matrix execution completed in 408s total wall-clock time with zero host mounts and verified container/volume cleanup.
- Buggy (10/10): 10 deterministic failure reproductions, exit code 1, 55/56 pass, only test 40 failing with `TypeError: source.hasOwnProperty is not a function` at `/case/lib/utils.js:47:20`. Buggy probe reproduced native failure across all 10 runs.
- Reference fix (3/3): 56/56 tests passed, exit code 0, probe passed with serialized output `{"a":{"b":"c"}}`.
- Alternate fix (3/3): 56/56 tests passed, exit code 0, probe passed with serialized output `{"a":{"b":"c"}}`.
- Decoy fix (1/1): 55/56 tests passed, exit code 1, test 40 failed, probe failed with `AssertionError: expected { a: {} } to deeply equal { a: { b: 'c' } }`.
- Evaluator verdict: `evaluateExternalEvidence()` returned `status: 'VERIFIED'`, `deterministicRuns: 10`, `deterministicFailures: 10`, 0 reason codes.
- 153 raw evidence artifacts hashed (SHA-256) and verified in `work/phase2/gate-c-runs/qs33-c4-live-01/`.
- 39/39 automated tests passing in `packages/runtime/src/external-runner.test.ts`.
- Decision documented in `docs/phase2/GATE_C4_DECISION.md`.
- Next milestone prepared: Blind AI Regression-Test Synthesis (`docs/phase2/BLIND_AI_SYNTHESIS_PLAN.md`) and Production Incident Context Contract (`docs/phase2/INCIDENT_CONTEXT_CONTRACT.md`).
- qs-specific infrastructure development is now frozen.

### Milestone Status Table
| Milestone | Status | Description |
| --------- | :----: | ----------- |
| C1 | **PASS** | Supervisor vertical slice & isolated buggy execution |
| C2 | **PASS** | Sequential buggy/fixed execution & 9 negative controls |
| C3 | **PASS** | Candidate patch validation & counterfactual execution |
| C4 | **PASS (VERIFIED)** | Full 10/3/3/1 external matrix execution, determinism, independent evaluator status promotion to `VERIFIED` |



