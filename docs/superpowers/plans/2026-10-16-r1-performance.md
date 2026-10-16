# R1 performance hardening

User-authorized scope: profile and optimize the existing R1 workflow only. No D2, plugin, dashboard, new incident cases or database reuse without measured justification.

1. Instrument the existing two-at-a-time, 10/1/1/1 matrix before changing scheduling. Record monotonic per-stage durations on success and failure, total smoke wall time, runtime/image identity and resource observations. Run a measured baseline.
2. Replace batch barriers with a bounded worker pool, configurable concurrency 1–10, default 3. Keep each execution's unique database, application, network, tmpfs and resource limits. Stop dispatching after infrastructure failure and await active cleanup. Keep candidate source immutable across the matrix.
3. Strengthen the judge to require exactly three independent successful reference and alternate executions. Retain all existing gates, the ten buggy runs, decoy, wrong-frame rejection and missing-evidence abstention. Test missing/failed repetitions and reused execution IDs.
4. Audit the payment error invariant and publishing boundaries. Preserve local raw evidence under ignored runs/. Remove generated run artifacts from the Git index, retain reviewed portable aggregate measurements in docs, and avoid absolute host paths and credential values in published reports. Keep Git history intact and document any historical artifacts.
5. Compare the profiled baseline with the full strengthened matrix at concurrency 2 and 3, on the same immutable images and candidate. Report actual wall time, summed/mean stage time, contention and the extra four fix executions separately. Do not infer speedup from summed overlapping execution durations. Evaluate DB reuse only after those measurements.
6. Run unit, SDK, PostgreSQL integration, build/type/lint/format checks, full R1 smoke and existing live security probes. Review changes independently, fix material findings, update PROGRESS/README/methodology, and stop.

Implementation ownership: primary agent owns profiling, sandbox/workflow/CLI, publication and measurements. Delegated invariant audit is read-only. A delegated judge change owns evaluate.ts and judge tests after the baseline process loads the original judge. Keep shared schemas backward-compatible for historical evidence.

Validation starts with failing behavior tests for stage failure timing, worker concurrency/refill/error draining, repeat-gate completeness and publication sanitization. Run resource-intensive Docker measurements sequentially to avoid unrelated test contention. Remote CI is not claimed unless actually executed.

Completed on 2026-10-16. Measured results, methodological limits and all local validation outcomes are recorded in [PROGRESS.md](../../PROGRESS.md) and [PERFORMANCE.md](../../PERFORMANCE.md). Database reuse and the explicitly deferred features remain outside this implementation. No remote CI run occurred.
