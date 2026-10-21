# Phase 2 architecture report — Agent B

Date: 2026-10-18 (America/Chicago). Repository:
`C:\Users\sunmo\Documents\Codex\2026-10-16\files-mentioned-by-the-user-agents\outputs\replaykit`.
Inspected HEAD: `15647d5fd9172eddaef84a40f82fd34c42830c4b`.

**Status: PARTIAL.** Read-only architecture analysis is complete; production external
execution remains unbuilt. Gate C implementation must wait for Gate B's actual
pinned buggy/fixed outputs. This report is an implementation handoff, not an
external reproduction or verification milestone.

## Objective, actual work and decisions

Trace the implemented R1 source-to-execution path, identify reusable pieces, and
specify the smallest explicit external path that produces evidence for the
already approved separate evaluator. Read AGENTS, README, progress, decisions,
architecture, threats, limitations, orchestration and the named source modules.
Only this report was created. No application, evaluator, contract, helper or CLI
source was changed; no installs, Docker commands, tests, scans or commits ran.

Decisions:

1. Keep `packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts`
   byte-for-byte unchanged. Keep external dispatch explicit and operator selected.
2. Use existing `ExternalManifest`, `ExternalExecution`, `ExternalMatrix` and
   `evaluateExternalEvidence` without changing acceptance gates. Build a small
   trusted supervisor and reporter adapter, not a universal plugin framework.
3. Start with one offline buggy execution and one fixed execution. Only after
   their actual failure identity, reports and controls work, implement the
   production path, independent fixes/decoy and ultimately the strict 10/3/3/1
   matrix. Partial/preflight evidence cannot be labeled VERIFIED.
4. Do not wire the external path through the payment planner, broker, R1 matrix
   evidence or existing R1 runtime result parser. Their contracts are specific.
5. The leading qs case requires a generated candidate and pinned upstream tests;
   it does not require SWE-bench's legacy single-added-`it` profile. An incompatible
   source extraction helper is not permission to relax static review or identity.

## Actual R1 source-to-execution call path

Line references below were verified in the inspected working tree. These are
current implementation references, not claims that an execution ran this turn.

