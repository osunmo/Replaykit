# Phase 2 — Security and infrastructure review

Date: 2026-10-18. Agent C. Baseline inspected: `15647d5fd9172eddaef84a40f82fd34c42830c4b`.

**Status: PARTIAL.** The assigned read-only review is complete and an actionable profile is below. Runtime isolation, real upstream identity and reporter authenticity remain unvalidated until actual Gate B outputs exist. This document is not execution approval, a vulnerability exploit demonstration, or an external VERIFIED result.

## Objective, work and ownership

Reviewed repository instructions, README, progress, decisions, architecture, threat model, limitations, external validation and approved external contract; inspected launcher, isolation inspection, cleanup, runtime cancellation/lease, source preparation helpers, provenance, external schema/evaluator and existing regression descriptions. Only this report is written. No source change, package installation, Docker command, workload, scan, test, commit or deletion was performed. No further agent was spawned.

Protected files stay untouched:

- `packages/judge/src/evaluate.ts`: SHA-256 `aea7ff69ae0afc34101920415881e044ce3eb8aafba57d4da3eb4e7212ef5bbb`.
- `packages/contracts/src/index.ts`: SHA-256 `dda117140b97e825457bd0d49c936b76a8962ab651ae5f91f7a2a6042ed8e95b`.

The lead owns orchestration and PROGRESS updates; this agent does not edit those shared files. Gate C source implementation must wait for authentic buggy/fixed Gate B outputs.

## Observations and their limits

| Source-inspected fact | Consequence / action |
| --- | --- |
| R1 `sandbox.ts` launches with 1 CPU, 256 MiB, 64 PIDs, nonroot, dropped capabilities and no-new-privileges; candidate/planner network none; app/DB share an internal network. | Keep R1 unchanged. A simple Node external target needs network none throughout, with no DB/browser or broker. |
| R1 candidate uses one read-only host bind at /candidate. External schema permits only allowlisted tmpfs mount records and rejects binds. | Do not reuse the R1 launch path for external execution or copy its host-mount convention. |
| R1 `checkIsolation` permits PidsLimit up to 128 although launch flags use 64; no-new-privileges is checked with a startsWith match. | Observed configuration-validation mismatch, not an observed runtime escape. External inspection must enforce at most 64 and the actual enabled security option. No R1 changes are authorized here. |
| External evaluator preserves explicit contract selection, 10/3/3/1, identity, fix/decoy, inventories, hashes, no-sleep/review and isolation gates. It consumes supplied evidence; it does not execute or inspect Docker. | Trusted runner must collect and bind facts. Passing unit fixtures do not attest a real container. |
| `sourceHashes` binds the official test file to its expected hash, but other named source entries are required only to be present; patch hash is supplied evidence. | Runner must calculate exact source/patch hashes from actual container bytes and retain role-specific expected tree inventories outside candidate control. Hash labels alone do not prove a patch was applied. Supplementary provenance may be a trusted sidecar without altering the approved contract. |
| Path/type helper rejects unsafe metadata, symlink/gitlink modes, binary patches, rename/copy metadata and oversized patches. Added-test helper preserves original bytes/parsing/directives. Neither applies patches. | Use these checks as preliminary guards, followed by real Git check/apply and filesystem inspection inside fresh preparation. Never apply benchmark patches on the host. |
| Cleanup inspects each named resource's replaykit.run ownership label before bounded rm; failures remain errors. Docker timeout kills the client process. | Reuse exact-name ownership discipline. Killing a Docker CLI is not proof its container or daemon-side exec stopped; reconcile and inspect actual state. |
| Worker checks cancellation/abort, has a 20-minute job bound and repository-scoped loopback lease. R1 runSandbox does not take an AbortSignal. | Current cancellation is cooperative at outer boundaries, not proof of immediate stopping of an active execution. External runner should explicitly stop active owned containers, await cleanup and then release lease. |
| Builder copies allowlisted contexts, rejects symlinks and captures immutable image IDs/lock hashes; it initially pulls mutable base tags. Variants reference a local app-base tag during construction. | Good runtime provenance foundation, but not hermetic/supply-chain verification. External acquisition must resolve and retain immutable digests and all actual dependency/build inputs. |
| README and historical docs contain mixed milestone claims; newest EXTERNAL_VALIDATION says production external runner/normalizer/CLI/matrix are unbuilt. | Treat actual source plus raw artifacts as evidence; do not inherit historical passing claims as fresh Phase 2 validation. |

