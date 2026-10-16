# D2/N5 and saved-test patch verification

Status: proposed design for review. No functionality in this document is implemented yet.

## Intent and retained constraints

The next milestone resumes correctness work after R1 performance hardening: prove a real lost inventory update (D2), reject a real same-exception/different-path control (N5), and rerun an already verified regression test against a proposed repair. The user's latest direction supersedes the earlier deferral of D2/N5. Performance tuning is closed.

Retain fresh initdb, concurrency three, fsync on, the existing rolling pool, ownership-checked forced cleanup, and per-execution isolation/resource limits. Keep the PostgreSQL template optional. Do not add a background reaper, overlap database/application boot, run substrate benchmarks, or change concurrency defaults in this milestone.

Scope is the engine and CLI. A reusable `verifyCandidatePatch` operation supplies the future `verify_candidate_patch` adapter. Cursor plugin/MCP transport, a dashboard, the remaining incident corpus and the 20-case benchmark remain deferred. This transport choice is a proposal, not a claim that an MCP tool already exists.

Success means real Docker/PostgreSQL evidence supports R1 and D2, N5 is rejected for the correct reason, and saved-test patch results cannot be mistaken for a new strict reproduction verdict. No runtime target is promised: patch build, startup, test and total durations must be recorded separately. The suggested approximately 15-second loop remains an estimate.

## Approach and alternatives

Extend the existing contracts, sandbox and judge through explicit payment/inventory scenario adapters. Keep shared isolation, scheduling, provenance and verdict aggregation in one implementation. Implement D2/N5 first, then use those two positive scenarios to validate the patch workflow.

Two alternatives are intentionally deferred. A separate D2 runner would duplicate security and judge logic. Building a general plugin/scenario framework or the Cursor transport now would expand the milestone before the new real execution paths are proven. The proposed adapters cover only R1 and D2; they are not an arbitrary benchmark extension API.

## Contracts and compatibility

Introduce a versioned scenario discriminator for payment replay and inventory replay. Each scenario has validated incident input, plan input and trusted domain observations. Preserve a read adapter for existing version-one R1 incidents/plans/results and their hashes; do not rewrite saved artifacts or regenerate their tests during patch verification. Persist new records with an explicit schema/evaluator version.

The inventory observation contains initial stock, final stock, committed reservation rows and their total quantity. The payment observation retains actual charge and request counts. The strict judge selects its invariant from trusted supported-scenario configuration, not a candidate-provided assertion or incident ID. Keep the existing counts: ten fresh buggy failures, three reference passes, three alternate passes and one decoy failure.

The sandbox broker permits only scenario-specific operations bound to the captured request, identifiers and finite checkpoint plan. It must not grow a generic SQL, shell, URL or filesystem operation. The SDK exposes domain calls; the supervisor independently collects database state and execution evidence.

## D2: real lost inventory update

Use one synthetic inventory item with initial stock ten and two distinct reservation requests for quantities one and two. Each successful reservation commits a ledger row. The invariant is `remaining stock = initial stock - sum(committed reservation quantities)`; the valid final stock is seven with two reservations.

The buggy implementation reads a stock snapshot and later writes its computed remaining value without protecting that snapshot. Two actual PostgreSQL transactions can therefore commit both reservation rows while overwriting one decrement. The reference uses an atomic conditional decrement. The alternate uses a versioned compare-and-swap with a bounded conflict retry. The decoy preserves the lost update while suppressing the error or presenting a corrected response; trusted database observations must still reject it.

Wire the existing cooperative scheduler into opted-in application checkpoints. Both operations reach an after-read checkpoint before either mutation is released. Release the first mutation and wait for its commit checkpoint, then release the second. Both commits finish before either final invariant observation. Place checkpoints so the atomic and compare-and-swap implementations can complete the same finite schedule. A locking implementation that waits for another blocked checkpoint is not an acceptable alternate.

