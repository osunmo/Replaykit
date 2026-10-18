# Evaluation protocol

The current evaluator establishes an R1 reproduction from trusted execution observations. `VERIFIED` requires every gate; a generated failing test alone is insufficient.

## Strict gates

| Gate                | Required observation                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buggy failure       | Exactly ten fresh buggy executions complete with nonzero candidate exit, at least two validated payment requests, more than one real charge and an observed application failure. |
| Failure identity    | Every buggy exception type and normalized application frame match the captured incident.                                                                                         |
| Reference fix       | Exactly three fresh executions: same test exits zero after at least two requests, trusted ledger contains exactly one charge and no domain failure in each.                      |
| Alternate valid fix | Exactly three executions with the same requirements against the independently implemented alternate policy.                                                                      |
| Decoy rejection     | Candidate exits nonzero after at least two requests and the trusted ledger contains more than one charge, even if the application suppresses the exception.                      |
| Fresh state         | Every execution has a distinct ID and starts with both ledger tables empty in its own database container.                                                                        |
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
4. Queues ten fresh buggy runs, three reference fixes, three alternate fixes and one decoy in a bounded pool (default 3, configurable 1–10). Work refills an available slot without a batch barrier. An infrastructure error stops new dispatch, drains active executions and prevents verification.
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

`pnpm test` exercises contracts, telemetry, planning, scheduler, worker/broker draining, publication and judge policy/evaluation logic. `pnpm test:integration` loads ignored local credentials and checks the real checkout matrix against Compose PostgreSQL. It also seeds duplicate rows and proves that both valid fixes retain the shared duplicate-charge invariant. These support component correctness but are not substitutes for a run's strict Docker evidence.

The `durationMs` verdict field represents the elapsed wall-clock verification time (ms), matching the median and p90 metrics expected by benchmarks, integrations, and reports. A separate `executionTimeSumMs` field retains the summed container runtime across all executions in the matrix (which reflects concurrency overlap at concurrency 3). `pipeline.json` records verification/matrix wall time, configured concurrency, peak active executions and execution start/finish offsets. `smoke-profile.json` includes capture and negative checks. Each execution's `profile.json` records exclusive monotonic stage intervals, including failed stages and cleanup.

`pnpm benchmark:measure --label local-concurrency3 --concurrency 3` adds an independently bounded resource observer and saves `measurement.json`. It separates capture from matrix stage totals, reports missing profiles, pins reported images to saved run evidence and represents unavailable resource samples as null. Sampler errors do not establish or weaken judge gates. CPU/memory samples can miss peaks and observer commands add overhead. See [PERFORMANCE.md](PERFORMANCE.md) for actual measurements and limitations. Raw artifacts remain local and ignored; the allowlisted publishing command in the README emits relative references and omits host paths, credentials and raw inspection data.

Model tokens are unavailable because the planner is deterministic and uses no model. Report raw R1 counts with the exact environment and artifacts. The full twenty-case denominators, fixed development/held-out split and three-trial baseline comparisons remain unimplemented.