Historical facts, not current faults: Immutable's assertion-only failure had no application frame; Preact browser startup failed within 64 PIDs; Docusaurus acquisition stopped on low C: storage; last R1 smoke failed during PostgreSQL readiness. Their causes have not been established by this review.

Current facts supplied by the lead, not independently measured by Agent C: C: free 16,814,694,400 bytes (about 15.66 GiB); Docker 29.8.1; cached Node image `node:22-bookworm-slim`, ID/digest `sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392`, size 326,104,305 bytes. Inventory found three pre-existing exited containers:

- `rk-517d430f-335d-44da-a4c5-72402eea693b-test`
- `rk-6bb2f8f1-9c96-4c3a-a9f0-b13b9d2f5c14-test`
- `rk-0dbb9919-6c3d-4ac4-8ac2-57c6e5eae54f-test`

Preserve all three. A generic replaykit.run label prune would violate resource ownership.

## Minimal safe profile for Gate B and later external execution

Prefer a small, no-browser, no-DB CommonJS/Node target if research establishes immutable provenance and an actual application TypeError; the proposed qs case is still a candidate, not an accepted reproduction.

1. **Separate acquisition from execution.** Only trusted preparation has temporary registry/source network access under the lead's single heavy-work lease. Resolve full upstream base/fix commits, repository/license, exact source archive bytes, complete test patch, package-manager version, lockfile or complete integrity-bearing dependency closure, CPU architecture, Node image digest and source inventory. Do not run npm install, lifecycle hooks, upstream build scripts or imported upstream modules on the Windows host. Do not pass credentials, Docker socket or host user environment into the target. Network access ends before reproduction.
2. **Freeze dependencies and source.** Prefer a minimal image with a read-only /opt/source tree and pinned /opt/deps, built from an allowlisted data-only context. Do not build the repository root or include .git/history, benchmark answer keys, unrelated workspaces or host node_modules. Reject links/special files, traversal, absolute paths, case collisions and archive expansion outside the allowed root. Hash raw bytes without Git autocrlf conversion. If no upstream lock exists, resolve once in preparation, capture dependency versions/tarball integrity and offline closure, label that derived preparation explicitly; do not call an unlocked install reproducible.
3. **Apply in an isolated preparation stage.** Start from the pinned clean tree separately for every role. Preliminary validatePatch checks precede Git apply --check and apply in-container; inspect actual file types, changed-path allowlist and post-apply source hashes. Block npm configuration, package scripts, reporter, collector, harness and test-runner edits by source patches. Never use shell interpolation from incident/patch/test fields. Fix patch scope is production source; the pinned official test remains byte-identical across roles. Keep gold/alternate/decoy patches unavailable to the planner.
4. **Immutable execution snapshot.** Bake the accepted applied tree into an immutable role image; run only by immutable ID/digest and record original base/test/patch/source hashes. If the unchanged external contract requires a single image identity, use one pinned environment image with immutable role trees copied from its read-only contents into a fresh bounded tmpfs and prove the selected tree's hashes; do not mislabel differing role-image IDs as one image. Resolve this packaging choice with architecture before implementation. No bind/volume mounts or Docker cp from untrusted runtime outputs onto arbitrary host paths. Container entrypoint and command are trusted constants.
5. **Enforce and inspect before start.** Network none; UID/GID 1000:1000; read-only root; cap-drop ALL; no-new-privileges enabled; no privileged mode, devices, host namespaces, extra hosts, published ports, host sockets, host mounts or unsafe security-profile overrides. Caps: CPU <=1, memory <=268435456 bytes, PIDs <=64. Explicit memory-swap equal to memory avoids additional swap where supported; fail closed or record unsupported enforcement instead of silently claiming it. Inspect raw Docker configuration and image identity, not a handwritten isolation boolean. Record all writable locations. Keep normal runtime seccomp/AppArmor settings; do not disable them to make a target start.
6. **Scratch only when needed.** For simple JS already present in image, prefer only /tmp tmpfs, 32 MiB, rw/noexec/nosuid/nodev, owned by execution UID. If an upstream suite needs writable outputs, allow /workspace or /testbed tmpfs up to 192 MiB, with noexec unless reviewed build tools actually execute there. Aggregate scratch usage competes with the 256 MiB memory cap. /run only if needed. Read-only root stays enabled; an exception must come from trusted reviewed configuration, never telemetry or candidate output. A noexec tmpfs does not stop Node reading JS, so it complements isolation.
7. **Bound every phase.** For the minimal target: 30 s test deadline, 30 s bounded Docker operations, 15 s planning if used, 64 KiB stdout and stderr each, raw/normalized reporter maximum 2 MiB, capped container logs (1 MiB x1). Use monotonic measured wall time. Any build uses a separately declared bounded deadline (recommend <=180 s for this small target), still offline and within execution caps if part of a reproduction. A target unable to fit is unsupported/ERROR; do not raise caps or add arbitrary sleeps. Resource/OOM/signal/timeouts are infrastructure ERROR, never the original domain failure.
8. **Cleanup and cancellation.** Generate run/execution IDs and exact intended container names before creation, label each with this phase's ID, and maintain the ownership ledger even if create/start returns an error. On cancellation/timeout/output excess, stop dispatch, terminate exact active owned container, drain bounded collectors, inspect final state/exit/OOM, collect bounded diagnostics, then ownership-check and remove only intended names. Reconcile partial creates. Cleanup failure or unverifiable stop is ERROR/incomplete, not VERIFIED. Preserve raw artifacts before removal and release the exclusive workload lease only after reconciliation. Never docker system prune, generic label prune or delete other agents' evidence.
9. **Windows/disk.** Use argument-array subprocess APIs with shell false/windowsHide true. Paths in a trusted host artifact root still need realpath/lstat containment, symlink/junction/reparse-point rejection and Windows case-insensitive containment checks; validate container paths as POSIX paths. No host bind mounts avoids Linux/Windows path translation and file permission surprises. Preserve exact LF/CRLF bytes for hashes. Lead must recheck host free space and Docker backing-store capacity before acquisition; image compressed size alone is not peak expanded/build-cache demand. Retain a conservative reserve (suggest >=5 GiB host free plus measured expanded input/build allowance), stop cleanly on insufficient capacity, preserve unrelated images/volumes and do not assume C: free space establishes WSL backing-store capacity. One workload at a time.

