# Progress

## 2026-10-16 — Performance closed; next correctness milestone proposed

The user's latest direction closes speed work and resumes D2/N5 plus saved-test candidate-patch verification. Fresh initdb, concurrency three and fsync on remain the defaults. No new performance experiment or product-code change was made in this review.

Completed a read-only comparison of the 219.051-second run with the other sixteen published observations. App/candidate/planner image IDs differ between build groups; all four variant-policy hashes and the generated test hash match. The policy hashes omit shared application code, and no historical record contains a controller-source digest. Therefore this comparison cannot establish a host-only cause. See [PROVENANCE_COMPARISON.md](PROVENANCE_COMPARISON.md).

Prepared a [proposed D2/N5 and patch-verification design](superpowers/specs/2026-10-16-d2-n5-patch-design.md). It separates full strict reproduction, provisional progress, and one/two-run saved-test patch results; scopes the new work to core/CLI; and requires isolated patch builds and authentic source/test provenance. This is an architectural design for review, not shipped functionality. D2/N5, preliminary progress and candidate-patch verification are still unimplemented. The existing tested R1 source archive remains unchanged.

Next concrete task: review this design, then write the implementation plan and implement/test D2/N5 and the saved-test patch path. No tests or CI were rerun for the read-only provenance inspection. Prettier formatting and `git diff --check` passed for these documentation changes.

## 2026-10-16 — PostgreSQL and measurement follow-up

The PostgreSQL template experiment reduced observed database startup/readiness cost but did not establish a full-smoke speedup at default concurrency three. Two sampled, fsync-on runs per mode averaged **109.359 seconds with initdb** and **121.653 seconds with template copying**. Fresh initdb remains the default; template copying is opt-in through `pnpm sandbox:build --postgres-mode template-copy`. Concurrency remains three and fsync remains on. [POSTGRES_PERFORMANCE.md](POSTGRES_PERFORMANCE.md) records all nine runs, exclusive stage means, sampling/resource limits and comparison caveats; [the portable JSON](measurements/r1-performance.json) retains individual observations and all judge gates.

### Implemented and checked

- Added an empty, credential-free PostgreSQL template build using the same compiled schema as the application. Each opt-in execution copies the stopped seed into its own private tmpfs and installs a new password before TCP startup. No running database, writable volume or mutable application state is shared.
- Added explicit `--postgres-mode initdb|template-copy` build selection, defaulting to initdb. Template identity, base image, schema hash, template-source hash and fsync setting are recorded in the saved environment and sanitized published measurements.
- Rejected the `initdb`/`fsync=off` manifest combination after review found that the stock PostgreSQL entrypoint ignores the custom fsync environment variable. This prevents an artifact from claiming a configuration that was not applied. The five focused manifest tests went from one expected failure to all passing; all measured initdb runs already used fsync on.
- Added `--sampling on|off` to the measurement wrapper. Off mode removes periodic Docker observer commands while retaining stage profiling, the wall timer and all smoke/judge checks. Unavailable peaks remain null and sample counts are zero; one capacity query runs before timing.
- Confirmed cleanup already uses ownership-checked `docker rm -f` and the pool already refills immediately. The user's execution timeline showed a replacement at 37.42 seconds before its two peers finished; 14 refills took 0.35–5.34 milliseconds. No batch-to-pool or graceful-to-forced-cleanup change was needed or credited.
- Retained every strict verification gate and identical candidate bytes. All nine experiment runs shared application, candidate and planner images and private variant hashes; the PostgreSQL runtime image intentionally differs between modes. Later rebuild validation is kept separate from these performance comparisons.

### Measured findings

| Configuration                                |               Full smoke seconds | Observation                                              |
| -------------------------------------------- | -------------------------------: | -------------------------------------------------------- |
| Initdb, concurrency 1, sampled, fsync on     |                          282.578 | Actual sequential 17-execution baseline; one run         |
| Template, concurrency 1, sampled, fsync on   |                          180.946 | One run; host/warm-up effects not isolated               |
| Initdb, concurrency 3, sampled, fsync on     | 88.423 and 130.295; mean 109.359 | Existing default retained                                |
| Template, concurrency 3, sampled, fsync on   | 143.961 and 99.345; mean 121.653 | No established full-smoke improvement                    |
| Template, concurrency 6, sampled, fsync on   |                          102.065 | One run; mean execution duration 29.723 s; 18 containers |
| Template, concurrency 3, unsampled, fsync on |                           97.046 | One run; cannot isolate observer overhead                |
| Template, concurrency 3, sampled, fsync off  |                          101.601 | One run; no established advantage over fsync on          |

