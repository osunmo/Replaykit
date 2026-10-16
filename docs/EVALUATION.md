# Evaluation protocol

The current evaluator establishes an R1 reproduction from trusted execution observations. `VERIFIED` requires every gate; a generated failing test alone is insufficient.

## Strict gates

| Gate                | Required observation                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buggy failure       | Exactly ten fresh buggy executions complete with nonzero candidate exit, at least two validated payment requests, more than one real charge and an observed application failure. |
| Failure identity    | Every buggy exception type and normalized application frame match the captured incident.                                                                                         |
| Reference fix       | Same test exits zero after at least two requests; trusted ledger contains exactly one charge and no domain failure.                                                              |
| Alternate valid fix | Same requirements as the reference, against the independently implemented alternate policy.                                                                                      |
| Decoy rejection     | Candidate exits nonzero after at least two requests and the trusted ledger contains more than one charge, even if the application suppresses the exception.                      |
| Fresh state         | Every execution starts with both ledger tables empty in its own database container.                                                                                              |
| Isolation/offline   | Candidate settings pass Docker inspection, its network is `none`, and the app/database network is internal.                                                                      |
| Same candidate      | Candidate SHA-256 matches the proposed test across every execution.                                                                                                              |
| Reviewability       | Nonempty candidate is at most sixty lines, at most 32 KiB and passes the supported static policy.                                                                                |
| Timing discipline   | The static policy rejects sleeps/timers, loops and other prohibited constructs in the candidate.                                                                                 |

Candidate stdout is not a trusted exception report or ledger. The supervisor counts validated broker actions, queries PostgreSQL through `psql`, and reads the app's own incident log. The actual failing test typically asserts the one-charge invariant; the original `DuplicatePaymentError` identity comes from the app execution.

`VERIFIED` means the full matrix satisfies these gates. `PARTIAL` means a real buggy execution exists but some strict gate fails. `NOT_REPRODUCED` covers abstention, rejected candidate policy or absence of a qualifying real bug. `ERROR` represents infrastructure or incomplete execution evidence and is never credited as a reproduced incident or successful negative abstention.

## R1 smoke procedure

From the repository root after prerequisites are installed:

```text
pnpm install --frozen-lockfile
pnpm build
pnpm sandbox:build
pnpm benchmark smoke
```

Building downloads dependencies/base images and records immutable local image IDs. Smoke then:

1. Executes synthetic traffic against a fresh buggy app/database and captures an actual duplicate incident.
2. Normalizes and redacts that evidence, then passes visible normalized JSON to the deterministic planner container through stdin. The planner has the public buggy app snapshot and no private variants or host mounts.
3. Saves the generated test and its incident hash.
4. Executes ten fresh buggy runs, then reference, alternate and decoy. An infrastructure error stops the matrix from receiving a verified result.
5. Evaluates a changed application frame against the collected matrix and checks that verification is rejected.
6. Removes request evidence for a minimal-tier input and checks explicit missing-body abstention.

The identity-negative step re-evaluates the matrix; it is not a separately executed second application bug. The minimal-tier step checks planner abstention without candidate execution. Both are narrowly scoped smoke checks.

## Inspecting a result

Read the specific run's artifacts; this document contains no measured success rate or timing:

| Artifact under `runs/<run-id>`                              | Meaning                                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `capture.json`, `incident.json`                             | Captured execution and normalized evidence provided to planning.                    |
| `plan.json`, `repro.test.ts`                                | Evidence hash, assumptions, reason codes and exact executable candidate.            |
| `environment.json`                                          | Image manifest, variant source hashes, host Node/platform and dependency-lock hash. |
| `matrix.json`, `result.json`                                | Per-variant evidence and evaluated verdict/gates.                                   |
| `report.md`, `executions.csv`                               | Reviewable report and execution rows.                                               |
| `identity-negative.json`, `minimal-plan.json`, `smoke.json` | Smoke-control outcomes and overall smoke summary, when those stages execute.        |
| `executions/<execution-id>/evidence.json`                   | Exit, observed failure, charge count, request count, schedule and execution errors. |
| `executions/<execution-id>/database.json`                   | Supervisor-captured provider ledger.                                                |
| `executions/<execution-id>/application.log`                 | Sanitized app logs, including the observed domain event when emitted.               |
| `executions/<execution-id>/isolation.json`                  | Inspected candidate container and internal network configuration.                   |

Error paths can produce `error.json` or per-execution application/PostgreSQL error logs instead of a complete matrix. Missing files are missing evidence, not implicit successful checks.

`pnpm replaykit replay verify --run <run-id>` verifies that the stored test matches its plan and reruns the existing candidate on the built variant matrix. `pnpm benchmark report --input runs/<run-id>` prints the persisted result. Arbitrary patch verification is not implemented.

## Development checks and interpretation

`pnpm test` exercises contracts, telemetry, planning, scheduler and judge policy/evaluation logic. `pnpm exec vitest run --config vitest.integration.config.ts` checks the real checkout matrix against the local Compose PostgreSQL service. These support component correctness but are not substitutes for a run's strict Docker evidence.

The reported execution duration is a sum of execution durations; concurrent buggy batches mean it is not necessarily wall-clock CLI latency. Model tokens are unavailable because the planner is deterministic and uses no model. Report raw R1 counts with the exact environment and artifacts. The full twenty-case denominators, fixed development/held-out split and three-trial baseline comparisons remain unimplemented.