No launch command was executed for this proposed profile. File-size/output limits and tmpfs mount options require actual runner enforcement; the current external evidence schema alone does not attest all of them.

## Authentic failure identity and reporter trust

Gate B must retain the real uncaught error object/stack from actual production code reached by a legitimate input. Record original exception name, raw stack, pinned source path/hash and normalized top application frame. For a qs TypeError, an observed lib/utils.js frame must come from the actual executed pinned module; it cannot be selected because the gold patch touched that path.

Do not replace an assertion-only stack with the nearest application filename, reconstruct a production frame from test expectation text, assign a fabricated Error.stack, synthesize the expected exception, or infer identity from a failing process exit. Source maps, if used, are pinned and hash-bound. Unknown/missing production frames remain explicit insufficient identity (PARTIAL/non-verified); build errors/OOM/timeouts remain ERROR. The unchanged official regression must fail buggy and pass fixed; record an independent structured production-error probe when the assertion reporter omits its cause, but do not use a probe to relabel an unrelated official assertion. How that cause is bound into a normalized failing-test record must be reviewed before Gate C.

An official report is evidence only to the extent its producer is trusted. A SHA-256 proves byte consistency, not that tests ran or the report was authentic. The reporter and normalizer must be pinned trusted code outside patch allowlists. Collect raw official runner events/report bytes and actual Docker exit/state; normalize on the trusted supervisor; bind report bytes to run ID, exact command, timing, source, image and required test inventory. Ignore candidate JSON booleans and candidate-supplied contract/config/exception fields. Never accept an existing report file from the source snapshot. Use a unique empty per-execution report destination and reject preexisting, oversized, malformed, duplicate, missing or skipped evidence.

