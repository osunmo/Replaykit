# Phase 2 independent verification strategy — Agent D

Date: 2026-10-18 (America/Chicago). Repository:
`C:\Users\sunmo\Documents\Codex\2026-10-16\files-mentioned-by-the-user-agents\outputs\replaykit`.
Inspected HEAD: `15647d5fd9172eddaef84a40f82fd34c42830c4b`.

**Status: PARTIAL.** Source/document review and the correctness strategy are complete.
Actual upstream correctness, authentic failure identity, runtime provenance,
alternate/decoy behavior and counterfactual controls are NOT RUN by this agent.
**Gate C is BLOCKED pending accepted actual Gate B outputs.** No external
VERIFIED result, completed matrix or independently accepted reproduction is claimed.

## Objective, completed work and scope

Define the evidence an independent evaluator needs to distinguish a real small
upstream Node library regression from a plausible generated test. Read repository
instructions, current progress/decisions, core correctness/security documents,
orchestration, actual architecture/security reports, and the existing external
contract/evaluator/unit-fixture source. Only this Markdown report is written.
All application and evaluator sources remain read-only. No code execution,
install, Docker operation, test, full scan, commit, deletion or further delegation
was performed. Read-only PowerShell/Git inspection commands are listed below.

The lead reported a content-safety restriction in research. This agent did not
retry, rephrase, route around or further research that blocked material, inspect
advisories, or produce exploitation material. This report concerns ordinary
correctness, immutable inputs, evidence integrity and truthful gates. Existing
architecture/security findings are treated as analysis, not measured execution.

## Findings from the unchanged implementation

| Inspected implementation | What it establishes and what remains external |
| --- | --- |
| `packages/contracts/src/external.ts` | Explicit strict manifest/execution/report schemas; full base commit, immutable image digest, candidate/test-patch/test-file hashes, required disjoint test inventories, source inventory and four distinct patch hashes. Strict data shape does not prove execution. |
| `packages/judge/src/external.ts`, `bound` | Binds instance/base/image/patch/test-patch/candidate labels, hashes the supplied candidate source, pins the declared full test-file hash, and checks exact source inventory membership. Other production source hash values are present but are not compared with trusted expected values here. Supervisor must independently verify actual role trees. |
| `realBug`, `validFix`, `identity` | Buggy/decoy require exit 1, every fail-to-pass test failed, controls passed and no unrelated failing test. Both fixes require exit 0 and every reported test passed with null failure. Each buggy execution needs at least one fail-to-pass result matching expected type/frame. No decoy identity equality is required; its real invariant failure still needs independent semantic review. |
| `checks` | Exact 10 buggy / 3 reference / 3 alternate / 1 decoy, same candidate, distinct run IDs, fresh-workspace flags, static review, network none, nonroot/resource/root policy. These consume supervisor observations; flags alone do not demonstrate fresh state or inspected isolation. |
| `OfficialReportSchema` and evaluator parser | Hashes exact normalized report string; rejects malformed JSON/schema and duplicate test names as infrastructure errors. Missing required tests, skips and unrelated failures fail outcome gates; they are not all classified ERROR by the current function. |
| `packages/judge/src/external.test.ts` | Explicitly labeled synthetic unit fixtures, including a trivial arithmetic source and fabricated report records. Fixture VERIFIED means predicate coverage only. This file was inspected, not run. |
| Protected legacy files | `git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts` exited 0 with empty output. No change to either protected file is part of this report. |

A report hash establishes byte consistency, not who produced the report. The
evaluator deliberately trusts its supervisor. Do not manufacture evidence to fit
its fields or claim resistance to arbitrary malicious in-process library code.

One important integration requirement follows from the source: the generated
candidate must itself belong to the predeclared fail-to-pass inventory. Otherwise
an unchanged upstream regression could supply the failure while a trivial
generated candidate passes. The immutable official regression is independent
validation, not permission to credit an irrelevant candidate. Distinct alternate
patch hashes similarly establish different bytes, not independent fixes.

## Gate B acceptance before implementation