Requests remain actual concurrent HTTP operations. A bounded broker operation can coordinate the pair and named checkpoints; it must not reproduce the race by editing ledger results or throwing an expected error. Record arrivals/releases, observations and completion. Missing arrivals, out-of-order release, cancellation or incomplete schedules produce explicit execution errors. No correctness assertion depends on sleeps.

Use PostgreSQL READ COMMITTED transactions. The shared application invariant raises `LostInventoryUpdateError` at normalized application frame `inventory/reserveStock` only after observing the actual committed inconsistency. Both valid implementations retain that check; integration tests seed inconsistent state to prove it remains active. Capture real stack/trace/request evidence and generate a reviewable test from the visible input and supported operation pattern. Missing quantities, initial state or required schedule evidence must cause an explicit abstention rather than guessed values.

## N5: real wrong-path control

The existing R1 smoke changes a frame string in memory; retain that small judge regression but do not call it the full N5 implementation.

Capture N5 from a minimal real refund-ledger operation that detects duplicate refund records and raises the same `DuplicatePaymentError` class from `refunds/createRefund`. The original incident therefore has a genuinely different application frame. This path is outside the supported payment/inventory replay operations in this milestone.

The planner must abstain for the unsupported failure path with an explicit reason, independent of the incident's ID. Separately feed a deliberately wrong payment reproduction, with real payment execution evidence, to the strict evaluator and require failure-identity rejection. Do not use the N5 label to force a negative result. If the supported replay surface later includes a valid reproduction of this refund path, revise or reclassify this control instead of rejecting correct evidence.

Test the neighboring supported payment path and renamed incident IDs so broad exception-name rejection cannot make N5 pass accidentally.

## Preliminary progress

Add a progress channel distinct from `JudgeResult.status`. After the first completed buggy execution establishes a real domain failure with the matching identity, emit:

`PRELIMINARY: failing test observed once, strict verification running`

Emit structured progress with an increasing sequence number to a local progress artifact and human-readable CLI stderr. Keep stdout suitable for the final JSON result. Include completed/required matrix counts. Serialize progress writes so concurrent workers cannot overwrite newer state with older events.

Do not emit this message for infrastructure failure, a wrong-path exception, arbitrary candidate failure or incomplete evidence. Never emit VERIFIED through this channel. Only the existing full strict judge can produce VERIFIED after every gate passes. Later failure/cancellation must end the progress stream with its actual final result; earlier preliminary observations remain explicitly provisional.

## Saved-test patch verification

Proposed CLI:

```sh
pnpm replaykit patch verify --run <verified-run-id> --patch <relative-diff-path> --repetitions 1
```

Allow one or two fresh repetitions, default one. Each repetition gets its own database, application, candidate and network. This path does not rerun the reference/alternate/decoy matrix, and does not update the parent's VERIFIED result.

The input is a UTF-8 unified diff of at most 1 MiB against the exact public application source snapshot recorded by the original verified reproduction. Apply it only in a disposable staging directory, allowing at most twenty modified files and 2 MiB total resulting service source. Permit ordinary TypeScript service-file modifications under the recorded app source allowlist. Reject absolute/traversal paths, symlinks, binary patches, renames, submodules, additions/deletions, files outside that snapshot, and changes to dependencies, build configuration, tests, SDK, scheduler transport, judge or instrumentation protocol. A patch that needs unsupported changes is rejected clearly; this first interface is not unrestricted repository patch execution.

Package an immutable public source snapshot and fixed build configuration with new reproductions. The original application image must use the compiler output from that exact snapshot and build configuration; reject stale source/compiled-output combinations. Record the snapshot digest and its relationship to the original app image, along with dependency-lock and controller-source digests. Older verified runs lacking an authentic source snapshot must fail with a precise unsupported-provenance reason and require a new reproduction; never guess their base from today's checkout.

