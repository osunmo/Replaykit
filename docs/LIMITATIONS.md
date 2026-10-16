# Current limitations

This delivery implements the first R1 payment retry slice. A successful R1 smoke result establishes only the gates recorded for that synthetic run.

## Product and benchmark scope

- Checkout supports payments, charge-count reads and health. Full orders, inventory, webhooks and a real payment-provider integration are not implemented.
- R1 is the only implemented benchmark case. The remaining nineteen cases, complete twenty-case corpus, versioned truth files, fixed twelve-development/eight-held-out split and multi-trial evaluation remain unfinished.
- Smoke includes a same-exception/different-frame rejection and a missing-request-body abstention. These checks are not implementations of the full N1–N5 negative-control corpus.
- The planner is a deterministic evidence-pattern baseline. There is no LLM provider adapter, agent-alone comparison, trace-only model baseline, three-model trial matrix, token billing or performance claim.
- Cursor plugin packaging, MCP integration and actual Cursor IDE verification are not implemented. There is no dashboard.
- `replay verify --run` reruns the stored incident and candidate against the built four-variant matrix. It does not accept, build or verify an arbitrary user-proposed repair patch.

## Replay and determinism

R1 repeats the same request sequentially. PostgreSQL integration tests also exercise overlapping requests for both fixes, but the cooperative checkpoint scheduler is only unit-tested and is not connected to database race instrumentation. D1/D2 scenarios, deterministic transaction interleavings, lost updates and real PostgreSQL deadlock/serialization reproduction remain work to do.

Ten fresh buggy runs are the strict R1 criterion. They do not prove universal determinism of Node, Docker, PostgreSQL or an operating system. Infrastructure readiness polling uses timers; test correctness does not rely on sleeping. The `noSleepBasedTiming` gate records acceptance by the current static policy, not a formal analysis of all possible JavaScript behavior.

The checkout ID counter is deterministic within one process and resumes from persisted attempts on restart. It is not designed to allocate unique IDs across multiple simultaneous app replicas. The synthetic provider ledger shares the local PostgreSQL transaction model; it does not reproduce every failure mode of a remote payment provider.

## Evidence and isolation

Telemetry uses explicit OpenTelemetry application/provider spans and a Sentry-shaped adapter. It does not claim complete Sentry compatibility or automatic tracing of every HTTP/SQL operation. Retained spans and breadcrumbs are bounded. `partial` currently withholds the request body; `minimal` also removes spans and breadcrumbs. General sampled-span tier variants are not fully implemented.

Candidate and planner containers have no network, private policies or database credentials. The deterministic planner runs in a dedicated image containing the public buggy app snapshot and planner/contracts code, with normalized input on stdin and no host mounts. A tool-using LLM adapter is still absent. The trusted host controller retains the development repository and private policy files; this is not a held-out benchmark isolation guarantee for that controller.

Candidate configuration inspection, unit policy tests and four live adversarial probe groups are implemented and passed. Planner isolation is configured by its launch flags; a separate per-plan inspection artifact is not yet recorded. Comprehensive penetration testing, image supply-chain verification and defense against a malicious host administrator or repository modification remain outside the current guarantee. See [THREAT_MODEL.md](THREAT_MODEL.md).

## Environment and reporting

Docker and a working Linux container engine are required for the strict matrix. Image/package acquisition during build uses network access; replay uses pinned local image IDs. A missing daemon, image, startup failure or cleanup error must remain an infrastructure error. Unit fixtures never substitute for successful container evidence.

The local Compose database persists its named development volume. Sandbox runs instead use fresh per-execution PostgreSQL tmpfs data. The supported local integration reset is restricted to the known loopback replaykit database and the two ledger tables.

Artifacts record candidate, incident, variant and dependency-lock hashes plus immutable image IDs and host runtime metadata. They do not yet provide the full release/research manifest requested by the long-term specification, including an exported image archive and comprehensive Git/model/package metadata. A later image rebuild can resolve newer base-image tags; compare recorded immutable IDs before treating two runs as identical environments.

Current reporting provides per-run JSON, Markdown and execution CSV. Aggregate rates, confidence intervals, false-positive curves, missing-data precision/recall, cost comparisons and held-out results require the missing corpus and evaluation machinery. No aggregate result should be inferred from a single successful smoke.