| Step | Verified source and behavior |
| --- | --- |
| Build trusted snapshots | `scripts/build-sandbox.ts:142` begins the allowlisted builder. Public app inputs are copied at 163–175; private variant policy hashes are computed at 178–190; public planner context is assembled at 201–230. The builder replaces only compiled `payment-policy.js` in each app snapshot at 330–345, builds the candidate SDK at 349–362 and public planner at 365–379, then persists immutable image IDs and component hashes at 381–404. It is an online preparation path, not candidate execution. |
| CLI dispatch | `packages/cli/src/index.ts:25` parses argv; line 32 delegates integration commands. Ordinary `incident run` reads/normalizes a fixture at 98–100 and calls `verifyPlan` at 122. `replay verify` checks saved source/plan equality and previous candidate hash at 87–96. `benchmark smoke` calls `smoke` at 59–60. |
| Capture real synthetic input | `packages/cli/src/workflow.ts:276` constructs two actual payment calls through `runSandbox` at 282–283; capture requires completed execution, two charges and an application incident at 284–285. `smoke` captures then verifies at 293–298. This is R1-specific capture, not an external collector. |
| Optional asynchronous path | `packages/cli/src/integration-command.ts:61` declares job/import commands, creates the runtime at 84 and routes them to it. `packages/runtime/src/index.ts:90` validates/redacts a start request, atomically stores job/request at 120–121, and spawns the detached worker with a restricted environment at 122–148. `packages/runtime/src/worker.ts:77` acquires the exclusive execution lease; lines 87–101 require the supported R1 manifest and capture or parse the incident; 103–112 call the same `verifyPlan`. |
| Planning boundary | `packages/cli/src/workflow.ts:99` redacts/schema-validates the incident; 107 invokes `planInSandbox` unless a saved plan was supplied; 109 checks the incident hash. `packages/judge/src/sandbox.ts:79` sends incident JSON to a network-none, nonroot, read-only planner image with limits and a 15-second deadline at 85–106. |
| Evidence-based test construction | `packages/planner/src/index.ts:5` is a pure incident adapter. Lines 16–32 require a request, two matching provider-charge breadcrumbs with distinct keys and DuplicatePaymentError. Lines 33–45 generate a short test calling the SDK payment operation twice and asserting charge count one. The planner does not infer arbitrary projects or consult fixes. |
| Bind and schedule | `packages/cli/src/workflow.ts:118` checks static review, 123 pins one manifest, and 124 checks exact service/revision/request binding. `packages/judge/src/binding.ts:11` requires checkout-api, line 12 the full buggy image ID, and 13–19 exact incident/plan request equality. Workflow 150–160 reuses identical candidate source with the manifest; 188–202 dispatches 10 buggy, 3 reference, 3 alternate and 1 decoy through the bounded pool. |
| Fresh isolated execution | `packages/judge/src/sandbox.ts:217` creates each execution. Lines 228–240 allocate unique names/artifacts, 271 creates an internal network, 276–317 starts/readies fresh PostgreSQL, 319–350 starts/readies the pinned app, and 357–360 independently checks empty ledger tables. Candidate creation at 361–391 uses network none, nonroot, read-only root, limits, a read-only candidate-only bind mount, and inspected isolation. |
| Candidate actions reach actual app | `packages/judge/src/sandbox.ts:113` starts the candidate; 167–192 validates each bounded broker request and invokes only the fixed application-side broker client, counting payment requests. `apps/checkout-api/src/app.ts:33` handles POST /payments and calls `createPayment` at 37. `apps/checkout-api/src/payments.ts:58` inserts actual provider ledger rows, 120–129 uses the compiled policy, and 149–150 raises DuplicatePaymentError only after the observed duplicate invariant. The exported implementation is at 165. |
| Trusted evidence collection | `packages/judge/src/sandbox.ts:401` inspects final candidate state and rejects invalid/OOM/attach mismatches at 408–411. Lines 416–420 independently query actual PostgreSQL charge state, and 421–438 read normalized failure identity from app logs. Candidate stdout is not the trusted ledger or app failure. Errors remain execution ERROR; cleanup failures also force ERROR at 477–486. |
| Independent verdict and artifacts | `packages/cli/src/workflow.ts:231` assembles the matrix and 232 calls `evaluateEvidence`. `packages/judge/src/evaluate.ts:86` requires real failure, more than one charge and at least two requests; 92–106 requires identity, both valid fixes and failing decoy; 98–129 retains counts, freshness, identical candidate, policy and isolation. Workflow 249–273 persists timings, result, Markdown and CSV. |

The latest recorded R1 smoke failed during PostgreSQL Docker-exec readiness;
`docs/PROGRESS.md:13` through 20 records this. It was not rerun. README's historical
claims and broader concurrency wording do not override current code:
`packages/cli/src/concurrency.ts:1` currently accepts concurrency 1–3.

## What the approved external evaluator actually accepts

`packages/contracts/src/external.ts:18` defines an explicit
`external-official-suite-v1` manifest with full base commit, image digest, candidate,
official test patch/full test-file hashes, source inventory, nonempty disjoint test
inventories, expected failure identity and four distinct patch hashes. The test
file must belong to the source inventory (41–49). The report schema at 52–64
requires named passed/failed/skipped test results and nullable failure identities.
Execution evidence at 65–102 also carries report bytes/hash, measured process
status, fresh workspace, timing and inspected isolation, with only listed tmpfs
mount destinations. No host bind mount is accepted.

`packages/judge/src/external.ts:115` is the existing trusted-supervisor entry point.
It validates schemas, report hashes, JSON and duplicate names at 120–145; rejects
missing required tests and every reported skip at 146–152; binds instance, commit,
image, all patch/candidate hashes and full test-file hash at 158–168. The supervisor
must independently compute the rest of the source inventory; this code checks
inventory membership/presence, not an expected hash for every production file.
Measured complete buggy failures must fail every fail-to-pass test, pass controls,
and have no unrelated failing tests (169–179). Identity must contain the actual
expected type and normalized top application frame (180–189). Both fixes must
pass all reported tests with null failure values (190–196).

Counts remain exactly 10/3/3/1 at 197–211. Network none, nonroot user, root policy,
capability/privilege limits, at most 1 CPU/256 MiB/64 PIDs, distinct IDs/fresh
workspace, unchanged static inspection and reviewability are required at 212–235.
The only existing review-length/root exceptions are trusted manifest fields;
they do not authorize changed network/resource/identity gates. Missing or invalid
reports/process status are ERROR, and only all gates can produce VERIFIED
(237–251). Fixture tests of this function are not runtime attestations.

