# Phase 3 Security & Infrastructure Specification — Blinding Isolation & Execution Sandboxing

**Agent Role:** Security & Infrastructure Agent (Agent C)  
**Date:** 2026-10-20  
**Target:** ReplayKit Phase 3 AI Synthesis Blinding & Container Sandboxing  
**Status:** COMPLETE & AUDITED  

---

## 1. Threat Model & Security Boundaries

Phase 3 introduces two distinct security boundaries:
1. **Generator Blinding Boundary**: Preventing information leakage from future patches, upstream solutions, historical probes, or gate decision artifacts into the generator workspace.
2. **Execution Sandboxing Boundary**: Ensuring that executing newly generated untrusted AI code against 4 container targets cannot escape, perform network operations, access host files, or persist across runs.

```
+-----------------------------------------------------------------------------------+
| Host System (Windows)                                                             |
|                                                                                   |
|  [Generator Air-Gap]                                                              |
|   - Workspace: work/phase3/sanitized-buggy-workspace                              |
|   - Inputs: Pinned buggy source (test 40 scrubbed) + incident.json + API docs     |
|   - Excluded: .git history, reference/alt/decoy patches, gate probes, decisions   |
|   - Audit: 0 leak tokens detected across all 20 files                             |
|                                                                                   |
|  [External Docker Evaluator]                                                      |
|   - Network: none (--network none)                                                |
|   - User: 1000:1000 (nonroot)                                                     |
|   - Rootfs: read-only (--read-only)                                               |
|   - Caps: CapDrop ALL                                                             |
|   - SecurityOpts: no-new-privileges                                               |
|   - Limits: CPU <= 1, RAM <= 256 MiB, PIDs <= 64                                  |
|   - Storage: Private disposable volume (volume-nocopy)                            |
|   - Watchdog: PID-1 timeout 29s + supervisor 30s timeout                          |
+-----------------------------------------------------------------------------------+
```

---

## 2. Generator Workspace Blinding Invariants

| Invariant | Enforcement Mechanism | Verification Record |
| --------- | --------------------- | ------------------- |
| **Test #40 Scrubbed** | `scrubTest40FromParseJs` in `packages/runtime/src/sanitizer.ts` removes test 40 AST block. | AST inspection confirmed test count = 39 (down from 40). Zero occurrences of `'parses plain objects correctly'`. |
| **No Upstream Solution Commits** | Detached source tree; `.git` directory deleted from generator workspace. | Scanner checked for commit `6a97ad1d71d8a9069f5d6002cab3130752519ccb` and short hash `6a97ad1d`: 0 matches. |
| **No Candidate Patches** | Workspace does not copy `reference.patch`, `alternate.patch`, or `decoy.patch`. | Scanner checked for patch filenames and patch SHA-256 hashes: 0 matches. |
| **No Probes or Leaking Scripts** | `gate-b-probe.cjs` and prior gate runner scripts excluded from generator workspace. | Scanner checked for `gate-b-probe`, `issue33-output`, `issue33-assertion`: 0 matches. |
| **No Solution Hints in Documentation** | `API_DOCUMENTATION.md` provides general behavioral specifications for `Qs.parse` object merging without revealing the solution pattern. | Content reviewed and verified safe. |

---

## 3. Container Isolation & Sandboxing Policy

All executions of the newly synthesized candidate test in Stage S4 enforce:

1. **Strict Offline Mode**:
   `HostConfig.NetworkMode = "none"`.
   Verified by container inspect before execution.
2. **Non-Root Execution**:
   `Config.User = "1000:1000"`.
   Ensures unprivileged runtime inside container.
3. **Read-Only Root Filesystem**:
   `HostConfig.ReadonlyRootfs = true`.
   OS binaries and configuration cannot be altered.
4. **Complete Capability Dropping**:
   `HostConfig.CapDrop = ["ALL"]`.
   Zero Linux capabilities retained.
5. **No New Privileges**:
   `HostConfig.SecurityOpt = ["no-new-privileges"]`.
   Prevents privilege escalation via setuid binaries.
6. **No Host Directory Bind Mounts**:
   `HostConfig.Binds = null`.
   Staging is conducted strictly via private named volume `rk-ext-...-case`.
7. **Two-Tier Watchdog**:
   - Container PID 1: `/usr/bin/timeout --verbose --signal=KILL 29s`.
   - Supervisor timeout: Process abort at 30 seconds.
8. **100% Resource Teardown**:
   Disposable containers killed and removed (`docker rm -f`).
   Disposable named volumes removed (`docker volume rm`).

---

## 4. Protected R1 Immutability Audit

- `packages/judge/src/evaluate.ts`: 0 bytes modified (`git diff --exit-code`).
- `packages/contracts/src/index.ts`: 0 bytes modified (`git diff --exit-code`).
- Prior benchmark runs in `work/phase2/` preserved intact.
