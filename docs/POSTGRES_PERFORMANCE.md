# R1 PostgreSQL startup and scaling experiment

The PostgreSQL template reduced measured database startup/readiness cost, but did **not** establish an end-to-end improvement at the default concurrency of three. Across two sampled runs per mode, full smoke time averaged **109.359 seconds with fresh initdb** and **121.653 seconds with template copying**. Fresh initdb remains the default. The template is an opt-in experiment; concurrency remains three and PostgreSQL fsync remains enabled.

These are local measurements from 2026-10-16, not a general performance guarantee or a CI result. The [portable measurement JSON](measurements/r1-performance.json) contains the individual records, stage statistics, resource observations, image identifiers, candidate hashes and judge gates. The [earlier worker-pool report](PERFORMANCE.md) describes the previous milestone separately.

The published artifact contains 17 observations: five earlier runs, the user's local run, the nine comparison runs below and two final rebuild validations. The final validation timings are not included in the experiment means; the [progress record](PROGRESS.md#follow-up-validation-record) records their outcomes separately.

## Existing behavior checked before changing code

The delivered pipeline already had a rolling worker pool and ownership-checked `docker rm -f` cleanup. Neither was newly implemented or credited as an optimization in this experiment. In the user's run `2e08d0cd-b9de-4aa3-93d9-9392c379feb9`, the first replacement execution started at 37.42 seconds, before the other two initial executions finished at 37.77 and 38.08 seconds. The 14 refill delays were 0.35–5.34 milliseconds. The execution timeline therefore shows immediate refill; container counts sampled every five seconds cannot establish a batch barrier. Each individual worker still completes its own evidence collection and cleanup before its next execution.

The original databases already used private tmpfs data directories. The experiment adds build-time initialization of a clean, empty PostgreSQL template, followed by a private copy for each execution. It does not reuse a running database, mutable application state, network or writable volume.

## Measurement method and comparability

The host was Windows/WSL2 with Node 22.23.3. Docker reported 12 logical CPUs and 8,234,680,320 bytes of memory. The nine runs below executed one at a time. All used the same rebuilt application, candidate and planner images, the same private variant source hashes, and candidate SHA-256 `16fea9fa5391aa587ee3145d9d091a79bf89295db85b2b7ec117c5cb00424102`. The PostgreSQL runtime image intentionally differs between initdb and template modes. Image identities are recorded in JSON; later final-validation rebuilds are separate observations and are not folded into this comparison.

Every run includes incident capture, the complete 17-execution verification matrix, wrong-frame rejection, missing-body abstention and artifact writes. The matrix comprises ten buggy runs, three reference runs, three alternate runs and one decoy. The wall timer excludes dependency installation, image building, process launch, the initial Docker-capacity query and serialization of the measurement envelope. Per-execution stage profiling remains enabled in both sampled and unsampled modes.

`--sampling off` removes periodic Docker ps/stats calls only. It retains the same timer, smoke pipeline and all judge gates. Its resource peaks are null and its sample counts are zero. It is not a resource-usage measurement.

## All nine smoke measurements

Rows are in execution order. Seconds are rounded to three decimals. All nine runs returned VERIFIED, passed smoke negative controls, and had no execution failure, artifact error or missing execution profile.

| Label                    | PostgreSQL mode | Concurrency | Sampling | Fsync | Full smoke seconds | Matrix seconds | Mean execution seconds |
| ------------------------ | --------------- | ----------: | -------- | ----- | -----------------: | -------------: | ---------------------: |
| pg-initdb-c1-sampled     | initdb          |           1 | on       | on    |            282.578 |        255.109 |                 15.003 |
| pg-initdb-c3-sampled     | initdb          |           3 | on       | on    |             88.423 |         74.894 |                 12.511 |
| pg-template-c1-sampled   | template-copy   |           1 | on       | on    |            180.946 |        167.946 |                  9.877 |
| pg-template-c3-sampled   | template-copy   |           3 | on       | on    |            143.961 |        129.441 |                 21.719 |
| pg-template-c6-sampled   | template-copy   |           6 | on       | on    |            102.065 |         88.465 |                 29.723 |
| pg-template-c3-unsampled | template-copy   |           3 | off      | on    |             97.046 |         82.163 |                 13.771 |
| pg-template-fsync-off-c3 | template-copy   |           3 | on       | off   |            101.601 |         88.379 |                 14.835 |
| pg-template-c3-repeat    | template-copy   |           3 | on       | on    |             99.345 |         86.288 |                 14.534 |
| pg-initdb-c3-repeat      | initdb          |           3 | on       | on    |            130.295 |        110.163 |                 18.038 |