## Reuse and separation

| Component | Use in external slice |
| --- | --- |
| `packages/judge/src/docker.ts:9` | Reuse the shell-free, hidden-window Docker argument-array wrapper with bounded output, timeout and explicit failure handling. It accepts only trusted supervisor-built argv. |
| `packages/judge/src/profiling.ts:12` | Reuse monotonic stage timings; timings never establish a verdict. |
| `packages/runtime/src/lease.ts:7` | Reuse workspace execution lease so external work and R1 jobs cannot overlap unexpectedly. Initial external execution should be serial. |
| `packages/runtime/src/storage.ts:8`, `:30`, `:60` | Reuse contained managed paths, bounded regular-file reads and atomic JSON writes where compatible; no job schema expansion needed for first slice. |
| `packages/judge/src/cleanup.ts:3` | Later production cleanup can reuse run-label ownership checking (30) for resources created by that run. It must not delete prior research artifacts/images/volumes. No cleanup ran in this analysis. |
| `packages/benchmark-runner/src/patch.ts:7` | Reuse path/type diff envelope checks, but also require actual git apply/check, index modes and filesystem checks in a fresh container. This helper explicitly does not perform those operations. |
| `packages/benchmark-runner/src/candidate.ts:49` | Reuse only for its documented direct single-it insertion profile. It preserves controls/directives and returns reviewed statement bytes (55–122). It is not a generic candidate safety check. |
| R1 planner/broker/runner/result parser | Do not reuse as an external adapter. Payment request, SDK import, ledger, app topology and exact result schemas are intentionally specific. `runtime/index.ts:185` parses R1 JudgeResult, so a separate external command initially avoids redesigning jobs/MCP/editor. |
| R1 isolation parser | Its candidate bind mount and R1 user assumptions do not satisfy the external tmpfs-only contract. Build a separate small external inspection adapter using the approved schema, without changing R1. |

## Minimal external interface after Gate B

Proposed call path (unimplemented):

```text
explicit external command / operator-selected local case
  -> loadPinnedExternalJob (trusted prepared config + bytes)
  -> runExternalOnce(job, role, output, signal)
  -> normalizeOfficialReports(raw official runner output)
  -> ExternalExecutionSchema.parse(supervisor observations)
  -> assemble exact ExternalMatrix
  -> evaluateExternalEvidence(job.manifest, job.candidateSource, matrix)
  -> persist raw evidence + result/report
```

The minimal trusted job contains the existing manifest plus local immutable input
bytes: full candidate test, optional official regression test patch, role patches,
approved official runner argv, selected test inventory, file allowlists and prepared
image identity. Keep this supervisor configuration separate from visible incident
or candidate output. Do not add generic provider discovery, shell commands in
telemetry, arbitrary URLs, an LLM provider, or evaluator-selection fields to R1.
Return existing ExternalExecution per invocation. Treat preparation/startup,
timeout/OOM, malformed/absent reports, cleanup failure and unexpected exit as
execution ERROR, with separate raw diagnostics. Do not fill missing evidence with
success defaults or derive exception identity from the manifest.

One prepared pinned base image can be reused across roles while each role gets a
fresh private writable tmpfs worktree, its exact allowlisted patch and the identical
candidate/official test bytes. This fits the existing single image field plus role
patch hashes. Copy required data through trusted Docker stdin/copy operations,
not host mounts; verify actual resulting file types/hashes. Execute untrusted code
only after entering the offline restricted environment. Validate git changes
before executing them, and persist inspected state rather than requested flags.

### Leading qs compatibility, based on actual research files

`work/phase2/research/qs-comma-fix.json:2` records fixed commit
`21f80b33e5c8b3f7eba1034fff0da4a4a37a1d41`; line 77 records parent
`a0a81ea2071acce3eff41a040f719ac8f5c4f64c`. Its source patch at 110 guards
null/undefined before encoding comma-array elements. Its official regression at
122 is a Tape `t.test` block in `test/stringify.js`, with doesNotThrow checks and
exact output assertions for null/undefined, strictNullHandling and skipNulls.
These are upstream source observations, not measured bug reproduction.

