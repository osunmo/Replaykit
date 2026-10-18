# External validation — Phase 1 blocked

Gate 0 passed. Phase 1 Stage A and Stage C did not meet acceptance. There is no
VERIFIED external instance. The real attempts below are feasibility preflights,
not completed ReplayKit matrices. Phases 2–4 were not started.

Final local checks passed: 42 files / 461 tests, a clean 49,833-file token scan,
TypeScript, lint and format. The latest R1 smoke is **ERROR**, not VERIFIED:
PostgreSQL-readiness Docker exec calls timed out before matrix candidate execution.
The earlier Gate 0 pass is retained as a historical checkpoint, not substituted
for this final failure.

## Implemented scope

The approved `external-official-suite-v1` schema and explicitly selected evaluator
are implemented separately from R1. The legacy R1 schema/evaluator match
`94fc971` byte for byte. Null ledger observations and incident metadata cannot
activate the external evaluator. Both contracts retain their strict 10/3/3/1,
failure-identity, valid-fix, decoy, static-review and isolation requirements.

The external manifest now pins the full base commit and complete official
test-file content hash. Every matrix execution must match both, along with the
image, patch, candidate and test-patch content hashes. A narrowly scoped
source-data helper extracts one complete newly added `it` statement only when
the rest of the pinned file, control statement parse and directive prologue
survive unchanged. It rejects control-title edits, imports, hooks, helpers and
additional tests. The separate path/type helper rejects unsafe paths, binary
patches, symlink/gitlink index modes and file-mode/rename metadata. These helpers
are unit-tested guards; they do not apply or execute patches on the host.

**Unbuilt:** production external supervisor/runner, official reporter normalizer,
external CLI command, matrix integration, independent alternate/decoy fixes and
four sensitivity runs. In-container Git checking and filesystem-type inspection
are still required before those helpers can be part of a runner. Contract tests
use labeled synthetic unit fixtures; their VERIFIED results are not benchmark
results. Trusted throwaway preflight scripts are archived with this report.

## Dataset and environment provenance