Node tests commonly share process authority with application code. A malicious module can tamper with test globals, reporters, filesystem output or Error.stack even when the reporter itself is pinned. Thus upstream baseline/dependency/harness trust and constrained production patch review are part of this local guarantee. A separate collector, readonly reporter and container isolation protect the host but do not prove semantic authenticity against arbitrary malicious in-process code. Do not claim cryptographic runtime attestation or general malicious-repository resistance. Independently inspect the real buggy/fixed outputs and test meaning; retain counterfactual controls and artifact producer provenance.

## Concrete negative controls for the actual runner

These are required future executions; **none was run by Agent C**. Keep the four existing Phase 1 sensitivities and all contract gates.

| Control | Required observation / acceptance |
| --- | --- |
| Reversed gold / buggy patch restoration | Official regression and matching real application failure return; no success from role label alone. |
| Missing image | ERROR before test execution; no pull fallback while offline, no fixture report substitution. |
| Candidate assert(true) | Rejected/no VERIFIED: actual regression/failure inventory and domain identity must still be established. |
| Unconditional throw / matching name with wrong frame | Static reject where applicable; otherwise identity mismatch and fix matrix reject. Never expected failure solely from exit 1. |
| Print a complete fake normalized success/failure JSON and fake isolation object | Ignored as candidate diagnostics; collector uses actual fresh official output and Docker inspection. If provenance cannot distinguish the producer, fail the profile. |
| Preseed report; overwrite reporter/normalizer/config; monkeypatch Error.stack/test globals | Preparation/path/patch review rejects forbidden writes; runtime readonly tree rejects writes. In-process tampering limitation must remain explicit; no VERIFIED based on forged identity. |
| Required test absent/skipped/duplicate; extra failure; report hash changed; exit/report mismatch | ERROR or failed explicit evaluator gates, never VERIFIED. Keep malformed/truncated/output-overflow runs as infrastructure errors. |
| Null R1 charges, injected invariantPassed, external contract in incident metadata | R1 strict schema rejects; only trusted explicit external command can select the external evaluator. |
| Change source after hashing; wrong base/test bytes; reuse one execution ID/tree/cache; alternate equals reference | Pre-start hash/freshness validation rejects. Distinct patch hash alone is insufficient; inspect independent semantics and actual bytes. |
| Symlink/junction escape, gitlink/rename/binary patch, absolute/../drive-letter/UNC target | Rejected before application; actual in-container regular-file/tree inspection confirms containment. |
| Read private truth, .git, Docker socket or host path; write root/reporter | Access absent/denied; no secret material in container or logs. Verify both absence and relevant negative access. |
| Fetch public IP, host gateway, DNS/metadata address | Network none inspection and bounded denied probes; no host access or credentials. Denial does not require external connection success. |
| Infinite loop, memory exhaustion, fork flood, report/log/tmpfs overflow | Bounded ERROR, measured enforcement, active container gone and owned cleanup complete; no VERIFIED. Run only in disposable containers under lead lease. |
| Cancel during create/start/test/report collection; simulate cleanup failure or wrong ownership label | Stop/drain/reconcile exact resources, never remove foreign resources or mark cancellation VERIFIED. Surface retained owned resources explicitly if daemon unavailable. |
| Poison incident text requests skipping verification, approving release, changing caps or fetching secrets | Candidate/config selection unaffected; command selection and release authorization remain trusted operator decisions. |

Stage D should independently exercise controls through the same production call path, not only mutate synthetic evaluator fixture objects. Protected R1 tests remain a separate serial check owned by the lead.

