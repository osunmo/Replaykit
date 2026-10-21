---
description: Non-negotiable security invariants for ReplayKit sandboxing, token hygiene, and resource ownership cleanup.
globs: ["packages/runtime/**", "packages/judge/**", "scripts/**"]
---

# ReplayKit Security Invariants

All container executions, cleanup operations, and repository scripts must enforce these non-negotiable security invariants.

## 1. Hermetic Sandbox Containment

Untrusted repository source code, generated tests, and candidate patches must run inside strictly isolated Docker containers:
- **Offline Network Isolation**: Every execution container must be started with `--network none`. Zero inbound or outbound network traffic is permitted.
- **Read-Only Root Filesystem**: The container root filesystem must be mounted read-only (`--read-only`). Writable directories are restricted to memory-backed temporary mounts (`tmpfs` size capped at 32MB).
- **Non-Root Execution**: Containers must run as an unprivileged user (UID/GID `10001:10001` or `1000:1000`), never as `root`.
- **Capability Dropping**: Drop all Linux capabilities via `--cap-drop=ALL` and enforce `--security-opt no-new-privileges`.
- **Resource Limits**: Enforce bounded memory (`--memory 256m`), CPU quotas (`--cpus 1.0`), and PID limits (`--pids-limit 128`).
- **PID 1 Watchdog**: Every container entrypoint must be wrapped with `/usr/bin/timeout --signal=KILL` to guarantee process termination even if child processes hang.

## 2. Docker Resource Ownership & Safe Cleanup

Cleanup operations (`replaykit clean` and `pruneReplayKitResources`) must strictly respect host resource ownership:
- **Mandatory Explicit Labels**: Only containers, networks, and volumes labeled with `replaykit.run`, `replaykit.role`, `replaykit.phase`, or `org.replaykit.role` are eligible for removal.
- **No Broad Name-Prefix Deletion**: Unlabeled resources matching `rk-*` or similar prefixes must **never** be deleted without verified label ownership.
- **Strict Protection of User Development Resources**: Containers such as `replaykit-postgres-1`, `dockroute-demo-*`, networks such as `replaykit_default` and `dockroute-demo_default`, and volumes such as `replaykit-dev-*` belong to the user's active development environment and must never be pruned.
- **Zero Mutation in Dry-Run**: `pnpm replaykit clean --dry-run` must perform zero mutations against the Docker daemon and report candidate counts, durations, and executed queries.

## 3. Secret & Credential Hygiene

- **Zero Hardcoded Secrets**: No API keys, passwords, bearer tokens, or private credentials may be embedded in prompts, test fixtures, source files, or commit logs.
- **Pre-Commit Token Scanning**: All files must pass `pnpm token:scan` (`scripts/token-scan.ts`). Only authorized fake canaries defined in `telemetry/src/token-scan.ts` are permitted.
- **Telemetry Redaction**: Incident reports and telemetry ingestion must sanitize HTTP headers (e.g., `Authorization`, `Cookie`, `X-Api-Key`) and mask sensitive body fields before passing context to AI generators or evaluators.
