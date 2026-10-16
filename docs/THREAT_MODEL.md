# Threat model

The security boundary protects the host, benchmark evidence and private fix artifacts from an untrusted generated candidate test. Telemetry is also untrusted input. This local prototype uses synthetic payment data and a trusted checkout implementation, controller, Docker daemon and build environment.

## Trust boundaries

| Surface                                           | Trust and access                                                                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Incident JSON                                     | Untrusted, schema-validated and redacted before planning; its text is evidence, not instructions.                                       |
| Deterministic planner                             | Pure function consuming normalized visible evidence inside a separate restricted planner container; no private variants or host mounts. |
| Candidate code                                    | Untrusted; runs only in a restricted candidate container.                                                                               |
| Candidate stdout                                  | Untrusted command channel and diagnostics. It cannot establish charge counts or matching failure identity.                              |
| Broker/controller                                 | Trusted host process with Docker authority; validates commands before invoking a fixed client in the app container.                     |
| Checkout and PostgreSQL                           | Trusted synthetic system under test; provide domain observations.                                                                       |
| Build scripts, image manifest and source checkout | Trusted developer inputs. A malicious repository modification can change the judge or trusted service and is outside this boundary.     |
| Host administrator and Docker daemon              | Trusted. This design does not defend against an administrator or compromised container runtime.                                         |

## Enforced controls

The candidate runs as UID/GID `1000:1000`, with `--network none`, a read-only root filesystem, all Linux capabilities dropped, `no-new-privileges`, one CPU, 256 MiB memory and a 64-process limit. Its only bind mount is its own candidate directory at `/candidate`, read-only. A small disposable `/tmp` is writable. No Docker socket, host checkout, Git history, private policy, application filesystem or database credential is mounted into it.

The trusted runner inspects the created candidate container and rejects missing or incompatible user, network, filesystem, capability, privilege, resource-limit or mount settings. It also inspects the app/database network for `Internal: true`, and records the inspected objects in each execution's `isolation.json`. These records show the checked configuration; they are not a proof against every container escape or kernel vulnerability.

The app and PostgreSQL use a separate per-run internal network with no published ports. The candidate communicates through bounded stdout request messages and stdin responses. The supervisor permits only `pay` with the exact captured payment fields and `charges` for the captured order. IDs are unique and limited to twenty commands. The internal app-side client supports only fixed localhost routes with strict input schemas, a five-second timeout and redirects disabled. Candidates cannot provide shell fragments, URLs, paths, headers or database statements.

Docker commands use argument arrays with `shell: false`. Candidate execution has a thirty-second deadline and each output channel is bounded to 64 KiB. On failure, the broker stops queued dispatch and drains any in-flight command (with its existing ten-second Docker deadline) before resource cleanup. Cleanup itself has bounded Docker commands. Failure or cleanup errors produce execution `ERROR` evidence, not a successful reproduction.

Static TypeScript inspection rejects unsupported imports, direct throws, loops and named dangerous globals, and enforces the reviewability bounds. It complements container isolation and the variant matrix. Static syntax checks are not a JavaScript capability-security proof.

The build helper copies named runtime inputs into dedicated contexts, rejects symbolic-link inputs and path escapes, and uses immutable image IDs for execution. The candidate image contains only Node and the trusted replay SDK. Build-time network access is separate from replay execution.

Fresh PostgreSQL initialization remains the default. The opt-in `--postgres-mode template-copy` build produces an image containing a cleanly stopped, empty schema template with no usable database password. Its schema comes from the exact compiled application module included in the app image. In this mode, the unprivileged database entrypoint refuses nonempty data directories, copies the template into that execution's private tmpfs, validates and installs a new 64-hex-character password in single-user mode, and only then opens TCP with SCRAM authentication. Password-setting SQL and diagnostics are suppressed to keep secrets out of logs. The template remains on the read-only image filesystem; no running database or mutable volume is shared. Live snapshot probes check authentication, isolated writes, fresh replacement state, immutable template contents and rejected bootstrap inputs. Both modes retain independent databases and default to fsync on; the optional experiment does not weaken any judge gate.

Planning also executes in a separate network-disabled, unprivileged, read-only container with the same capability/resource restrictions and a fifteen-second deadline. Its image contains the public buggy app base plus planner/contracts code. The controller passes normalized incident JSON via stdin, and the entrypoint limits input to 1 MiB. It receives no host mounts, Git history, private policies or database credentials. The candidate inspection record described above does not double as a separate persisted planner inspection record.

## Evidence integrity

The supervisor queries PostgreSQL directly after execution and obtains failure identity from application logs, outside the candidate filesystem. Before running a candidate it checks that both ledger tables are empty. It records the candidate hash, variant source hash and image identifiers, then requires the identical candidate across all variants. The bounded pool defaults to three executions; every worker creates its own PostgreSQL/app/candidate containers and internal network. The matrix requires ten buggy runs, three independent reference successes, three alternate successes and a failing decoy; reused execution IDs are rejected. The image manifest is pinned for the matrix.

Sandbox passwords are randomly generated per execution. Local development credentials are generated in an ignored `.env`; tracked examples contain placeholders. Raw Docker inspections and execution artifacts are ignored local files. Published measurements use a fixed allowlist of numerical observations, gates, image/hash identifiers and relative paths. Historic local commits still contain the earlier synthetic defaults and raw archived reports; no history rewrite or remote publication was performed.

The decoy check catches symptom suppression: a candidate must still fail while the real ledger contains duplicate charges, even when the app emits no domain error. Failure identity includes the actual exception type and normalized application frame, so a matching exception name from another path cannot satisfy the gate.

Incident normalization redacts sensitive keys and common token/email/payment-number text patterns, limits recursive processing, and validates the retained fields. Application traffic is intentionally synthetic and rejects unknown request fields. This is not a complete PII detector or authorization to ingest real production records.

## Verified coverage and remaining work

Unit tests exercise broker rejection, isolation configuration rejection, prohibited candidate syntax, failure-identity mismatch, fake stdout evidence, changed candidate hashes and incomplete matrices. Repository-authored SDK protocol tests cover message correlation, request limits, malformed responses, closure and timeouts. Actual replay configuration and verdict evidence belong to `runs/<run-id>`.

The checked-in `pnpm test:security` probes exercise real containers: private-file/Docker-socket access, candidate/root filesystem writes, external/host egress, arbitrary broker commands, infinite loops and memory exhaustion. Expected OOM and timeout outcomes are execution `ERROR`, never a verified reproduction. The [current follow-up validation record](PROGRESS.md#follow-up-validation-record) identifies completed checks and local run IDs; raw security reports remain under ignored `runs/` directories. These bounded probes are not comprehensive penetration testing or a proof against every container escape.

The runner inspects final container state and rejects OOM, abnormal exit codes, runtime errors and incomplete execution. Cleanup reconciles every intended resource name, including partially failed creates, and verifies the run ownership label before deletion. Abrupt host termination or daemon failure can still prevent cleanup; the unique `replaykit.run` labels support manual inspection.

Before a READY plan can execute, its request must exactly match the redacted incident body, the service must be checkout-api, and the incident revision must identify the full immutable buggy application image. Normalized incident JSON goes through the same redaction boundary before planning or persistence. Reruns also compare the saved test hash with the prior judge result.

The host controller has access to benchmark truth. The planner container receives an independently packaged visible snapshot, but a future tool-using or LLM adapter will need its own audited tools, provider access and capability boundaries. The current development checkout and trusted host controller do not establish a complete held-out evaluation. Source/build tampering, a malicious admin, daemon compromise and image supply-chain compromise remain outside the current guarantee.