Preserve the pinned parent test suite bytes and apply only a frozen, independently
reviewed official regression insertion; retain the full resulting test-file hash.
Preserve the existing upstream control tests in that file, and preserve any other
selected upstream test files byte-for-byte. Freeze exact hierarchical test names
and selected runner scope before variant comparisons. Keep raw TAP and normalized
JSON together. A normalizer must not rename/remove failing controls, hide skips,
or synthesize application frames. A bounded officially supported subset is only
acceptable if declared before execution and actually selected by the runner;
post-hoc filtering of the full-suite result is unacceptable.

The generated candidate can be a separate short ESM `node:test` file importing
the pinned library through a contained relative path and asserting the same
documented behavior. It can satisfy current static policy without `require`,
`process`, timers, loops or thrown synthetic errors. Execute that same file on all
roles. Bind its full file hash via manifest.testFile/testFileHash and include the
upstream test file in the measured source inventory; separately bind the frozen
official regression patch through testPatchHash. Combine the measured candidate
and upstream reporter results into one uniquely named OfficialReport, with the
candidate and official regression in failToPass only if both really fail on the
buggy source and pass on the fix. At least the uncaught library exception from
the generated candidate must provide the real TypeError/application frame.

Because manifest.testFile points to the generated candidate in this arrangement,
the trusted preparation job must additionally pin and verify the full official
test-file hash before every role, alongside the base tree and patch. A merely
present sourceHashes entry is insufficient for that extra file. This is a
supervisor integrity check, not a change to the accepted evaluator or schema.

This does not require changing the evaluator: it already permits multiple named
test results and requires all selected fail-to-pass and control outcomes. The
existing single-added-it helper cannot validate Tape; use a separately reviewed
data guard for the frozen official Tape insertion, or keep the immutable upstream
regression artifact as trusted preparation input. Never pass only an extracted
statement to the runner while hashing a different executed file.

Pinned qs package metadata at
`work/phase2/research/a0a81ea2071acce3eff41a040f719ac8f5c4f64c/package.json:74`
shows npm pretest lint/readme and line 77 shows a networked npm-audit posttest.
Gate B should invoke explicit local runner argv / the tests-only command shown at
76 (`nyc tape 'test/**/*.js'`) after online preparation, with shell-free explicit
file expansion where needed. Do not invoke networked npm lifecycle hooks offline.
If selected upstream tests report skips, limits prevent execution, the candidate
fails static review or no real production frame is exposed, that is a real blocker
for this case under the unchanged contract. It is not yet established that any of
those conditions holds: Gate B must measure them.

## Trust boundaries

| Phase | Authority and evidence |
| --- | --- |
| Trusted online preparation | Operator chooses repository/revisions, downloads exact source/dependencies, reviews source/official regression and independent fixes/decoy, builds a pinned allowlisted base, records lockfile/source/patch/image hashes. Builds may execute upstream package scripts in controlled preparation containers; no secrets or production credentials. Network acquisition and dependency availability are recorded separately from offline replay. Private fixes, expected outcomes and judge configuration never enter the planner input. |
| Untrusted offline execution | Candidate and upstream application/test code run in fresh restricted containers with no network, no host/Docker socket mounts, nonroot UID, read-only root (unless the existing explicit trusted exception), bounded tmpfs/CPU/memory/PIDs/time/output. No installs/downloads. Only one role's materialized source is visible. Test output cannot select the role, image, expected identity or evaluator. |
| Trusted supervisor and independent evaluation | Supervisor pins config, checks source/patch application and actual filesystem state, independently inspects isolation/final process state and collects official runner output. Normalization is a trusted adapter over pinned official harness output, not permission to trust candidate-authored verdict JSON. An independent reviewer audits raw output, inventory, exception stack and hashes. The evaluator only judges those collected facts. Pinned harnesses/static review reduce report tampering risk; a JSON schema alone cannot prove authenticity or protect against malicious source/build/host administrators. |

## Disjoint implementation ownership and dependencies

All names below are a proposal, not files created in this turn. Start Gate C only
after the lead accepts Gate B's two authentic outputs and selects the case.