At concurrency three, combined PostgreSQL startup/readiness averaged 3.232 seconds with initdb and 1.943 seconds with the template across 34 executions per mode. Other measured stages became slower and template mean full-smoke time was 11.2% higher. The ranges overlap and timing varied substantially. No causal or statistically significant overall speedup is claimed. Concurrency six reached sampled CPU of 701.68% and memory of 827 MiB; observations do not establish the source of contention or a stable optimum. A sequential unsampled run and initdb at concurrency six were not measured in this set.

All nine full smokes passed with VERIFIED, 10/10 fresh buggy failures, 3/3 passes for each valid fix, duplicate-charge decoy rejection, all remaining judge gates, wrong-frame rejection and missing-body abstention. None had an execution failure, artifact error or missing execution profile. The observer recorded 53 errors: 16 missing-container/object messages and 37 EOF messages, with no observer command timeout. The EOF cause was not established; observer errors remain separate from judge evidence. The template snapshot probe passed all 15 recorded checks, including credential separation, private writes, unchanged seed, fresh replacement state, rejected bootstrap inputs and cleanup.

### Follow-up validation record

| Check                                               | Observed result                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Focused option and publication tests                | PASS; expected failures observed before implementation                                                                                |
| `pnpm test`                                         | PASS; 163 tests in 23 files, including final manifest guards                                                                          |
| Nine measured full R1 smokes                        | PASS; all strict gates and negative controls                                                                                          |
| `pnpm exec tsx scripts/postgres-snapshot-check.ts`  | PASS; 15 recorded live checks                                                                                                         |
| `pnpm test:sdk`                                     | PASS; 6 tests                                                                                                                         |
| `pnpm test:integration`, followed by `pnpm db:down` | PASS; 14 real PostgreSQL tests; development database stopped                                                                          |
| `pnpm typecheck`, `pnpm lint`, `pnpm build`         | PASS; full lint preceded the manifest guard and focused lint covered its changed files                                                |
| `pnpm sandbox:build --postgres-mode template-copy`  | PASS                                                                                                                                  |
| Final template snapshot-probe rerun                 | PASS; all 15 checks                                                                                                                   |
| Final template smoke                                | PASS; VERIFIED and both negative controls                                                                                             |
| Final template security                             | PASS; all four live probe groups                                                                                                      |
| `pnpm sandbox:build` with no mode option            | PASS; fresh initdb remains the default                                                                                                |
| Current tracked-artifact audit                      | PASS; among environment files, only `.env.example` is tracked; raw runs, scratch/build/dependency files and generated fixture ignored |
| Final default smoke                                 | PASS; VERIFIED and both negative controls; initdb and fsync on                                                                        |
| Portable published measurement audit                | PASS; 17 records; follow-up gates/hashes, relative paths and credential exclusion checked                                             |
| Final default security                              | PASS; all four live probe groups                                                                                                      |
| Final Docker cleanup audit                          | PASS; no owned execution containers/networks or development Compose containers remain                                                 |
| Remote CI                                           | Not run                                                                                                                               |

Final `pnpm format:check` and `git diff --check` passed.

The final template snapshot probe passed under runtime image `sha256:292b1eb41c09197472d73713d5beafc4dfd31ace74b4655b92947a679e58c6d8`; its local proof is `runs/585529b2-3d30-4d5d-9b10-0e25d7583376/postgres-snapshot.json`. The final template full smoke, `8b35767f-e8fe-49ad-991a-f4b5a95ff5f8`, returned VERIFIED with both negative controls passing in 172.025 seconds. These rebuilt-image runs are functional validation and are excluded from the nine-run performance comparison above.

The final template smoke had all 11 boolean judge gates true, 10/10 buggy failures, 3/3 successes for each valid fix, no artifact errors and no missing profiles. Its eight sampler errors remain observer diagnostics. All four template security probe groups passed; local proof is `runs/857a78ac-84c1-46b2-bb14-efff50e42f63/security.json`.