The independent reviewer needs two actual bounded executions, buggy and upstream
fixed, from the same accepted preparation. These are preflight evidence, not a
strict matrix or VERIFIED verdict. A report from another agent is a pointer to
artifacts; it is not the artifact or acceptance decision.

| Required item | Acceptance evidence |
| --- | --- |
| Provenance | Repository/license, full buggy and fixed commits, exact source and production patch bytes, dependency closure/integrity, package manager/runtime/architecture and immutable image digest. Commit strings alone cannot prove materialized contents. |
| One candidate | Exact complete executable file bytes/hash, declared test path, visible input/provenance, meaningful domain assertions, no synthetic expected exception or role-dependent test logic. The same frozen bytes execute on both sources. |
| Frozen official validation | Pinned upstream regression insertion/test patch, complete resulting upstream test files and hashes, unchanged controls, fixed runner argv, exact hierarchical test names and suite scope selected before either run. No post-hoc result filtering. |
| Real buggy behavior | Actual runner exit and raw reporter output show candidate and official regression fail for the intended library behavior, with controls passing. Raw error object/stack exposes the production exception type and real top library frame. Build failure, assertion-only test frame, timeout or OOM cannot supply that identity. |
| Real fixed behavior | Exact same candidate and official test bytes pass, meaningful output/state assertions hold, controls pass, and no unrelated failure or skip is hidden. Only reviewed production source changes. |
| Runtime provenance | Actual pre/post source hashes, loaded module/build artifact resolution, reporter/normalizer hashes, fresh workspace and inspected container identity/isolation, measured exit/OOM/signal/deadline state and timing. Retain raw output even when normalization fails. |
| Independence | Validator reviews raw outputs and trusted source inventory without having authored the candidate. Private fixes/decoy/expected outcomes do not enter a planner's visible package or tools. Record any prior exposure; an upstream-source preflight is not automatically an independent planner-generation study. |

If official assertion handling wraps a real library error, preserve its original
cause and establish the connection to that exact failing test. A separately run
probe is additional evidence and must not be relabeled as the official test's
cause. A direct candidate call may expose the library exception naturally; its
reported failing test must be included and bound. No assigned `Error.stack`,
manual expected throw, guessed source frame or nearest gold-patch filename.
Normalize only declared path/build differences; retain the raw stack and mapping
rule. Pin source maps and built artifacts if used. Missing production identity
keeps the result non-verified under the unchanged external contract.

Gate B does not require implementing a universal runner first. Conversely, two
ad-hoc preflights do not validate the later production call path. After Gate B,
the same observations must be collected through that integrated path before its
verdicts are trusted.

## Integrity and separation through the production path

Freeze the candidate, official regression, controls, test inventory, reporter and
trusted manifest before comparisons. For the architecture's separate short
candidate plus upstream-suite arrangement, bind the candidate full file through
`testFile`/`testFileHash`; independently pin all upstream full test-file hashes in
a trusted preparation sidecar. Preserve exact executed bytes, including line
endings. If another approved extraction mode is used, document the exact relation
between reviewed fragment and executed complete file rather than confusing their
hashes. The narrow single-added-`it` helper is not a general Tape/source validator.

Every role starts from the pinned baseline in an empty private workspace. Apply
only its reviewed production patch in isolated preparation; verify apply/check,
actual changed paths/file types, final source tree and loaded entry point. The
candidate/test/harness bytes remain identical. Compare actual production source
hashes against role-specific expected inventories outside the candidate's
authority. Recheck before execution; preserve post-execution checks. A cached
compiled artifact from the fixed tree must not be used by the buggy run. A shared
immutable dependency image is permissible; mutable execution state is fresh.

Use the single manifest image identity consistently. If role trees are copied
into a fresh tmpfs, prove which bytes were selected. Different role images must
not be reported as one digest. Supervisor observations must come from inspected
containers and freshly collected official runner events, with unique empty report
destinations. Retain raw report bytes plus normalized JSON/hash; a normalizer must
not remove skipped tests, failing controls or unknown outcomes. Test output cannot
select expected identity, role, image, manifest or evaluator.