The two initdb/concurrency-three observations span 88.423–130.295 seconds; the two template/concurrency-three observations span 99.345–143.961 seconds. Their means are 109.359 and 121.653 seconds respectively: the template mean is about 11.2% higher. This small sample has substantial host/warm-up variation and overlapping ranges. It supports retaining the existing default, not a causal claim that template copying generally slows the pipeline.

The sequential measurements provide an actual full-matrix baseline rather than a projection from mean execution time. The single template/concurrency-one result was lower than the single initdb/concurrency-one result, but other stages also became faster and there was no repeated sequential comparison. That difference cannot be attributed solely to preinitialization.

Concurrency six was measured once with the template. Its 102.065-second full smoke was close to the 99.345-second template/concurrency-three repeat, while mean execution duration rose to 29.723 seconds. The experiment does not establish six as a better default or locate a stable scaling limit. Initdb at concurrency six was not measured.

The unsampled template/concurrency-three run took 97.046 seconds. Sampled repetitions took 143.961 and 99.345 seconds, so this single unsampled observation does not quantify observer overhead independently of host variation. Likewise, the separate fsync-off run took 101.601 seconds and did not establish an advantage over the 99.345-second sampled fsync-on repeat. Fsync stays on. No sequential unsampled run was made in this nine-run comparison.

## Stage means at the default concurrency

Each column combines 34 matrix executions from the two sampled, fsync-on runs at concurrency three. Values are average seconds per execution, not elapsed pipeline seconds: executions overlap. Readiness stages include Docker exec and polling overhead; candidate execution includes SDK/broker work. Full per-run counts, sums, means and maxima remain in JSON.

| Stage                | Initdb, 34 executions | Template copy, 34 executions |
| -------------------- | --------------------: | ---------------------------: |
| preparation          |                 0.012 |                        0.012 |
| networkCreation      |                 0.582 |                        0.671 |
| postgresStartup      |                 0.941 |                        1.247 |
| postgresReadiness    |                 2.291 |                        0.695 |
| applicationStartup   |                 0.948 |                        1.300 |
| applicationReadiness |                 1.770 |                        2.653 |
| candidatePreparation |                 1.120 |                        1.570 |
| candidateExecution   |                 3.062 |                        4.387 |
| evidenceCollection   |                 1.290 |                        1.584 |
| cleanup              |                 3.255 |                        4.004 |
| artifactWrite        |                 0.004 |                        0.003 |

Combined PostgreSQL startup/readiness averaged 3.232 seconds with initdb and 1.943 seconds with the template, about 39.9% lower in these observations. Mean total execution duration was 15.274 versus 18.127 seconds. The database-stage reduction was outweighed by higher measured costs elsewhere. It is therefore accurate to report a lower observed database-stage cost, but not a successful overall latency optimization. The timings do not isolate laptop CPU behavior, filesystem overhead or Docker daemon scheduling as a single cause.

## Resource observations and contention

CPU percentages sum across cores; 100% represents roughly one fully used core. Peaks are complete valid sampled observations, not continuous maxima or evidence of throttling. Every container retains its existing one-CPU, 256 MiB and 64-PID limits.

| Label                    | Peak running containers | Peak CPU percent | Peak memory MiB | Valid CPU/memory samples | Observer errors |
| ------------------------ | ----------------------: | ---------------: | --------------: | ------------------------ | --------------: |
| pg-initdb-c1-sampled     |                       3 |           122.02 |          171.51 | 34/34                    |              12 |
| pg-initdb-c3-sampled     |                       9 |           117.80 |          356.23 | 8/8                      |               5 |
| pg-template-c1-sampled   |                       3 |            48.09 |          112.68 | 20/20                    |              10 |
| pg-template-c3-sampled   |                       9 |           295.06 |          423.87 | 16/16                    |               7 |
| pg-template-c6-sampled   |                      18 |           701.68 |          827.00 | 13/13                    |               4 |
| pg-template-c3-unsampled |             unavailable |      unavailable |     unavailable | 0/0                      |               0 |
| pg-template-fsync-off-c3 |                       9 |           146.58 |          341.44 | 13/13                    |               3 |
| pg-template-c3-repeat    |                       9 |           132.91 |          356.56 | 10/10                    |               5 |
| pg-initdb-c3-repeat      |                       9 |           292.42 |          347.34 | 16/16                    |               7 |

