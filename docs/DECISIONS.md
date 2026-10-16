# Decisions

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
