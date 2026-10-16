# Decisions

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
