# Decisions

## 2026-10-17 — Bind official evidence and preserve blocked outcomes

- Bind every external role to a full base commit and actual official test-file
  content hash; require that file in the source inventory. A merely well-formed
  hash is insufficient. R1's schema and evaluator stay byte-identical to 94fc971.
- The narrow single-added-test profile reviews the complete extracted statement,
  while the pinned full file is executed and hash-bound. Reject changes to
  imports, hooks, helpers or controls. Preserve original control parsing and
  directive prologues; a text-only insertion can otherwise rename a control or
  change automatic semicolon insertion/strict mode.
- Path/type inspection is a preliminary guard, not Git patch validation. A future
  runner must still check/apply inside its fresh container and inspect actual
  filesystem types. Symlink/gitlink index modes are rejected now.
- Do not weaken failure identity for assertion-only official tests. Immutable's
  real test failure lacks an application frame; it is insufficient evidence,
  never a fabricated identity or a VERIFIED result.
- Keep CPU/memory/PID limits unchanged after Preact Chrome startup failures.
  Stop image acquisition at the observed low-storage constraint; do not prune
  unrelated user resources. Preflights do not substitute for Stage A or Stage C.
- Record all failed attempts, null model/cost fields, public-data contamination,
  the missing sensitivities and the unbuilt production runner explicitly.

## 2026-10-17 — Approved separate official-suite evidence contract

- The user approved replacing the unreviewed null-charge fallback. Restore the
  committed R1 execution schema and evaluator exactly; null ledger observations
  cannot select another contract. Permanent tests reject the former invariant
  field on buggy, reference, alternate, decoy, and complete-matrix inputs.
- External official tests use `packages/contracts/src/external.ts` and the
  explicit `evaluateExternalEvidence` entry point in `packages/judge/src/external.ts`.
  No incident or telemetry argument dispatches to that entry point. A trusted
  runner must bind the pinned manifest, content hashes and official test inventory.
  The evaluator's unit fixtures are not external-project verification evidence.
- Require complete normalized official reports with their content hashes. Reject
  duplicate/skipped/missing required tests, altered reports, mixed schemas and
  fabricated invariant fields. Both independent valid fixes must pass; the decoy
  must still fail the invariant. Preserve the 10/3/3/1 matrix, failure identity,
  candidate consistency, resource/isolation, fresh-state and static-review gates.
- Require inspected mount information and distinct patch content hashes. Host
  bind mounts are not accepted by the external contract. A documented official
  test review-length exception or writable-root exception belongs only to trusted
  configuration; neither relaxes R1 or disables network/resource restrictions.
- Replace the scanner's text grep prefilter with NUL-delimited Git file
  enumeration and byte-stream scanning. Include binary files, tracked files
  subsequently ignored, and ignored runs/work/docs artifacts. Skip Git object
  stores and dependency directories generically. Symlinks and scan failures are
  rejected; findings contain file and line only. Bound reading to eight streams
  and handle token/canary boundaries across chunks.

## 2026-10-16 — PostgreSQL template and measurement follow-up