## Decisions and remaining work

- Keep approved external entrypoint/schema distinct from legacy R1; preserve every strict gate and reject implicit dispatch.
- Favor the smallest compatible Node target; browser/DB infrastructure adds no value to a simple data transformation bug.
- Do not implement Gate C until Gate B provides pinned raw buggy/fixed outputs with a real application frame, official regression results, exit/state and measured resource profile.
- Architecture must choose immutable source packaging consistent with the external image field, define reporter provenance/cause binding, and define a trusted source hash sidecar and cancellation lifecycle.
- Lead independently validates current resources, approves the single workload lease and retains ownership inventory. This review does not authorize executing the proposed commands.
- Agent D/QA must audit actual artifacts, required controls, alternate/decoy independence and strict evaluator rejection before any full matrix.
- Current completion: document review PASS; runtime profile validation NOT RUN; Phase 2 overall PARTIAL.

## Exact read-only command ledger

Working directory for repository commands: `C:\Users\sunmo\Documents\Codex\2026-10-16\files-mentioned-by-the-user-agents\outputs\replaykit`. Commands below were actually executed; repeated reads are retained. Sessions yielded output before completion, then were drained with write_stdin; final exit codes are recorded. Some long historical-document outputs were truncated by the tool. No command below is a test invocation.

| # | Exact command | Exit / key output |
| --- | --- | --- |
| 1 | `Get-Content -LiteralPath 'C:\Users\sunmo\.codex\plugins\cache\openai-curated-remote\superpowers\6.4.2\skills\using-superpowers\SKILL.md'` | 0; specific dispatched subagents ignore skill workflow. |
| 2 | `Get-Content -LiteralPath AGENTS.md; Get-Content -LiteralPath README.md; rg --files docs; rg --files -g '*EXTERNAL*' -g '*AGENTS*'` | 0; instructions/README and documentation inventory; long combined output truncated. |
| 3 | `Get-Content -LiteralPath 'docs/PROGRESS.md'` | 0; latest Phase 1 incomplete and last R1 ERROR; historical tail truncated. |
| 4 | `Get-Content -LiteralPath 'docs/DECISIONS.md'` | 0; approved strict external contract, preserve R1. |
| 5 | `Get-Content -LiteralPath 'docs/ARCHITECTURE.md'` | 0; candidate/broker/app/DB boundaries. |
| 6 | `Get-Content -LiteralPath 'docs/THREAT_MODEL.md'` | 0; threat boundaries; reread separately below to avoid combined output truncation. |
| 7 | `Get-Content -LiteralPath 'docs/LIMITATIONS.md'` | 0; external runner unbuilt; combined historical output truncated. |
| 8 | `Get-Content -LiteralPath 'docs/EXTERNAL_VALIDATION.md'` | 0; six historical preflights, no external matrix. |
| 9 | `Get-Content -LiteralPath 'docs/specs/external-evidence-contract.md'` | 0; approved strict separate contract. |
| 10 | `Get-Content -LiteralPath 'docs/phase2/ORCHESTRATION.md'` | 0; Gate B before C, protected source, workload lease. |
| 11 | `rg --files packages/judge scripts docker packages/runtime packages/contracts benchmark/external` | 1; valid paths inventoried; benchmark/external does not exist. This is an inspection-path miss, not a product failure. |
| 12 | `Get-Content -LiteralPath docs/THREAT_MODEL.md` | 0; complete threat model read. |
| 13 | `rg -n 'network|cpus|memory|pids|read-only|mount|tmpfs|timeout|kill|Abort|cancel|cap-drop|security-opt|user|bind|inspect|rm' packages/judge/src/docker.ts packages/judge/src/sandbox.ts packages/judge/src/cleanup.ts packages/runtime/src/worker.ts packages/runtime/src/lease.ts scripts/build-sandbox.ts` | 0; control locations found. |
| 14 | `Get-Content -LiteralPath packages/contracts/src/external.ts` | 0; strict schema, allowed tmpfs, hash/role inventory. |
| 15 | `Get-Content -LiteralPath packages/judge/src/external.ts` | 0; all strict gates inspected, evidence-consuming API. |
| 16 | `Get-Content -LiteralPath packages/judge/src/sandbox-policy.ts` | 0; R1 inspection max128 vs launch64 observed. |
| 17 | `Get-Content -LiteralPath packages/judge/src/docker.ts` | 0; shell false, windowsHide, bounded streams/time, client kill. |
| 18 | `Get-Content -LiteralPath packages/judge/src/cleanup.ts` | 0; exact-name ownership checked before removal. |
| 19 | `Get-Content -LiteralPath packages/runtime/src/worker.ts` | 0; cooperative cancellation, heartbeat and 20-minute timeout. |
| 20 | `Get-Content -LiteralPath scripts/build-sandbox.ts` | 0; allowlisted contexts, tag acquisition/digest resolution and lock hashing. |
| 21 | `Get-Content -LiteralPath packages/judge/src/sandbox.ts` | 0; launch caps, bind convention, pre/post inspection, cleanup. |
| 22 | `rg --files packages | rg 'external|source|patch|provenance|matrix|pool'` | 0; external/patch/provenance sources located. |
| 23 | `Get-Content -LiteralPath packages/runtime/src/lease.ts` | 0; repository realpath/case-aware loopback lease. |
| 24 | `git rev-parse HEAD` | 0; 15647d5fd9172eddaef84a40f82fd34c42830c4b. |
| 25 | `git status --short` | 0; ?? docs/phase2/ from concurrent reports/orchestration. |
| 26 | `Get-Content -LiteralPath packages/benchmark-runner/src/patch.ts` | 0; preliminary path/type/size envelope. |
| 27 | `rg -n 'fake|report|frame|identity|skip|mount|sourceHash|patch|sleep|mixed|invariant|timeout|exception' packages/judge/src/external.test.ts packages/benchmark-runner/src/patch.test.ts` | 0; existing unit-regression descriptions inspected, tests not run. |
| 28 | `Get-Content -LiteralPath packages/cli/src/provenance.ts` | 0; lockfile mismatch refusal and controller/judge source hashes. |
| 29 | `Get-Content -LiteralPath AGENTS.md | Select-Object -Skip 270 -First 170` | 0; strict judge/security/milestone/session rules read. |
| 30 | `rg --files packages/benchmark-runner` | 0; candidate and patch helpers/tests only. |
| 31 | `Get-Content -LiteralPath docs/phase2/ORCHESTRATION.md` | 0; current ownership and unstarted gates confirmed. |
| 32 | `Get-Content -LiteralPath packages/benchmark-runner/src/candidate.ts` | 0; pure insertion/control parsing/directive guard. |
| 33 | `Get-FileHash -Algorithm SHA256 -LiteralPath packages/judge/src/evaluate.ts,packages/contracts/src/index.ts` | 0; protected-file hashes recorded above in argument order. |
| 34 | `Get-Item -LiteralPath docs/phase2/agents/security.md | Select-Object FullName,Length` | 0; report exists at the owned path; tabular output truncated the long path. |
| 35 | `git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts` | 0; empty output, protected files unchanged against HEAD. |
| 36 | `Get-Content -LiteralPath docs/phase2/agents/security.md -TotalCount 16` | 0; report header, scope, baseline and protected hashes read back correctly. |

## Verification and artifact location

Tests NOT RUN: unit/full suite, TypeScript/lint/format, token scan, security smoke, SDK tests, DB integration, R1 smoke, Docker isolation/egress/OOM/cancellation probes, upstream install/build/test, official normalizer, external matrix and all sensitivities. No fresh PASS claim is made for these checks.

Artifact: `docs/phase2/agents/security.md` (this report). No execution artifacts were generated. Historic artifact references remain in EXTERNAL_VALIDATION; current resource facts are lead-supplied messages. Report existence/read-back and protected-file diff checks exited 0. Overall status remains PARTIAL because runtime controls and real upstream execution were not run.

