# ReplayKit Docker Resource Cleanup Audit

**Date:** 2026-10-20  
**Status:** **AUDITED, HARDENED & VERIFIED**  
**Component:** `packages/runtime/src/docker-cleanup.ts`, `packages/runtime/src/external-supervisor.ts`

---

## 1. Executive Summary

An audit of Docker container, network, and volume lifecycles was conducted to address resource leaks caused by interrupted staging, abnormal process termination (`SIGINT`, `SIGTERM`, unhandled exceptions), and host system sleep/hibernation.

### Key Findings
1. **Historical Orphan Discovery:**
   Inspection of the local Docker daemon identified 3 lingering containers and 3 lingering networks created during earlier R1 benchmark runs (2 days prior):
   - Containers: `rk-517d430f-335d-44da-a4c5-72402eea693b-test`, `rk-6bb2f8f1-9c96-4c3a-a9f0-b13b9d2f5c14-test`, `rk-0dbb9919-6c3d-4ac4-8ac2-57c6e5eae54f-test` (all in `Exited (1)` state).
   - Networks: `rk-0dbb9919-6c3d-4ac4-8ac2-57c6e5eae54f-net`, `rk-6bb2f8f1-9c96-4c3a-a9f0-b13b9d2f5c14-net`, `rk-517d430f-335d-44da-a4c5-72402eea693b-net`.
   - Volumes: 0 orphaned volumes.
2. **Root Cause Analysis:**
   - Standard `try/finally` blocks only execute if the Node.js event loop remains alive. If a process receives `SIGINT` (Ctrl+C), `SIGTERM`, or an unhandled crash, Node terminates immediately, leaving allocated containers and networks behind.
   - Docker network deletion requires all attached containers to be removed first (`network has active endpoints`). If container cleanup fails or is skipped, network cleanup fails downstream.
   - When tearing down containers and volumes rapidly, volume removal can race with container removal, yielding `"volume is in use by container"`.

---

## 2. Hardening Architecture

### A. Dedicated Cleanup Module (`packages/runtime/src/docker-cleanup.ts`)
- **`isReplayKitResource` Ownership Policy:**
  - Strictly targets resources carrying label `replaykit.run`, `replaykit.role`, or naming prefixes `rk-ext-`, `rk-net-`, or `rk-`.
  - **Zero-Touch Safety Guarantee:** Strictly forbids deleting any Docker Compose project (`com.docker.compose.*`) or persistent developer databases (e.g. `replaykit-dev-data`, `replaykit_default`).
- **`removeVolumeWithRetry`:**
  - Implements exponential backoff (up to 3 retries, 250ms delay) when Docker reports `"volume is in use"`, eliminating race conditions between container teardown and volume deletion.
  - Treats `"no such volume"` as idempotent success.
- **`pruneReplayKitResources(options)`:**
  - Two-stage query (by label `replaykit.run` and by name `rk-`) with deduplication.
  - Strict teardown ordering:
    1. Containers: Force-killed (`docker kill`) if running, then forcefully removed (`docker rm -f`).
    2. Networks: Removed once containers are detached (`docker network rm`).
    3. Volumes: Removed with retry backoff (`docker volume rm`).
  - Supports `dryRun: true` for safe pre-inspection without mutation.
- **`InFlightResourceTracker`:**
  - In-memory registry tracking live in-flight containers and volumes during staging and execution.
  - Registers Node.js process signal listeners (`SIGINT`, `SIGTERM`) on first resource creation.
  - On signal reception, triggers `emergencyCleanup()` before process exit, preventing interrupted runs from stranding containers.

### B. Supervisor Integration (`packages/runtime/src/external-supervisor.ts`)
- `runExternalContainer` registers volume and container IDs into `InFlightResourceTracker` immediately upon creation.
- Enhanced `finally` block uses `removeVolumeWithRetry` and unregisters cleaned resources.

---

## 3. Verification & Evidence

1. **Automated Unit & Negative Controls:**
   - 14/14 automated tests in `packages/runtime/src/docker-cleanup.test.ts` passed:
     - Label parsing & malformed input handling.
     - Ownership classification and strict Docker Compose / dev-volume rejection.
     - Volume retry on concurrent detachment.
     - Prune filtering, command execution, and `dryRun` verification.
     - `InFlightResourceTracker` registration and emergency cleanup.
     - Safe live Docker daemon dry-run scan (1,248ms).
2. **Live Daemon Sweep:**
   - Executed `scripts/phase4/run-docker-prune.ts`:
     - Identified and removed all 3 historical orphaned containers.
     - Identified and removed all 3 historical orphaned networks.
     - 0 errors recorded.
   - Verification re-run confirmed 0 orphaned containers, 0 networks, 0 volumes remaining.
3. **Protected Files Invariant:**
   - Protected benchmark files (`packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts`) verified 100% byte-for-byte untouched (`git diff --exit-code`).