Build with a fixed trusted compiler configuration inside a disposable, network-disabled, unprivileged container: one CPU, 512 MiB memory, 64 PIDs, 128 MiB scratch, 64 KiB diagnostics and a 60-second deadline. Keep its root filesystem read-only and drop capabilities. These compiler limits are separate from the unchanged 256 MiB application/candidate limits. Prepare the compiler/dependency image during the explicit sandbox build phase. Do not run patch scripts, package hooks, custom Dockerfiles or new dependency installation. Candidate patch code must never execute on the host, and the compiler/candidate app must not receive private reference/alternate/decoy sources or Git history.

Run the exact saved test bytes and hash against the resulting immutable candidate app image. Verify parent result, incident, plan, source snapshot and candidate-test hashes before execution. A modified test, stale/mismatched base, unsupported patch, build failure, unavailable image or incomplete execution cannot produce a successful patch result.

Use a distinct `PatchVerificationResult` with statuses `PATCH_TEST_PASSED`, `PATCH_TEST_FAILED` and `ERROR`. Success requires every requested fresh repetition to complete successfully, the saved test to pass, the scenario's independently queried database invariant and required operations to hold, and the original isolation/offline/resource checks to pass. Include parent run ID, exact test/base/patch/image hashes, repetition counts, trusted observations, stage/total timings and reason codes.

This result establishes that the proposed repair passed this saved regression under the recorded conditions. It does not assert general patch correctness, rerun the strict reproduction proof or authorize applying/merging/deploying the patch. Fake API success with an incorrect trusted ledger must fail.

## Implementation boundaries

- `packages/contracts`: versioned scenario, progress and patch-result schemas; legacy R1 read compatibility.
- `apps/checkout-api`: real inventory/reservation and small N5 refund paths, shared invariant checks, finite checkpoint instrumentation and visible telemetry.
- `packages/replay-engine`: reuse the cooperative scheduler; add only the bounded transport needed for real request interleavings.
- `packages/planner`, SDK and broker: supported domain operations derived from visible evidence, with no hidden-truth lookup.
- `packages/judge`: scenario invariant adapters, source/test provenance, fixed isolated patch build/execution and distinct patch results.
- `packages/cli`: capture/smoke selection, preliminary progress and the patch-verify command.
- `scripts/build-sandbox.ts`: allowlisted public source/build snapshot and compiler image; preserve existing application/candidate/private truth separation.
- `benchmark/private/D2` and N5 fixtures: genuine source variants and explicitly labeled negative control, independent of planner input packaging.

## Acceptance checks

1. Existing R1 unit/SDK/PostgreSQL/security checks and the full R1 smoke still pass. Existing saved R1 reports remain readable.
2. D2 produces real lost-update state under the recorded finite schedule in ten fresh buggy runs. The identical test/schedule passes three reference and three alternate runs; the decoy fails with trusted inconsistent state. All strict gates remain required.
3. N5 capture contains the actual wrong application frame. Planner abstention gives the correct reason, and a real payment failure cannot satisfy N5 identity. Renaming IDs does not change those decisions.
4. Progress tests cover out-of-order worker completions, first-run infrastructure errors, wrong identity, cancellation and eventual gate failure. No route can emit VERIFIED before the full matrix completes.
5. Patch checks exercise an unchanged faulty patch, valid repairs, a symptom-hiding repair, a fake-success API, stale source, modified saved test, malformed/traversing/unsupported patches, compiler errors, resource exhaustion and absent provenance.
6. Live security probes cover private-file/host access, writes outside allowed scratch, network egress, arbitrary broker commands, loops and memory exhaustion for the relevant new build/runtime boundaries. Teardown preserves ownership checks.
7. Record actual commands, counts, hashes, timings and limitations in PROGRESS. Measure patch build separately from replay; do not promise a 15-second result or claim remote CI/IDE success without running it.

Stop after these core/CLI paths and applicable checks work. No further speed optimization or expansion to the full 20-case corpus is part of this design.