The final default smoke, `ebcab169-c1ac-4611-abd0-90f58c5a985a`, returned VERIFIED with both negative controls passing in 205.716 seconds using initdb and fsync on. Its six sampler errors are separate from execution evidence. Independent audit confirmed all 11 current follow-up runs (nine comparisons and two final validations) retained every boolean judge gate, 10/10 buggy failures, 3/3 successes for each valid fix, one rejected decoy, identical candidate hashes, zero artifact errors and complete profiles. The published JSON contains 17 observations: five historical runs, the user's local run, nine experiment runs and two final validations. These groups are preserved separately rather than pooled into one performance mean.

All four default-mode security probe groups passed; local proof is `runs/599bef0d-9d07-4c98-a219-e23cf336c13d/security.json`. The final cleanup audit found no containers or networks labeled `replaykit.run` and no development Compose containers. The saved sandbox manifest was confirmed to select initdb with fsync on.

The CI definition now builds and checks both default initdb and opt-in template modes, including smoke/security checks and the template probe. The workflow stops the development database before smoke checks, but the remote workflow has not run. Raw executions, local credentials and scratch data remain ignored; published records use relative paths and allowlisted fields. The source archive is refreshed only after final validation. No D2, plugin, dashboard or additional benchmark case was added. This follow-up stops at the tested R1 pipeline; any future performance change needs repeatable measurements before changing defaults.

## 2026-10-16 — R1 performance hardening

The optimized R1 pipeline uses a bounded worker pool with configurable concurrency 1–10, default 3. The strict matrix now requires 10 fresh buggy failures, three reference passes, three alternate passes, and a decoy failure. Every execution retains independent PostgreSQL state, application and candidate containers, an internal Docker network, resource limits and trusted evidence collection. A single pinned image manifest and identical candidate bytes are used throughout each matrix. No verification gate was removed; duplicate execution IDs are additionally rejected. No D2, Cursor integration, dashboard or additional benchmark case was implemented.

### Measured results and limitations

Five full local smoke measurements passed, including wrong-frame rejection and missing-body abstention. [PERFORMANCE.md](PERFORMANCE.md) contains the stage and resource tables; [the portable JSON artifact](measurements/r1-performance.json) records the measurements, gates, hashes, image IDs and relative evidence references.

| Configuration                        | Matrix executions |           Observed full-smoke wall time |
| ------------------------------------ | ----------------: | --------------------------------------: |
| Original instrumented batches of two |                13 |                               281.939 s |
| Hardened worker pool, concurrency 2  |                17 | 112.897 s and 151.202 s; mean 132.050 s |
| Hardened worker pool, concurrency 3  |                17 |  92.864 s and 117.853 s; mean 105.359 s |

The matched 17-execution comparison measured a 20.2% mean reduction, with two samples per setting in order 2, 3, 3, 2. Ranges overlap and host timing varied substantially; no statistical significance or general speed guarantee is claimed. The original baseline had different warm-up and host activity, so its much larger latency cannot be attributed to concurrency alone. All five measurements used the same immutable images and candidate hash.

Profiling separates network creation, PostgreSQL startup/readiness, application startup/readiness, candidate preparation/execution, trusted evidence collection, cleanup and artifact writes. Per-execution profiles preserve failed stages too. Pipeline timing distinguishes overlapping wall time from summed execution durations. Capture and negative-control timing are recorded separately. The measurement wrapper records Docker capacity and periodic resource samples; missing/failed observations remain unavailable rather than zero.

Concurrency 3 increased per-execution duration and sampled resource use while reducing observed total wall time. Peaks reached nine running containers, 182.41% aggregate CPU and 410.0 MiB sampled memory. These samples can miss peaks and do not establish throttling. Observer EOF/removal errors during container teardown are retained separately from execution failures. No smoke execution timed out, ran out of memory or failed infrastructure checks. PostgreSQL startup/readiness accounted for about 21% of original summed duration. Database reuse was considered after profiling but neither implemented nor benchmarked; independent database lifecycles remain intact.

### Invariant and security review

[R1_INVARIANT.md](R1_INVARIANT.md) traces DuplicatePaymentError to the shared application check of committed provider-ledger rows. Real duplicate inserts trigger the check; the buggy policy does not inject an error. Both valid implementations retain the same invariant, with real PostgreSQL regression coverage. The decoy alone suppresses the symptom and is still rejected because trusted evidence detects duplicate charges.

Independent review also found and corrected unavailable resource samples being represented as zero, measurement provenance relying on a mutable image manifest, and broker requests remaining queued after candidate rejection. The broker now stops dispatch and drains in-flight work before evidence collection and cleanup. The live rejection probe queues valid payment requests after an invalid command and confirms zero charges in trusted database evidence.