| Owner | Proposed owned files | Dependency and completion evidence |
| --- | --- | --- |
| Preparation/case engineer | `work/phase2/<case>/` raw Gate B artifacts; later reviewed case material under `benchmark/external/<case>/` | Pinned source/license, exact buggy/fixed bytes, dependency/image manifest, candidate, official regression/control inventory, real raw outputs and application frame. No production-runner source edits. |
| Execution engineer | `packages/benchmark-runner/src/runner.ts`, `job.ts`, `isolation.ts` and focused adjacent tests | Consumes accepted case plus reporter API. Owns fresh tmpfs materialization, safe patch application, measured source hashes, actual Docker inspection, bounded execution and artifacts; returns existing ExternalExecution. No judge/contract edits. |
| Reporter/evidence engineer | `packages/benchmark-runner/src/official-report.ts` and its focused tests/fixtures | Consumes Gate B raw node:test/TAP outputs and frozen inventory. Maps actual test status and actual stack frames; preserves failure/skip distinctions and exposes malformed/incomplete output. No runner or evaluator edits. |
| Lead integration | `packages/benchmark-runner/src/workflow.ts`, `packages/cli/src/external-command.ts`, one dispatch hook in `packages/cli/src/index.ts`, package scripts/tsconfig only if required | Depends on runner and reporter. Explicit command; obtains existing execution lease; initially serial; assembles unchanged 10/3/3/1 matrix only after role validation; persists external result without coercing to R1 JudgeResult. Owns shared configuration edits to prevent conflicts. |
| Independent verification/QA | Audit report and negative-test files assigned separately by lead | Consumes immutable raw outputs independently of candidate generation. Checks mismatch/frame/report/hash/inventory/skip/isolation/freshness/error behavior and both independent fixes/decoy before expensive full matrix. Does not manufacture truth from a generated candidate. |

Execution order: accepted Gate B artifacts -> reporter plus materializer/inspection
implementation -> one production buggy/fixed pair -> independent audit -> real
alternate/decoy counterfactuals -> strict serial matrix -> final integrated checks.
The next useful deliverable is those two real outputs, not another design document.

## Commands and evidence from this analysis

All repository commands used the absolute repository directory above. All were
read-only. `rg` output was used for line references. Some initial large reads
returned running PTY sessions; polling those sessions confirmed exit 0. Commands
with truncated combined output were subsequently reread in focused invocations.