At concurrency six, aggregate sampled CPU reached about seven logical cores, sampled memory reached 827 MiB, and 18 containers were observed. Per-execution latency increased. This is consistent with added contention and does not prove a particular host resource was saturated. Resource sampling can miss short-lived peaks and adds Docker command overhead. The nine measurements recorded 53 observer errors: 16 messages reported a missing container or object, and 37 reported EOF. None was an observer command timeout. Container removal between listing and stats explains the missing-container condition; the EOF cause was not established. Observer errors are retained separately and never feed judge gates. No execution OOM, timeout or infrastructure failure occurred in these nine successful matrices.

## Template behavior and verification

Opt-in construction runs initdb and the exact compiled application schema during the image build, then checks that both ledger tables are empty, the database role has no password, and PostgreSQL shut down cleanly. A marker records those completed build checks. The normal application still runs its idempotent schema initialization and identifier-sequence initialization.

At runtime, an unprivileged entrypoint rejects an occupied data directory, copies the immutable seed into the execution's private 128 MiB tmpfs, validates a newly generated 64-hex-character password, and installs it before opening TCP. Password-setting SQL and diagnostics are suppressed. Each run retains independent PostgreSQL state, application and candidate containers, an internal Docker network, trusted evidence collection and resource limits. The template is not available to candidate code, and no mutable application state is shared.

The live snapshot probe passed 15 recorded checks: two fresh/authenticated databases, private tmpfs and read-only root, fsync enabled by default, the build-verified empty credential-free seed, independent mutable state, unchanged template, fresh replacement clone, explicit fsync-off support, rejection of the previous password, invalid bootstrap input rejection, occupied-data rejection, unverified-template rejection, credential-free logs and cleanup. The fsync-off check establishes supported configuration, not durability equivalence. Disposable tmpfs databases already do not persist across container destruction; R1 does not test crash recovery.

All nine smoke runs retained every strict gate: correct failure identity, ten fresh buggy failures, three passing reference repetitions, three passing alternate repetitions, decoy failure with duplicate-charge evidence, offline execution, isolation, fresh state, identical candidate hashes, reviewable test and no sleep-based test timing. Wrong-frame rejection and missing-body abstention passed too. The [shared application invariant](R1_INVARIANT.md) remains unchanged.

## Commands and decision

From the repository root after installing dependencies:

```powershell
pnpm build
pnpm sandbox:build
pnpm benchmark:measure --label initdb-c1-sampled --concurrency 1
pnpm benchmark:measure --label initdb-c3-sampled --concurrency 3
```

To evaluate the optional template and its bootstrap checks:

```powershell
pnpm sandbox:build --postgres-mode template-copy
pnpm exec tsx scripts/postgres-snapshot-check.ts
pnpm benchmark:measure --label template-c1-sampled --concurrency 1
pnpm benchmark:measure --label template-c3-sampled --concurrency 3
pnpm benchmark:measure --label template-c6-sampled --concurrency 6
pnpm benchmark:measure --label template-c3-unsampled --concurrency 3 --sampling off
```

Restore fresh-initdb mode with `pnpm sandbox:build --postgres-mode initdb`. Both build modes default to fsync on; the fsync-off result above was a separately recorded controlled runtime configuration. Run comparisons serially and repeat them under comparable host conditions before drawing performance conclusions. A sequential unsampled comparison can use `pnpm benchmark:measure --label sequential-unsampled --concurrency 1 --sampling off`; it is a supported command, not a measurement claimed in this report.

The manifest validator rejects initdb with fsync off because the stock PostgreSQL entrypoint ignores the template's custom fsync environment variable. This prevents false configuration provenance. The template entrypoint explicitly applies the setting, and the live snapshot probe checked both values. All nine measurements already obeyed this restriction.

No default performance improvement is claimed for the template. The retained defaults are fresh initdb, concurrency three and fsync on. D2, Cursor/MCP integration, a dashboard and new benchmark cases remain deferred. The [progress record](PROGRESS.md) separates completed experiment checks from final validation, and no remote CI success is claimed.