### Publishing and repository hygiene

The repository was already initialized on `codex/replaykit-r1` with no remote. Removed 210 accidentally tracked raw result files and one generated incident fixture from the current index while retaining them locally. Runs, benchmark results, generated fixtures, logs, build outputs and local environment files are ignored. Published reports use relative paths; the portable measurement exporter uses an explicit field allowlist and excludes raw Docker inspections, environment variables and host paths.

Removed fixed synthetic database passwords from source/configuration. Development commands generate an ignored local environment file, preserving existing valid configuration; sandbox passwords are random per execution and error logs redact them. The generated development volume is retained after shutdown. Previous local commits still contain the original raw artifacts and synthetic defaults; history was not rewritten. No remote publishing or remote CI run occurred.

### Final validation

| Check                                                            | Observed result                                                                                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --offline`                       | PASS; current lockfile across all 8 workspace projects                                                                                                        |
| `pnpm test`                                                      | PASS; 151 tests in 20 files                                                                                                                                   |
| `pnpm test:sdk`                                                  | PASS; 6 tests                                                                                                                                                 |
| `pnpm test:integration`                                          | PASS; 14 real PostgreSQL tests, including both valid implementations' invariant checks                                                                        |
| `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` | PASS                                                                                                                                                          |
| `pnpm sandbox:build`                                             | PASS; the same immutable images were used for all five measurements                                                                                           |
| Full R1 smoke through the measurement wrapper                    | PASS; all five measurements and negative controls; hardened runs require 10/10 buggy failures, 3/3 reference passes, 3/3 alternate passes and decoy rejection |
| `pnpm test:security`                                             | PASS; all four live probe groups                                                                                                                              |
| Git and publishing audit                                         | PASS; no generated execution artifacts or local environment files in the current index; published paths are relative                                          |
| Docker cleanup audit                                             | PASS; no containers or networks with the `replaykit.run` ownership label remain; development database stopped                                                 |

The live security run `1801ebba-6076-4981-9a22-5fed6dbbff34` passed filesystem/secrets/egress restrictions, broker protocol rejection with zero charges, timeout enforcement and memory-limit enforcement. Final formatting initially flagged two Markdown tables; formatting was corrected and the full formatting check passed. Independent review and the final checks found no remaining material issues in this scope.

The CI workflow now includes the existing security probes, but remote CI has not run. This milestone ends at the optimized and verified R1 pipeline; later scenarios and product integrations remain deferred.

## 2026-10-16 — first working R1 slice

The initial workspace was empty. This delivery implements the R1 path through foundation, checkout payments, replay isolation, strict judging and CLI. It does **not** claim completion of every Phase 0–3 gate: full checkout orders/inventory/webhooks and real scheduler-controlled DB races are still missing, and remote CI has not run.

### Working deliverables

- `apps/checkout-api`: real PostgreSQL provider ledger, payment idempotency, payload conflict checks, explicit OpenTelemetry spans, Sentry-shaped capture derived from actual application error stacks.
- `benchmark/private/R1`: buggy, reference, distinct alternate and symptom-hiding decoy policy artifacts.
- `packages/contracts`, `packages/telemetry`: strict typed boundaries, normalized input redaction and explicit missing telemetry.
- `packages/planner`: deterministic evidence-driven rule planner, executed in a separate network-disabled image without private fixes or host mounts.
- `packages/replay-engine`: tested cooperative finite scheduler, cancellation and timeout diagnostics; not yet wired into a database race scenario.
- `packages/judge`: network-disabled candidate containers, bounded request broker, independent application/DB observations, fresh-state checks and full strict matrix.
- `packages/cli`: capture, fixture run, saved-test verification, smoke, JSON/CSV/Markdown artifacts.
- `scripts/build-sandbox.ts`, `docker/replay-fixture.mjs`, Compose, CI definition, README, MIT license and security/methodology docs.

### Actual verification

| Command                                                                                             | Observed result                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                    | PASS, lockfile current across 8 workspace projects                                                                                                                          |
| `pnpm typecheck`                                                                                    | PASS                                                                                                                                                                        |
| `pnpm lint`                                                                                         | PASS                                                                                                                                                                        |
| `pnpm test`                                                                                         | PASS, 70 tests in 12 files                                                                                                                                                  |
| `pnpm test:sdk`                                                                                     | PASS, 6 tests                                                                                                                                                               |
| `pnpm test:integration`                                                                             | PASS, 12 real PostgreSQL integration tests                                                                                                                                  |
| `pnpm build`                                                                                        | PASS                                                                                                                                                                        |
| `pnpm sandbox:build`                                                                                | PASS, real app/candidate/planner images built and inspected                                                                                                                 |
| `pnpm benchmark smoke`                                                                              | PASS, run `40a29c65-b65e-4853-9911-665e984f7893`, VERIFIED; 10/10 fresh buggy failures, both valid fixes pass, decoy fails, wrong frame rejected, missing request abstained |
| `pnpm test:security`                                                                                | PASS, 4 live probe groups; run `c8508008-b6bd-47bd-8174-4daef37e2333`                                                                                                       |
| `pnpm replaykit replay verify --run 40a29c65-b65e-4853-9911-665e984f7893`                           | PASS, saved candidate independently reran the full matrix; new run `3aeb3f43-f65d-4d6c-9cbe-8a456083ff01`, VERIFIED                                                         |
| `pnpm replaykit incident capture --output benchmark/incidents/R1/visible/incident.json`             | PASS, new real synthetic fixture captured in run `c6f340ad-e637-432b-bd0c-4782186e3279`                                                                                     |
| `pnpm replaykit incident run --fixture benchmark/incidents/R1/visible/incident.json --tier minimal` | Expected exit 2, NOT_REPRODUCED with MISSING_REQUEST_BODY; run `8ad0d5ae-40df-4205-9829-a5d1f26c8239`                                                                       |
| `pnpm benchmark report --input runs/40a29c65-b65e-4853-9911-665e984f7893`                           | PASS, reads the measured report                                                                                                                                             |
| `pnpm format:check`                                                                                 | PASS                                                                                                                                                                        |
| `pnpm db:down`                                                                                      | PASS, development container/network stopped; synthetic named volume retained                                                                                                |

Historical smoke reports and raw evidence remain locally under `benchmark/results/r1-smoke-2026-10-16/`, `security-2026-10-16/`, `r1-rerun-2026-10-16/` and `r1-minimal-2026-10-16/`. Performance hardening removes these generated directories from the current Git index and published source, preserving local evidence and previous commits. These are measured single-scenario records, not full-benchmark performance claims. No containers or networks with the `replaykit.run` ownership label remained after those runs completed.

### Review and corrections

Independent review found five substantive defects. Seven regression tests first reproduced them, then passed after fixes: abnormal exits/OOM must not verify; normalized inputs must be redacted; a proposal cannot substitute or invent the request; incident revision/service must match the executed snapshot; partially created resources must be reconciled by ownership label. Saved-test reruns additionally compare the prior candidate hash.

An initial security probe run failed because the probe generator accidentally inserted a literal newline inside JavaScript quotes. The malformed candidate did not exercise the broker. Corrected the test source and required the exact `CANDIDATE_PROTOCOL_REJECTED` reason; the complete four-probe rerun passed. The earlier failed run remains under local `runs/b2c6ae0e-b49e-4665-a517-398f287623ba` for diagnostics and is not presented as a successful security result.

Packaging measured evidence exposed a tooling issue: the TypeScript and lint globs also included archived container-only candidate sources. Excluded `benchmark/results` from host build/type/lint checks, as already done for local `runs`; the executable repository sources remain checked. Archived candidates retain their exact measured hashes.

### Environment and limits

Node 22.23.3, pnpm 10.20.0, TypeScript 5.9.3, PostgreSQL 17.11, Docker Engine 29.8.1, Docker Desktop 4.93.0, Compose 5.5.1 on Windows/WSL2. Docker Desktop was initially stopped and was started. The Codex Windows sandbox denied Docker pipe and some package/Git reads; the approved local test commands ran with sandbox escalation. No software install, global settings change, production data or external payment service was required.

The complete 20-case benchmark, fixed 12/8 split, three-trial model comparisons, LLM adapter, Cursor/MCP integration, arbitrary patch verification and dashboard remain incomplete. No remote repository, CI run or release publication was created.

### Superseded next-task proposal

The R1 performance-hardening milestone is complete. The user's latest direction resumes D2/N5 and saved-test patch verification; see the current proposed design at the top of this progress record. Cursor/MCP transport, a dashboard and the remaining benchmark corpus stay outside that proposed core/CLI milestone.