| Exact command (or repeated exact invocation) | Exit | Key output |
| --- | --- | --- |
| `Get-Content -LiteralPath 'C:\Users\sunmo\.codex\plugins\cache\openai-curated-remote\superpowers\6.4.2\skills\using-superpowers\SKILL.md'` | 0 | Dispatched subagents are instructed to ignore that workflow. |
| `Get-Content -LiteralPath 'AGENTS.md'; Get-Content -LiteralPath 'README.md'; rg --files docs \| rg '(progress\|decision\|architecture\|threat\|limitation\|phase2)'` | 0 | Repository engineering contract, R1 README, phase2 orchestration path. |
| `git status --short` | 0 | Only untracked `docs/phase2/` at the initial inspection. |
| `rg --files -g AGENTS.md -g '*external*' -g '*source*' packages/benchmark-runner packages/contracts packages/judge packages/runtime packages/cli packages/planner` | 0 | Separate external contract/evaluator/test; no nested AGENTS in these package trees. |
| `Get-Content -LiteralPath 'docs/ARCHITECTURE.md'` | 0 | Current R1 topology and runtime. |
| `Get-Content -LiteralPath 'docs/THREAT_MODEL.md'` | 0 | Explicit external trusted-supervisor requirement. |
| `Get-Content -LiteralPath 'docs/LIMITATIONS.md'` | 0 | Production external runner absent. |
| `Get-Content -LiteralPath 'docs/PROGRESS.md' -Tail 180` | 0 | Historical implementation and smoke records; latest state checked separately below. |
| `Get-Content -LiteralPath 'docs/DECISIONS.md' -Tail 180` | 0 | Approved separate contract, preserved strict gates and no fabricated frame. |
| `Get-Content -LiteralPath 'docs/phase2/ORCHESTRATION.md'` | 0 | Gate B precedes Gate C; disjoint ownership and protected files. |
| `rg --files packages/cli/src packages/runtime/src packages/planner/src packages/judge/src packages/contracts/src packages/benchmark-runner/src` | 0 | Bounded source inventory; benchmark-runner has only candidate/patch helpers and tests. |
| `rg -n '^(export \|async function \|function \|const [A-Za-z].*=\|program\.\|.*\.command\(\|.*\.action\()' packages/cli/src/index.ts packages/cli/src/workflow.ts packages/runtime/src/index.ts packages/runtime/src/worker.ts packages/planner/src/index.ts packages/judge/src/sandbox.ts packages/judge/src/evaluate.ts packages/judge/src/external.ts packages/contracts/src/external.ts packages/benchmark-runner/src/candidate.ts packages/benchmark-runner/src/patch.ts` | 0 | Located entry points. |
| `Get-Content -LiteralPath 'packages/contracts/src/external.ts'` | 0 | Existing external schema. |
| `Get-Content -LiteralPath 'packages/judge/src/external.ts'` | 0 | Existing strict external evaluator. |
| `Get-Content -LiteralPath 'packages/benchmark-runner/src/candidate.ts'` | 0 | Narrow added-it source guard. |
| `Get-Content -LiteralPath 'packages/benchmark-runner/src/patch.ts'` | 0 | Preliminary patch path/type guard. |
| `rg -n '^' packages/contracts/src/external.ts packages/judge/src/external.ts` | 0 | Numbered contract and evaluator. |
| `rg -n '^' packages/benchmark-runner/src/candidate.ts packages/benchmark-runner/src/patch.ts` | 0 | Numbered helper implementations. |
| `rg -n '^' packages/cli/src/index.ts packages/cli/src/workflow.ts` | 0 | Numbered synchronous execution path. |
| `rg -n '^' packages/runtime/src/index.ts packages/runtime/src/worker.ts packages/planner/src/index.ts` | 0 | Numbered async and planner path. |
| `rg -n '^' docs/THREAT_MODEL.md docs/phase2/ORCHESTRATION.md` | 0 | Numbered trust/gate requirements. |
| `rg -n 'incident\|verifyPlan\|smoke\|createRuntime\|job\|capture\|readFile\|applyTier' packages/cli/src/index.ts` | 0 | Fixture normalization, stored provenance and verifyPlan dispatch. |
| `rg -n 'planInSandbox\|runSandbox\|evaluateEvidence\|bind\|loadManifest\|writeFile\|jobs\|buggy\|reference\|alternate\|decoy\|captureIncident\|inspectTest\|pool\|abort' packages/cli/src/workflow.ts` | 0 | Matrix construction and evaluator call. |
| `rg -n 'start\|spawn\|worker\|lease\|status\|readManaged\|recover\|runWorker\|verifyPlan\|planInSandbox\|writeFile\|capture' packages/runtime/src/index.ts packages/runtime/src/worker.ts` | 0 | Async worker reaches same workflow under lease. |
| `rg -n '^' packages/planner/src/index.ts` | 0 | Evidence preconditions and generated SDK test. |
| `rg -n 'R1\|external\|Phase\|phase\|blocked\|readiness\|timeout\|simulation\|461' docs/PROGRESS.md` | 0 | Latest smoke infrastructure error, unbuilt external runner. |
| `rg -n '^' packages/judge/src/external.ts` | 0 | All existing gates inspected. |
| `rg -n '^' packages/benchmark-runner/src/candidate.ts` | 0 | Direct-it/describe restriction and controls preserved. |
| `rg -n '^' packages/judge/src/docker.ts packages/judge/src/profiling.ts packages/cli/src/concurrency.ts` | 0 | Bounded shell-free Docker wrapper, profiler, pool limit 1–3. |
| `rg -n 'export\|async\|readFile\|cp\(\|copy\|context\|policy\|planner\|Dockerfile\|build\|sourceHashes\|appImages\|manifest\|variant' scripts/build-sandbox.ts` | 0 | Allowlisted source-to-image construction. |
| `rg -n 'planInSandbox\|runCandidate\|runSandbox\|docker\(\|fresh\|psql\|charges\|failure\|logs\|wait\|readiness\|candidate\|isolation\|cleanup\|inspect' packages/judge/src/sandbox.ts` | 0 | Real broker/app/DB observations and isolation. |
| `rg -n '^' packages/cli/src/index.ts packages/cli/src/integration-command.ts` | 0 | Integration dispatch before synchronous CLI. |
| `rg -n '^' packages/contracts/src/index.ts packages/judge/src/evaluate.ts` | 0 | R1 payment/evidence schema and unchanged strict evaluation. |
| `rg -n '^' packages/judge/src/binding.ts` | 0 | Exact revision/service/request and final process-state checks. |
| `rg -n '^' packages/runtime/src/worker.ts` | 0 | Manifest precondition, lease and workflow call. |
| `rg -n '^' packages/contracts/src/external.ts` | 0 | Numbered schema and tmpfs-only mount evidence. |
| `rg -n '^(export )\|schemaVersion\|PaymentRequest\|ExecutionEvidence\|strictObject\|charges\|requests\|FailureIdentity\|HashSchema\|ReplayPlan' packages/contracts/src/index.ts` | 0 | R1-specific types, no external dispatch field. |
| `rg -n '^' packages/cli/src/workflow.ts` | 0 | Complete workflow reread without combined-output truncation. |
| `rg -n '^' packages/runtime/src/index.ts` | 0 | Complete runtime reread; report parser is R1-specific. |
| `rg -n '^' packages/judge/src/sandbox.ts` | 0 | Complete runner reread. |
| `rg -n 'createPayment\|policy\|charge\|DuplicatePaymentError\|route\|post\|payments\|register\|listen' apps/checkout-api/src/payments.ts apps/checkout-api/src/server.ts apps/checkout-api/src/app.ts apps/checkout-api/src/payment-policy.ts benchmark/private/R1/buggy.ts benchmark/private/R1/reference.ts benchmark/private/R1/alternate.ts benchmark/private/R1/decoy.ts` | 0 | Actual provider insert, app call and observed duplicate exception. |
| `rg -n '^(export \|async function)\|label\|replaykit.run\|network\|rm\|inspect\|Mounts\|NetworkMode\|Readonly\|User\|Memory\|Pids\|Cpu' packages/judge/src/cleanup.ts packages/judge/src/sandbox-policy.ts packages/runtime/src/lease.ts packages/runtime/src/storage.ts` | 0 | Reusable utility entry points and R1-specific isolation schema. |
| `git rev-parse HEAD` | 0 | `15647d5fd9172eddaef84a40f82fd34c42830c4b`. |
| `git diff --exit-code 15647d5 -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts` | 0 | Empty output; protected files unchanged from baseline. |
| `rg -n 'qs\|null\|comma\|encodeValuesOnly\|commit\|GHSA\|inventory\|test' docs/phase2/agents/research.md` | 1 | Research report had not yet been written; no design conclusion based on its absence. |
| `rg --files work/phase2` | 0 | Located agent A's bounded source research artifacts. |
| `rg -n 'sha\|filename\|patch\|encodeValuesOnly\|comma\|null\|test\(' work/phase2/research/qs-comma-fix.json` | 0 | Actual fix/parent and Tape regression patch above. |
| `rg -n '"scripts"\|"test\|"engines"\|"dependencies"\|"devDependencies"\|"tape"\|"nyc"\|"side-channel"\|"pretest"\|"posttest"' work/phase2/research/a0a81ea2071acce3eff41a040f719ac8f5c4f64c/package.json` | 0 | Explicit tests-only runner; pre/post lifecycle unsuitable for offline execution. |
| `git status --short -- docs/phase2/agents/architecture.md packages/judge/src/evaluate.ts packages/contracts/src/index.ts` | 0 | Only assigned architecture report untracked; protected files absent from changes. |
| `rg -n 'Status:\|Minimal external interface\|Leading qs\|Disjoint implementation\|Tests NOT RUN\|Artifact:\|Gate C' docs/phase2/agents/architecture.md` | 0 | Report exists with required status, boundaries, handoff, tests and artifact sections. |

Backslashes before pipes in the Markdown command cells escape table separators;
the actual PowerShell commands passed ordinary `|` regex alternation or pipeline
characters as appropriate. No read-only command above executed the upstream code.

## Tests NOT RUN, blockers, artifacts and remaining work

Tests NOT RUN: all unit/integration/security/SDK tests, typecheck/lint/build,
format checks, R1 smoke, external preflight and matrix. This assignment explicitly
prohibited tests, installs, Docker workloads and full scans. Prior successful tests
are historical records only; no new PASS is inferred from them.

Blockers: Gate B outputs do not yet exist in this agent's analysis; external
production runner, official-report normalizer and generated candidate integration
are unbuilt. Independent alternate/decoy behavior and upstream test/frame/static
compatibility must be demonstrated. Current host storage/daemon capacity was not
measured here; prior R1 readiness timeouts remain unresolved and were not retested.

Artifact: only `docs/phase2/agents/architecture.md` (this report).
Remaining work: execute the selected pinned qs buggy/fixed pair under the lead's
single Docker lease, retain actual complete raw outputs, confirm compatible static
candidate plus real TypeError frame and upstream controls, then implement the thin
supervisor/normalizer path above and independently audit it before counterfactuals
and the full matrix. No external VERIFIED result is claimed.
