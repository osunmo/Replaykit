# Current limitations

This delivery implements the first R1 payment retry slice. A successful R1 smoke result establishes only the gates recorded for that synthetic run.

## Product and benchmark scope

- Phase 1 external work is blocked and incomplete. A separate official-suite
  schema/evaluator and source-data guards exist, but no production external runner,
  reporter normalizer, CLI or 17-run matrix exists. Six offline preflights yielded
  five infrastructure errors and one actual official failure without a production
  application frame. Docusaurus image acquisition stopped for low disk space.
  No external VERIFIED claim, fix/decoy validation, sensitivity run, Stage C study
  or LLM planner call exists. See [EXTERNAL_VALIDATION.md](EXTERNAL_VALIDATION.md).

- Checkout supports payments, charge-count reads and health. Full orders, inventory, webhooks and a real payment-provider integration are not implemented.
- R1 is the only implemented benchmark case. The remaining nineteen cases, complete twenty-case corpus, versioned truth files, fixed twelve-development/eight-held-out split and multi-trial evaluation remain unfinished.
- Smoke includes a same-exception/different-frame rejection and a missing-request-body abstention. These checks are not implementations of the full N1–N5 negative-control corpus.
- The planner is a deterministic evidence-pattern baseline. There is no LLM provider adapter, agent-alone comparison, trace-only model baseline, three-model trial matrix or token billing. R1 infrastructure timing measurements are separate from model efficacy claims.
- Cursor plugin packaging, MCP integration and actual Cursor IDE verification are not implemented. There is no dashboard.
- `replay verify --run` reruns the stored incident and candidate against the built four-variant matrix. It does not accept, build or verify an arbitrary user-proposed repair patch.

## Replay and determinism

R1 repeats the same request sequentially. PostgreSQL integration tests also exercise overlapping requests for both fixes, but the cooperative checkpoint scheduler is only unit-tested and is not connected to database race instrumentation. D1/D2 scenarios, deterministic transaction interleavings, lost updates and real PostgreSQL deadlock/serialization reproduction remain work to do.

Ten fresh buggy runs are the strict R1 criterion. They do not prove universal determinism of Node, Docker, PostgreSQL or an operating system. Infrastructure readiness polling uses timers; test correctness does not rely on sleeping. The `noSleepBasedTiming` gate records acceptance by the current static policy, not a formal analysis of all possible JavaScript behavior.

The strengthened matrix also requires three fresh successes for each valid fix. Default concurrency three overlaps independent executions; each still sends its two payment requests sequentially. No shared mutable application/database state or database reuse was introduced. Resource sampling is periodic and can miss peaks or lose a sample when cleanup removes a container; unknown measurements are not zero. Timing comparisons are local observations, not latency guarantees or a hardware-independent speedup. See [PERFORMANCE.md](PERFORMANCE.md) for before/after evidence and confounders.

The checkout ID counter is deterministic within one process and resumes from persisted attempts on restart. It is not designed to allocate unique IDs across multiple simultaneous app replicas. The synthetic provider ledger shares the local PostgreSQL transaction model; it does not reproduce every failure mode of a remote payment provider.

## Evidence and isolation

Telemetry uses explicit OpenTelemetry application/provider spans and a Sentry-shaped adapter. It does not claim complete Sentry compatibility or automatic tracing of every HTTP/SQL operation. Retained spans and breadcrumbs are bounded. `partial` currently withholds the request body; `minimal` also removes spans and breadcrumbs. General sampled-span tier variants are not fully implemented.

### Sentry Trace Reporting vs. Performance Span Availability

- **Trace retrieval vs. span presence**: Sentry trace status `AVAILABLE` signifies successful retrieval of the trace by `trace_id`, but does not imply child performance spans exist. When an error event is captured without performance instrumentation (`Sentry.startSpan`), Sentry's trace API contains only the error node. ReplayKit records an explicit `spanCount: 0` in the import summary and preserves `missingEvidence: ["spans"]`.
- **R1 span independence is category-specific**: The real Sentry R1 event achieved a `VERIFIED` verdict despite missing spans because the reproduction planner worked strictly from three visible inputs: the request payload, application stack frames (`payments/createPayment`), and provider charge breadcrumbs. The supervisor's PostgreSQL ledger assertion (2 charges vs 1) is an independent evaluator check, not a planner input. Negative controls (N1–N5) and concurrent race or deadlock cases (such as D1–D2) remain unbuilt; unbuilt concurrency cases in particular may require temporal span ordering to reconstruct execution interleavings.

### Sentry Synthetic Demo Realism Gaps