Generation and validation have separate inputs and authority. The generator gets
the permitted buggy source and visible incident only. The evaluator owns expected
identity, official validation, valid fixes, decoy and trusted configuration; it
does not repair a weak candidate by injecting answer-key assertions. A validator
must not silently rewrite the candidate between roles. If a candidate is revised,
freeze a new version/hash and rerun all affected comparisons, preserving failures.

## Genuine alternate fix and decoy meaning

Reference means the pinned upstream production correction. Alternate means a
separately reviewed correction of the same domain behavior by a meaningfully
different implementation. It must preserve supported inputs and output semantics,
not disable execution or merely copy/reformat the reference. Assess source
semantics plus real output/control results; four distinct hashes are necessary
and insufficient. If no honest independent alternative is established, report
PARTIAL and leave the strict criterion unmet.

Decoy means a plausible incomplete or symptom-masking production change that
leaves the original domain defect present. Predeclare why it is incomplete, which
legitimate input still violates the same behavior, and which independent
observation demonstrates that violation. It must not introduce a deliberate
throw, tamper with tests/reporter, bypass the library or substitute a different
bug. Require the identical candidate and selected official regression to fail on
it, with controls passing, as the evaluator already requires. A decoy that
genuinely solves the tested behavior is not a valid decoy and cannot be forced to
fail by changing the test afterward.

For a small data-transformation library, assert exact documented results across
the affected input classes and ordinary unaffected controls. An absence of throws
alone is weaker than correct output. Error suppression that returns an incorrect
value should remain detectable by the same assertions. This is a correctness
strategy; no alternate or decoy patch was authored or executed here.

## Counterfactual controls required before the full matrix

Run controls through the integrated production collector/evaluator path after
Gate B and the first authentic integrated buggy/fixed pair. Synthetic matrix
mutation tests remain useful unit checks but cannot substitute for these runs.

| Control | Required observation |
| --- | --- |
| Restore buggy bytes / reverse the gold correction | Regression and real production failure return with the same candidate; hashing confirms actual restoration. A role label is not causal evidence. |
| Missing pinned image | Infrastructure ERROR before candidate execution; no online pull, fallback image or fixture-report substitution. |
| Replace candidate with a trivial passing assertion | Candidate's required fail-to-pass test now passes buggy, so verification is rejected even if the separate official regression still fails. Confirms candidate contribution rather than only suite sensitivity. |
| Unconditional throw candidate | Static rejection or non-verified outcome; cannot satisfy fixed passes and authentic library identity. No matching identity inferred solely from exit 1. |
| Wrong production path with same exception type | Actual observed different frame or controlled evidence mismatch is rejected. Clearly label an evaluator-only metadata control if no separate application execution occurred. |
| Remove/skip/duplicate required result, add unrelated failure, corrupt report or mismatch exit | Missing/invalid evidence never verifies; retain raw output and exact failed gate/error. Do not normalize away the discrepancy. |
| Substitute candidate/test/source bytes, reuse execution identity/state, reuse reference as alternate | Preparation/provenance/freshness checks reject; no reported source hash label or distinct-but-equivalent patch can substitute for actual integrity/semantic review. |

No counterfactual above was executed by Agent D. Security/isolation denial and
resource/cancellation controls are separately specified by Agent C and remain
unvalidated. Run only under the lead's single workload lease; do not loosen the
accepted limits when a case fails to fit.

## Missing/invalid evidence and required status handling

