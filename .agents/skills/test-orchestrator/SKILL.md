---
name: test-orchestrator
description: >-
  Orchestrate ReplayKit quality gates, analyze changed files, select appropriate check levels (QUICK, TARGETED, RELEASE), invoke the executable quality runner, and route failures to specialized agents.
---

# ReplayKit Test Orchestrator Skill

Use this skill whenever code in ReplayKit is modified, or when verifying that a pull request or changeset meets ReplayKit's quality standards.

## Procedure

### Step 1: Analyze Changed Files and Select Gate Level

Inspect git status to identify modified subsystems:
```powershell
git status --porcelain
```

Determine the applicable quality gate:
- **`quick`**: For documentation, typing, or isolated unit changes.
- **`targeted`**: When changes touch `packages/runtime`, `packages/cli`, `packages/judge`, or adapter configurations.
- **`release`**: For pre-release verification, milestone sign-off, or when requested explicitly.

### Step 2: Execute the Quality Runner

Run the deterministic quality runner:
```powershell
pnpm quality:check --mode <quick|targeted|release>
```
Or use the shortcut scripts:
- Quick: `pnpm quality:quick`
- Targeted: `pnpm quality:targeted`
- Release: `pnpm quality:release`

### Step 3: Parse Report & Route Failures

The quality runner writes machine-readable results to `work/quality-runs/latest/quality-report.json`.

If any check fails (exit code 1 or 2):
1. Read the report failure classification:
   - `TYPECHECK_FAILURE` -> Assign to **CLI Specialist**.
   - `INVALID_GENERATED_TEST` / `INSUFFICIENT_ORACLE` -> Assign to **AI Test Specialist**.
   - `DOCKER_TIMEOUT` / `DEPENDENCY_FAILURE` -> Assign to **Docker Specialist**.
   - `EVALUATOR_FALSE_POSITIVE` / `APPLICATION_REGRESSION` -> Assign to **Test Auditor**.
   - `SANDBOX_VIOLATION` / `EVIDENCE_INTEGRITY_FAILURE` -> Assign to **Security Auditor**.
2. Request a minimal, scoped fix from the assigned specialist.
3. Re-run `pnpm quality:quick` to verify the fix.

### Step 4: Verification Gate Sign-Off

Confirm that:
1. All executed checks return status `PASS`.
2. Protected judge contracts remain 100% byte-for-byte untouched:
   ```powershell
   git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts
   ```
3. Docker cleanup dry-run reports 0 orphaned resources:
   ```powershell
   pnpm replaykit clean --dry-run
   ```