- **Single application stack frame**: The synthetic R1 demo driver invokes `createPayment` directly in `apps/checkout-api/src/payments.js` rather than sending a request through the Fastify HTTP server route handler and middleware layers. As a result, the captured error stack contains only a single application frame. Furthermore, frame locations (e.g. `payments.js:150:17`) cite compiled JavaScript line and column offsets rather than TypeScript source lines because sandbox runtime images do not bundle runtime source maps.
- **Empty URL/transaction and default HTTP method**: When error events are reported without explicit HTTP request metadata, Sentry's web UI defaults to displaying an empty URL and an unverified `GET` badge. Inspection of normalized incident artifacts (`runs/imports/<id>/incident.json`) confirms that ReplayKit extracts only the validated payload data (`{ orderId, idempotencyKey, amount }`) and honestly records method and URL as absent rather than fabricating a `GET` method or synthetic URL.
- **Planner fixed endpoint reliance**: Because production error telemetry frequently omits request endpoints or transaction names, the R1 reproduction planner does not infer arbitrary routing from telemetry. Instead, the generated test relies on the fixed payments endpoint (`/pay`) supported by the trusted broker protocol. ReplayKit is a targeted invariant reproduction tool for supported incident contracts, not a general-purpose arbitrary HTTP request replay system.

Candidate and planner containers have no network, private policies or database credentials. The deterministic planner runs in a dedicated image containing the public buggy app snapshot and planner/contracts code, with normalized input on stdin and no host mounts. A tool-using LLM adapter is still absent. The trusted host controller retains the development repository and private policy files; this is not a held-out benchmark isolation guarantee for that controller.

Candidate configuration inspection, unit policy tests and four live adversarial probe groups are implemented and passed. Planner isolation is configured by its launch flags; a separate per-plan inspection artifact is not yet recorded. Comprehensive penetration testing, image supply-chain verification and defense against a malicious host administrator or repository modification remain outside the current guarantee. See [THREAT_MODEL.md](THREAT_MODEL.md).

## Environment and reporting

Docker and a working Linux container engine are required for the strict matrix. Image/package acquisition during build uses network access; replay uses pinned local image IDs. A missing daemon, image, startup failure or cleanup error must remain an infrastructure error. Unit fixtures never substitute for successful container evidence.

The local Compose database persists its named development volume. Sandbox runs instead use fresh per-execution PostgreSQL tmpfs data. The supported local integration reset is restricted to the known loopback replaykit database and the two ledger tables.

The opt-in template build starts sandbox data as a copy of an immutable empty PostgreSQL template. This avoids repeated cluster initialization, but each execution still has its own database process, private mutable tmpfs and password. Clones share initial cluster metadata, not mutable application state. `fsync` remains on by default; tmpfs and forced teardown still make these databases disposable. An explicit `fsync=off` experiment does not establish crash recovery or durability, and no R1 gate tests those properties. Template provenance and the selected setting are recorded with each measured environment. Fresh initdb remains the default because the local concurrency-3 comparisons did not establish a full-pipeline improvement.

Generated local credentials live in ignored `.env` and sandbox credentials are ephemeral per execution. The first delivery accidentally tracked 210 archived run artifacts and one captured fixture; performance hardening removes these from the current index and source archive while preserving local files. Prior local Git commits retain those files and the old synthetic defaults. No history rewrite or remote CI/publishing has been performed.

### Duration Metrics and Concurrency Overlap

- **Cumulative vs. wall-clock duration**: In verification results, `durationMs` records the actual elapsed verification wall-clock time (133.9 seconds), while `executionTimeSumMs` records the cumulative container execution time across all 17 executions in the evaluation matrix (379.2 seconds).
- **Effective parallelism**: Under the default execution pool concurrency of 3, the ratio of cumulative execution time to matrix wall time represents an effective parallelism of approximately 2.88x ($\frac{379.2}{131.5} \approx 2.88$), with only 2.4 seconds spent on preflight, planning, and evaluation collation overhead. The 245.3-second difference between cumulative execution time and verification wall time reflects concurrency overlap across workers; do not describe this difference as unexplained latency.

Artifacts record candidate, incident, variant and dependency-lock hashes plus immutable image IDs and host runtime metadata. They do not yet provide the full release/research manifest requested by the long-term specification, including an exported image archive and comprehensive Git/model/package metadata. A later image rebuild can resolve newer base-image tags; compare recorded immutable IDs before treating two runs as identical environments.

Current reporting provides per-run JSON, Markdown and execution CSV. Aggregate rates, confidence intervals, false-positive curves, missing-data precision/recall, cost comparisons and held-out results require the missing corpus and evaluation machinery. No aggregate result should be inferred from a single successful smoke.