| Observation | Truthful handling under current evaluator and integration |
| --- | --- |
| Malformed manifest/matrix/schema, mixed legacy fields | `ERROR`, `EVIDENCE_CONTRACT_INVALID`. Never activate external evaluation from telemetry or null R1 ledger data. |
| Execution ERROR, absent/abnormal exit, absent/altered/malformed report, duplicate names | `ERROR` with `EXECUTION_ERROR` once contract parsing succeeds. Timeouts/OOM/build/start/collector/cleanup failure remain infrastructure failures, not the reproduced bug. |
| Missing required tests, any skip, extra failure, hash/base/image mismatch, wrong type/frame or incomplete matrix | Explicit gates fail; current function may yield `PARTIAL` if another qualifying real buggy execution exists, otherwise `NOT_REPRODUCED`. Do not falsely promise every such input returns ERROR. |
| Assertion-only stack or absent production frame | No identity success; retain the actual failure and missing evidence, without fabricating a frame. |
| No authentic raw artifacts or source/freshness provenance | No independent acceptance. Keep the orchestration gate blocked even if a hand-assembled evaluator input would say VERIFIED. Record the missing artifact paths. |

Before any VERIFIED claim, independent QA must inspect the actual integrated
call path and immutable raw evidence, then reconcile all 17 fresh executions:
10 matching buggy failures, 3 reference passes, 3 alternate passes and 1 genuine
decoy failure. Every selected test and control, identical candidate/test bytes,
role-specific source, image and patch binding, reporter integrity, offline
isolation, bounded resource settings, fresh state and static/review gates must
hold. The unchanged evaluator must produce VERIFIED with no reason codes and
10 deterministic failures. A unit fixture, preflight pair, screenshot, source
reading or agent summary is never that evidence. Any discrepancy blocks the claim
and is retained rather than silently repaired in the report.

## Evidence paths and remaining work

Inspected evidence: `docs/phase2/ORCHESTRATION.md`,
`docs/phase2/agents/architecture.md`, `docs/phase2/agents/security.md`,
`docs/EXTERNAL_VALIDATION.md`, `docs/specs/external-evidence-contract.md`,
`packages/contracts/src/external.ts`, `packages/judge/src/external.ts` and its
explicitly synthetic unit test. Historical run locations in EXTERNAL_VALIDATION
are references only; this agent did not independently reopen their raw logs.

New artifact: only `docs/phase2/agents/verification.md` (this report). No execution
artifact directory was created. The lead must register actual Gate B artifact
paths when they exist; future per-execution outputs should retain exact commands,
exit/state, stdout/stderr, raw official report, normalized report/hash, source
inventory, isolation, timing and errors beside their run identity. These are
required contents, not claims that those files already exist.

Remaining order: accept authentic Gate B buggy/fixed artifacts; implement the thin
runner/normalizer after that gate; independently audit an integrated pair; validate
alternate/decoy semantics and real counterfactual controls; only then authorize the
strict matrix and final serial regression checks. Research restrictions are not
permission to substitute invented provenance or bypass the gate.

Tests NOT RUN: unit/full suite, typecheck, lint, format, token/full scans, build,
install, upstream test, R1 smoke, database integration, Docker/isolation/security
probes, external runner/normalizer, sensitivities and 10/3/3/1. No runtime version,
free-space or daemon capacity measurement was made here. Historical passes and
lead-supplied measurements are not fresh Agent D verification.

## Exact read-only command ledger

All repository commands used the absolute repository directory in this report's
header. Exit codes below are actual final codes. Some combined large outputs were
truncated; focused rereads are listed. Five shell sessions yielded before
completion and were drained with `write_stdin`; all five completed with exit 0.
Markdown `\|` escapes below represent ordinary PowerShell pipeline characters.