- Retain fresh initdb as the default after measurement. The template reduced observed PostgreSQL startup/readiness cost at concurrency three from 3.232 to 1.943 seconds per execution, but sampled full-smoke means were 109.359 seconds for initdb and 121.653 seconds for the template, two runs per mode with substantial variation. This is not an established end-to-end optimization. Expose the template through `pnpm sandbox:build --postgres-mode template-copy`; restore the default through `--postgres-mode initdb`. Keep concurrency three and fsync on. See [the complete measurement report](POSTGRES_PERFORMANCE.md).
- Verify review recommendations against code and timelines before changing behavior. Cleanup already uses ownership-checked `docker rm -f`, and the bounded worker pool already refills immediately. In the user's measured run `2e08d0cd-b9de-4aa3-93d9-9392c379feb9`, the first replacement started at 37.42 s while the other initial jobs finished at 37.77 s and 38.08 s. Across 14 refills, delay from a completed execution to the next start was 0.35–5.34 ms. Five-second container sampling cannot establish a batch barrier.
- For the opt-in template mode, move PostgreSQL cluster initialization and empty-schema creation into an allowlisted image build. Generate schema SQL from the exact compiled database module copied into the application image; keep normal application initialization idempotent and retain its identifier-sequence initialization. Record the PostgreSQL base and runtime image IDs, template-source hash, schema hash and fsync setting.
- Copy the stopped template into each execution's empty 128 MiB tmpfs. Retain a distinct PostgreSQL process, random password, application, candidate and internal network for every execution. The immutable template contains no usable password and no application rows. Runtime credential installation happens before TCP startup; the stock image's password initialization cannot be relied on for preexisting data directories. See the [official PostgreSQL image documentation](https://github.com/docker-library/docs/blob/master/postgres/content.md).
- Keep `fsync=on` as the default and evaluate `off` as a separate setting, avoiding a combined attribution for template copying and durability changes. PostgreSQL documents fsync-off use for databases that can be recreated, but it removes crash-durability protection. These disposable tmpfs executions test application behavior, constraints and isolation, not crash recovery. See [PostgreSQL 17 fsync documentation](https://www.postgresql.org/docs/17/runtime-config-wal.html#GUC-FSYNC).
- Reject initdb manifests that request fsync off: the stock entrypoint does not consume the custom environment setting. This guards measurement provenance; an off label must never describe an unchanged stock configuration. The template entrypoint explicitly applies and validates the setting.
- Add `--sampling on|off` to the measurement wrapper. Off mode removes periodic Docker ps/stats work, retains the same timer and all verification gates, and records zero samples with unavailable peaks. The initial Docker capacity query stays outside the timed interval. Label sampled and unsampled runs explicitly.
- Measure the full 17-execution matrix sequentially and at concurrency 3 and 6. The nine completed observations include initdb at 1 and 3, template at 1, 3 and 6, one template/concurrency-three unsampled run and one fsync-off run. Initdb/concurrency-six and a sequential unsampled run were not measured. Preserve candidate bytes and hashes across variants and comparisons. Use the same rebuilt app/candidate/planner images for fresh-initdb and template comparisons; PostgreSQL runtime images necessarily differ. Keep final rebuild validation separate from the performance set. Record actual outcomes and host/warm-up variation rather than promising a speedup.

## 2026-10-16 — performance hardening

- Use a refillable worker pool, configurable from 1 to 10 concurrent executions with default 3. Every execution owns its PostgreSQL state, application, candidate and Docker network; no mutable state is shared.
- Require three passing repetitions of each valid fix, alongside 10 fresh buggy failures and the duplicate-charge decoy. Preserve every existing verification gate and add distinct execution IDs.
- Pin one image manifest and candidate source per verification matrix. Treat trusted database/application observations as decisive evidence.
- Profile exclusive execution stages and pipeline wall time separately. Compare concurrency 2 and 3 using the same strengthened matrix, images and candidate, and retain failed resource samples as unavailable.
- Retain independent database lifecycles. Profiling motivated evaluating the tradeoff, but this milestone has no database-reuse experiment or measured reuse benefit.
- Keep raw evidence and generated credentials local and ignored. Publish only an allowlisted, portable measurement summary with relative paths. Preserve local Git history and explicitly document historical generated artifacts.
- Stop at R1 performance hardening. D2, Cursor/MCP integration, a dashboard and additional benchmark cases remain deferred; local test success does not imply remote CI success.

## 2026-10-16

- First delivery is the R1 vertical slice from the supplied milestone order. Later phases remain explicitly incomplete.
- Node 22.23.3 is installed and within maintained Node 22 LTS; use it for local checks. Official schedule: https://github.com/nodejs/Release.
- Use a dedicated new source directory under outputs/replaykit because this chat has no repository. No worktree is required to isolate existing work.
- Native implementation in this session, parallel read-only architecture/environment checks, then an independent review. Tests precede behavior changes.
- Fixed local synthetic provider ledger is real PostgreSQL state, with no external payment API or real credentials.
- Candidate test and checkout service run in separate containers. Judge queries DB state independently; candidate stdout never establishes a successful gate.
- Source variants are immutable files with hashes. Only the selected app implementation is copied into each runtime image; judge truth is excluded from candidate build context.
- The offline candidate uses a bounded stdin/stdout broker for the exact captured payment and charge-count query. It receives no application network or database credentials.
- The deterministic planner runs in its own restricted image, with the visible buggy snapshot and normalized incident input. A future LLM adapter remains outside this delivery.
- Bind supported incident revisions to the full immutable buggy application image ID. Record runtime image IDs and source hashes in each measured report; recapture fixtures after rebuilding.
- Preserve measured reports without reformatting their candidate sources, because candidate hashes are part of the verification evidence.
