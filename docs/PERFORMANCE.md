# R1 performance hardening — measured local results

Measured on 2026-10-16 using Windows/WSL2, Node 22.23.3 and Docker Engine 29.8.1. The measured Docker engine exposes 12 logical CPUs and 8,234,680,320 bytes of memory. All five runs used identical immutable images and candidate SHA-256 `16fea9fa5391aa587ee3145d9d091a79bf89295db85b2b7ec117c5cb00424102`.

Portable machine-readable observations: [r1-performance.json](measurements/r1-performance.json). Raw evidence remains locally under ignored runs directories identified in that file.

## Wall-clock results

The timer starts immediately before incident capture and ends after verification, negative controls and smoke artifact writes. It excludes image building, installation, process launch, the initial Docker-capacity query, and writing the measurement envelope itself. It includes the periodic resource observer overhead.

| Configuration                    | Matrix        | Smoke wall seconds | Verdict  |
| -------------------------------- | ------------- | -----------------: | -------- |
| baseline-batch2                  | 13 executions |            281.939 | VERIFIED |
| strengthened-concurrency2        | 17 executions |            112.897 | VERIFIED |
| optimized-concurrency3           | 17 executions |             92.864 | VERIFIED |
| optimized-concurrency3-repeat    | 17 executions |            117.853 | VERIFIED |
| strengthened-concurrency2-repeat | 17 executions |            151.202 | VERIFIED |

The strengthened 17-execution matrix averaged **132.050 s at concurrency 2** and **105.359 s at concurrency 3**, an observed **20.2% reduction** over two runs per setting. Order was 2, 3, 3, 2. This small local sample has overlapping ranges and does not establish a general latency guarantee or statistical significance.

The earlier 13-execution baseline took 281.939 s. It used batches of two buggy runs and one execution of each fix. It also had different warm-up/host conditions and some focused unit-check activity during implementation. Its much larger latency must not be attributed to concurrency alone. The matched comparison uses the strengthened matrix, the same images and candidate, and no simultaneous development database, image build or test suite.

## Exclusive stage durations

Values below are average seconds per matrix execution. Each strengthened column combines 34 executions from two runs. They are not pipeline wall time: independent executions overlap. Full sums, counts and maxima are in the JSON artifact. Readiness includes the Docker exec and polling overhead; candidate execution includes SDK/broker calls.

| Stage                | Original baseline (13) | Concurrency 2 (34) | Concurrency 3 (34) |
| -------------------- | ---------------------: | -----------------: | -----------------: |
| networkCreation      |                  0.913 |              0.511 |              0.569 |
| postgresStartup      |                  1.896 |              0.835 |              0.932 |
| postgresReadiness    |                  4.553 |              1.887 |              2.236 |
| applicationStartup   |                  1.677 |              0.792 |              0.925 |
| applicationReadiness |                  3.986 |              1.547 |              1.724 |
| candidatePreparation |                  1.933 |              0.989 |              1.068 |
| candidateExecution   |                  6.369 |              2.613 |              3.248 |
| evidenceCollection   |                  3.316 |              1.117 |              1.272 |
| cleanup              |                  5.456 |              2.801 |              3.173 |
| artifactWrite        |          not separated |              0.003 |              0.003 |

Preparation and capture are also recorded in JSON. The original baseline counted its evidence-file write at the end of cleanup; the hardened profiler separates artifactWrite. Profile-file serialization itself is outside its own stage interval. Failed stages remain recorded with ERROR and cleanup is timed independently.

## Resource contention and sampling

| Configuration                    | Mean execution seconds | Peak running containers | Peak sampled CPU percent | Peak sampled memory MiB | Valid CPU/memory samples | Observer errors |
| -------------------------------- | ---------------------: | ----------------------: | -----------------------: | ----------------------: | ------------------------ | --------------: |
| strengthened-concurrency2        |                 11.073 |                       6 |                    89.09 |                   235.2 | 12/12                    |               6 |
| strengthened-concurrency2-repeat |                 15.135 |                       6 |                    94.64 |                   224.1 | 18/18                    |               5 |
| optimized-concurrency3           |                 13.179 |                       9 |                   181.12 |                   370.3 | 10/10                    |               4 |
| optimized-concurrency3-repeat    |                 17.148 |                       9 |                   182.41 |                   410.0 | 14/14                    |               4 |

Concurrency three increases overlap and individual execution costs while reducing the observed total wall time. Per-stage inflation is evidence of scheduling/resource contention; these samples cannot identify a single cause. CPU percent sums across cores (100% is about one core), and periodic samples are not a saturation or throttling trace. Teardown sometimes removes a container between listing and stats, producing recorded EOF/removal errors. Missing samples are unavailable, not zero; peaks may be missed. No execution OOM, timeout or infrastructure failure occurred in the five successful smoke matrices.

Every execution retains a distinct PostgreSQL tmpfs database, app, candidate and internal Docker network. Each container retains one CPU, 256 MiB memory, 64 PIDs and the existing filesystem/capability limits. Peak active execution counts were exactly the configured limits, two or three. The planner and candidate remain offline, and mutable application/database state is never shared.

## Database reuse decision

Only after profiling was reuse considered. PostgreSQL startup plus readiness represented about 21% of the original summed execution time; candidate execution and cleanup together were larger. The measured worker-pool change already reduced matched wall time while keeping fresh containers. Database reuse was not implemented or benchmarked: there is no measured reuse benefit to claim, and this milestone retains independent PostgreSQL lifecycle/state and resource limits.

## Verification and publishing

Every hardened run required all existing gates: correct failure identity, exactly 10/10 fresh buggy failures, 3/3 reference successes, 3/3 alternate successes, decoy failure with duplicate charges, offline execution, isolation, fresh state, reviewable test, no sleep-based candidate timing and identical candidate hashes. Distinct execution IDs are now also required. Wrong-frame rejection and missing-body abstention passed in every smoke. The JSON artifact records every gate and repetition count.

The [invariant audit](R1_INVARIANT.md) documents the shared application SQL check and the real PostgreSQL tests proving both valid fixes retain it. No D2, plugin, dashboard or additional benchmark case was added.

Raw reports, Docker inspections, local credentials, logs and generated fixtures are excluded from the current Git index and source archive. Portable published summaries use an allowlist and relative paths. Previous local commits retain the initial delivery artifacts; history was not rewritten and no remote publishing or CI run is claimed. [PROGRESS.md](PROGRESS.md) records final regression/security results.