| # | Exact command | Exit / key output |
| --- | --- | --- |
| 1 | `Get-Content -LiteralPath 'C:\Users\sunmo\.codex\plugins\cache\openai-curated-remote\superpowers\6.4.2\skills\using-superpowers\SKILL.md'` | 0; specifically dispatched subagents ignore that workflow. |
| 2 | `Get-Content -LiteralPath 'AGENTS.md'; Get-Content -LiteralPath 'docs/phase2/ORCHESTRATION.md'; Get-ChildItem -LiteralPath 'docs/phase2/agents' -Name; Get-ChildItem -LiteralPath 'docs' -Name` | 0; instructions/gates and bounded directory names; combined output truncated. |
| 3 | `Get-Content -LiteralPath 'docs/phase2/agents/architecture.md'` | 0; actual report; combined output truncated. |
| 4 | `Get-Content -LiteralPath 'docs/phase2/agents/security.md'` | 0; actual report, repeated at #10; combined output truncated. |
| 5 | `Get-Content -LiteralPath 'docs/ARCHITECTURE.md'` | 0; current R1 path; reread #13. |
| 6 | `Get-Content -LiteralPath 'docs/EVALUATION.md'` | 0; R1 strict gates; reread #14. |
| 7 | `Get-Content -LiteralPath 'docs/EXTERNAL_VALIDATION.md'` | 0; historical six preflights, no external VERIFIED or matrix, runner unbuilt. |
| 8 | `Get-Content -LiteralPath 'packages/contracts/src/external.ts'` | 0; strict external contract inspected. |
| 9 | `Get-Content -LiteralPath 'packages/judge/src/external.ts'` | 0; complete evaluator inspected. |
| 10 | `Get-Content -LiteralPath 'docs/phase2/agents/security.md'` | 0; report and unvalidated runtime controls; focused reread #18. |
| 11 | `Get-Content -LiteralPath 'docs/PROGRESS.md' -TotalCount 85` | 0; latest external incomplete/latest R1 ERROR distinguished from historical Gate 0. |
| 12 | `Get-Content -LiteralPath 'docs/DECISIONS.md' -TotalCount 110` | 0; independent contract, protected legacy and no fabricated identity. |
| 13 | `Get-Content -LiteralPath 'docs/ARCHITECTURE.md'` | 0; complete R1 architecture. |
| 14 | `Get-Content -LiteralPath 'docs/EVALUATION.md'` | 0; complete gates and artifact descriptions. |
| 15 | `Get-Content -LiteralPath 'docs/THREAT_MODEL.md'` | 0; trusted supervisor boundary and unit-fixture caveat. |
| 16 | `Get-Content -LiteralPath 'docs/specs/external-evidence-contract.md'` | 0; accepted strict separate contract and sensitivity requirements. |
| 17 | `Get-Content -LiteralPath 'docs/phase2/agents/architecture.md' \| Select-Object -Skip 260 -First 170` | 0; report ending/ledger/remaining work. |
| 18 | `Get-Content -LiteralPath 'docs/phase2/agents/security.md' \| Select-Object -Skip 20 -First 95` | 0; source integrity, profile, reporter trust, controls and Gate B dependency. |
| 19 | `Get-Content -LiteralPath 'packages/judge/src/external.test.ts'` | 0; complete synthetic unit fixtures inspected, not run. |
| 20 | `git rev-parse HEAD` | 0; `15647d5fd9172eddaef84a40f82fd34c42830c4b`. |
| 21 | `git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts` | 0; empty output, protected files unchanged against HEAD. |
| 22 | `Get-Content -LiteralPath 'docs/phase2/agents/architecture.md' \| Select-Object -Skip 195 -First 66` | 0; trust boundaries, proposed ownership and execution order. |
| 23 | `Get-Content -LiteralPath 'docs/LIMITATIONS.md' -TotalCount 85` | 0; production external path unbuilt, limits and historical claims. |
| 24 | `Get-Content -LiteralPath 'AGENTS.md' \| Select-Object -Skip 270 -First 59` | 0; complete strict judge criteria and no false verification. |
| 25 | `Get-Content -LiteralPath 'docs/phase2/agents/verification.md' -TotalCount 20` | 0; owned report read back with PARTIAL and Gate C BLOCKED. |
| 26 | `git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts` | 0; final protected-file check empty. |
| 27 | `git status --short -- docs/phase2/agents/verification.md packages/judge/src/evaluate.ts packages/contracts/src/index.ts` | 0; only `?? docs/phase2/agents/verification.md`; no protected-file modification. |

Report creation used `apply_patch` to add only this owned Markdown file; the tool
confirmed success. Document review/strategy: PASS. Actual correctness acceptance:
NOT RUN. Phase 2 verification status: PARTIAL. Gate C: BLOCKED until actual Gate B.