Research and acquisition occurred online, separately from offline execution.
The pinned [Multilingual dataset](https://huggingface.co/datasets/SWE-bench/SWE-bench_Multilingual)
is revision `846e647b9f33c0b51b739d005d13d85493c9af09`.
Its Parquet SHA-256 is
`92abca7cb527b41a9f66d03a26ce441ff7319e3a49f985998fd56be4bb9b08b2`.
All 300 API rows were compared with that pinned file and matched exactly.
The MIT dataset card reports 26 JavaScript instances across 3 repositories and
17 TypeScript instances across 4 repositories. Source repositories' MIT licenses
were downloaded at each selected base revision.

The official [Multi-SWE-bench repository](https://github.com/multi-swe-bench/multi-swe-bench)
reports 1,632 instances across seven languages. The current
[SWE-bench Pro card and terms](https://huggingface.co/datasets/ScaleAI/SWE-bench_Pro)
describe V2 with 642 public instances and public amd64 GHCR images; the
`jefzda/sweap-images` tags in the original task refer to legacy V1. Pro's terms
were read, but no Pro image or task was executed. No benchmark affiliation is
claimed.

| Instance                        | Base commit                              | Acquired image digest (amd64)                                    | License and upstream context                                                                                                                                                                   |
| ------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| immutable-js__immutable-js-2006 | 493afba6ec17d9c999dc5a15ac80c71c6bdba1c3 | ecf16bc4835839696fac8f3eed1ec36473306d5277a641f2e05254f9a552608d | MIT; [PR 2006](https://github.com/immutable-js/immutable-js/pull/2006), [issue 1992](https://github.com/immutable-js/immutable-js/issues/1992), merge 23daf26b51ecc2805dcd9ac8534ce523397f9b62 |
| preactjs__preact-3010           | c12331064f4ea967641cd5e419204422af050fbb | e8aa1e355221d42235e7beb1d83c902b1ca9f40112af090d4d87e60b3f69366d | MIT; [PR 3010](https://github.com/preactjs/preact/pull/3010); dataset issue text retained                                                                                                      |
| facebook__docusaurus-10130      | 02e38d8ccf7811af27a9c15ddbadf4d26cfc0eab | Unavailable: acquisition canceled; no execution                  | MIT; [PR 10130](https://github.com/facebook/docusaurus/pull/10130); dataset issue text retained                                                                                                |

Image tags are respectively:
`swebench/sweb.eval.x86_64.immutable-js_1776_immutable-js-2006:latest`,
`swebench/sweb.eval.x86_64.preactjs_1776_preact-3010:latest`, and
`swebench/sweb.eval.x86_64.facebook_1776_docusaurus-10130:latest`.
The first two were executed by `name@sha256:digest`, never by mutable tag.
Docusaurus has no established digest and is not a selected runnable instance.

Gold/test patch hashes are hashes of the exact dataset diff bytes, not hashes of
commit strings. The machine-readable provenance also retains official test
inventories and actual per-attempt source hashes. Early preflight result files
call the whole patched official file's hash `candidateHash` or
`fullTestFileHash`; they are not normalized external-contract evidence and do
not claim that the new extraction profile ran.

## All real external preflights

| Attempt suffix                       | Instance       | Outcome                                                                         | Whole preflight wall ms |
| ------------------------------------ | -------------- | ------------------------------------------------------------------------------- | ----------------------: |
| 68c03d08-34b1-4b7d-ad1c-d37137df8bbb | Immutable 2006 | ERROR: build prepare could not execute on a noexec workspace                    |              48672.5423 |
| c145d800-b1bc-403a-85b4-a60a78069a48 | Immutable 2006 | ERROR: full build's stats step attempted unavailable online bundlephobia access |              51221.0208 |
| 1b53b192-1989-4a39-bb49-c34b3f103719 | Immutable 2006 | COLLECTED: official test failed, 22 controls passed; application frame missing  |              48080.3707 |
| 1257da97-e892-4ee6-af69-07e807cf0efd | Preact 3010    | ERROR: Chrome could not start; 30 s test-command deadline                       |              40011.9299 |
| 3e51c729-a3fa-4e66-ab6a-872b308e302f | Preact 3010    | ERROR: diagnostic rerun, Chrome pthread_create failures; no test completed      |              41335.8426 |
| dc34a876-5614-45e1-a690-0bbc1f0e8e14 | Preact 3010    | ERROR: reduced-process launcher also failed; no test completed                  |              39544.5366 |

All attempts used fresh offline containers, nonroot UID/GID 1000, one CPU,
256 MiB memory, 64 PIDs, dropped capabilities, no-new-privileges, read-only root
and no host bind mounts. The first workspace mount inherited noexec; later
attempts explicitly made only the disposable 192 MiB source workspace executable.
The 32 MiB /tmp mount stayed noexec. The exact Docker argv, inspections, commands,
exit statuses, cleanup and timing are in each `attempts/*/commands.json`.

Immutable's final preflight used upstream `build:dist`, which produced the
package main actually consumed by upstream Jest, rather than the full build's
online statistics step. Build and Jest supervisor bounds were 180 s and 60 s;
actual Jest command wall time was 16483.5764 ms. These are preflight settings,
not conformance to R1's 30 s candidate deadline. Build exited 0; Jest exited 1.
The raw official JSON recorded 22 passed, 1 failed, 0 pending. Its actual stack:

```text
expect(received).toEqual(expected)
at Object.<anonymous> (__tests__/Range.ts:202:7)
```

Only a test assertion frame was present. No production application frame was
observed; it was never inferred from the gold patch or relabeled from that test
frame. The evidence assessment is PARTIAL with
`APPLICATION_FAILURE_FRAME_MISSING`, not an infrastructure ERROR and not a
formal matrix verdict.

Preact used upstream Karma with a trusted diagnostic JSON reporter for actual
reporter events, not candidate pass/fail booleans. Chrome failed before any spec
completed. The last low-process attempt added single-process/no-zygote,
one renderer/raster thread and concurrency one, while preserving the limits and
30 s deadline. Chromium's single-process mode is an experimental unsupported
configuration; this attempt establishes no browser or runner conformance.
Raw stdout/stderr and zero-spec progress are preserved where collected.

Docusaurus acquisition was canceled when C: had 3,723,161,600 bytes free
(about 3.47 GiB). Only the exact task-owned `docker pull` process was stopped;
its exit was 1. No Docusaurus container ran. No unrelated Docker images, files
or volumes were removed. A later free-space observation can differ after a
canceled pull; it does not establish that this image can be safely acquired.

## Raw counts and interpretation

This is exploratory feasibility work, **not a completed Stage C study**.
Three acquisition candidates across three repositories were pursued; two reached
execution preparation. Six preflights produced 5 infrastructure ERRORs and 1
COLLECTED official failure with insufficient identity. Per-instance preflight
assessments: PARTIAL 1 (Immutable), ERROR 1 (Preact), acquisition blocked 1
(Docusaurus). These are not normalized judge verdict counts.

Completed external 17-run matrices: 0. Formal matrix verdict counts:
VERIFIED 0, PARTIAL 0, NOT_REPRODUCED 0, ERROR 0 (denominator 0).
External VERIFIED claims: 0 across the three pursued candidates. A false-VERIFIED
rate is unavailable because there are no external VERIFIED claims (denominator
0). No percentage or held-out result is reported.

No LLM planner/provider calls were made. Model ID, tokens and cost are null;
coding-session usage is not measured by ReplayKit. Public benchmark instances
may have been present in model training data. Future model runs must disclose
that contamination risk and must not be called held-out.

## Verification and raw-output locations

Gate 0's final `pnpm test` exited 0: scanner clean on 49,807 files,
40 files / 422 unit tests passed. TypeScript, lint and format exited 0.
Real R1 smoke `d4941e32-8d5c-4b8c-8164-afbb421e1400` exited 0 with
PASS/VERIFIED, 10/3/3/1, wrong-frame rejection and missing-body abstention.
Its verification wall time was 408708 ms; execution-time sum 1140273 ms;
complete smoke wall time 472318.2805 ms. No owned containers remained.

The current next-steps chat's `outputs/phase1/` contains:
`REPORT.md`, `RAW_OUTPUTS.txt`, `COMMANDS.json`, `provenance.json`,
`gate0/r1-smoke/`, the final R1 smoke export if completed,
and `attempts/` with every preflight. The report records final quality checks,
diff statistics and commit IDs. `sources/` preserves the pinned data, licenses
and selected upstream source as data; `supervisors/` preserves trusted probes.

Raw command logs retain failures and retries. Synthetic non-canary token strings
printed by deliberately failing scanner tests are masked in the exported logs;
the approved fake canary remains exact. No credential value is printed by the
fixed scanner. Some research tool outputs were truncated; pinned source files and
the per-attempt Docker command records are the authoritative complete artifacts.

## Final R1 rechecks

Two post-change attempts are retained alongside the Gate 0 pass:

- `d2d4d903-4317-4588-9cdf-734abe665b35`: ERROR /
  `SANDBOX_UNAVAILABLE`, metadata `PROVENANCE_LOCKFILE_MISMATCH`; no matrix
  ran. A new empty workspace declaration had caused lockfile churn. Removed that
  unused declaration and restored the original lockfile bytes; no dependency or
  runnable external package was added. The manifest and provenance checks were
  not edited or bypassed.
- `cf6ae2b2-e044-4726-b638-9053f031ca85`: ERROR /
  `EXECUTION_ERROR`. Three buggy preparations reached PostgreSQL readiness,
  then Docker exec calls timed out. No matrix candidate request ran; reference,
  alternate and decoy were not executed. Verification wall time 121640 ms;
  execution-time sum 297989 ms; whole smoke wall time 186042.1874 ms.
  PostgreSQL logs later showed readiness, but the root cause of the Docker exec
  timeout is unverified. Full tests/token scanning overlapped this smoke, so
  resource contention is a confounder, not an established explanation.

Both shell invocations returned exit 1 while pnpm reported lifecycle exit 2.
The preceding incident-capture traffic did succeed; these failures concern the
subsequent verification matrix and are not claims that no capture code ran.
Their complete run directories are exported under `r1-rechecks/`. The final
owned-container check was empty (exit 0). A read-only inspection approval review
timed out once; a bounded retry succeeded. Final acceptance remains unmet;
timeouts and limits were not relaxed and no repeat was substituted for the
recorded failures.

## Acceptance still outstanding

- Choose one feasible instance satisfying identity, runtime, license and image
  requirements; Docusaurus cannot be marked selected without a digest and run.
- Build the trusted production runner, official reporter normalization, strict
  hashing/type/apply checks and explicit external command.
- Author independent alternate and honest decoy patches; run 10/3/3/1.
- Run reversed-gold, missing-image, assert-true and unconditional-throw
  sensitivities through that same implementation.
- Complete Stage C on 3–5 instances across at least two repositories.
- Optional Stage B remains unbuilt and unrun. No external model was configured.
- Stage A, Stage C and Phase 1 acceptance remain unmet. Rule 8 requires reporting
  these blockers rather than simulating completion. Phases 2–4 remain deferred.
