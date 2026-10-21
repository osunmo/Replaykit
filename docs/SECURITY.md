# ReplayKit — Security Policy & Trust Model

ReplayKit executes potentially untrusted, newly synthesized regression tests and candidate patches. The execution sandbox is engineered with defense-in-depth security principles to protect developer workstations and build infrastructure from remote code execution, secret leakage, and Denial of Service.

---

## 1. Sandbox Isolation Guarantees

Every test execution (under `replaykit run` or `replaykit verify`) runs inside an isolated container with strict kernel containment parameters:

| Control | Parameter | Guarantee |
| :--- | :--- | :--- |
| **Offline Execution** | `--network none` | Complete network egress prevention. Containers cannot call external APIs, exfiltrate data, or resolve DNS. |
| **Read-Only Root Filesystem** | `--read-only` | The root filesystem cannot be modified. Writes are restricted to isolated ephemeral tmpfs mounts. |
| **Capabilities Dropped** | `--cap-drop ALL` | All Linux kernel capabilities are stripped, preventing privilege escalation. |
| **No New Privileges** | `--security-opt no-new-privileges:true` | Prevents processes from acquiring additional privileges via `setuid` binaries. |
| **Unprivileged UID/GID** | `--user 1000:1000` | Containers run as a non-root standard user. |
| **Ephemeral Volume Staging** | Named volumes with `volume-nocopy` | Staged trees are copied via `docker cp` and pruned upon process exit. |
| **PID Limit** | `--pids-limit 64` | Prevents fork-bombing or process table exhaustion. |
| **Memory Limit** | `--memory 256m` | Memory hard cap prevents host OOM crashes. |
| **CPU Limit** | `--cpus 1.0` | CPU bounding prevents CPU starvation. |
| **Hardware Watchdog** | `--entrypoint /usr/bin/timeout 29s` | Enforces absolute kernel execution deadlines. |

---

## 2. AST & Static Safety Validation

Before any AI-generated test is executed inside the sandbox, its Abstract Syntax Tree (AST) is statically parsed using TypeScript:
- **Banned Global Identifiers**: Identifiers such as `eval`, `Function`, `globalThis`, `global`, `SharedArrayBuffer`, `Atomics`, `WebAssembly`, `WebSocket`, `XMLHttpRequest` are rejected.
- **Banned Module Requires**: Dynamic `require()` and unauthorized module imports are strictly prohibited.
- **Process Manipulation Ban**: Calls to `process.kill`, `process.abort`, `process.chdir`, `process.setuid`, `process.binding`, `process.dlopen`, and `process.exit(0)` are rejected.
- **Swallowed Error Detection**: Catch blocks that log errors without rethrowing or triggering assertion failures are rejected as vacuous or masking defect reproduction.

---

## 3. Secret Token & PII Protection

- **Pre-Commit / Pre-Build Secret Scanning**: `pnpm token:scan` scans all repository files for private keys, AWS tokens, Sentry tokens, and GitHub credentials before commits or test runs.
- **Telemetry Redaction**: Incident telemetry sanitizes request bodies, masks IP addresses (`/24` subnet masking), and replaces environment variable secrets with `[REDACTED]`.

---

## 4. SSRF Defense for Sentry Telemetry Ingestion

When importing incident events from external monitoring systems (e.g. Sentry):
- **DNS Resolution Pinning**: Hostnames are resolved to IP addresses and checked against private CIDR blocks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.169.254/32` cloud metadata endpoints).
- **Socket Pinning**: Requests are pinned to validated public IPs, preventing DNS rebinding attacks.

---

## 5. Epistemic Honesty & Ambiguous Oracle Handling

ReplayKit rejects the hallucination of behavioral expectations:
- When incident telemetry lacks sufficient behavioral specification to distinguish intended behavior from defect behavior, the synthesizer returns `INSUFFICIENT_ORACLE` with exit code 2 rather than guessing.
- The evaluator requires positive passing tests on correct repairs and differential semantic rejection on decoy repairs before returning `VERIFIED`. An exit code of 0 is never returned without positive execution evidence.
