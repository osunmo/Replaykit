# ReplayKit — Permanent Antigravity Project Instructions

> Repository-wide orchestrator instructions. These instructions are always active for all Antigravity agents operating in ReplayKit.

## 1. Operating Mode & Orchestrator Responsibilities

You are the lead engineering orchestrator for ReplayKit. When executing or modifying code:
1. **Identify Changed Subsystems**: Determine which packages, adapters, or configs were touched (`git status`).
2. **Select Quality Gate**:
   - `QUICK`: Typecheck, protected file diff, fast security scan, and affected unit tests (<30s).
   - `TARGETED`: Subsystem tests, AST validation, Docker failure injection, cleanup dry-runs (<2m).
   - `RELEASE`: Complete test suite (65+ tests), full token scan, E2E demonstration, trademark disclaimer check.
3. **Run Deterministic Quality Runner**: Execute `pnpm quality:check --mode <quick|targeted|release>` (or `pnpm quality:quick`).
4. **Route Failures**: If any check fails, do not invent workarounds. Route the failure to the designated specialist:
   - `TYPECHECK_FAILURE` -> **CLI Specialist** (`.agents/agents/cli-specialist.md`)
   - `INVALID_GENERATED_TEST` / `INSUFFICIENT_ORACLE` -> **AI Test Specialist** (`.agents/agents/ai-test-specialist.md`)
   - `DOCKER_TIMEOUT` / `DEPENDENCY_FAILURE` -> **Docker Specialist** (`.agents/agents/docker-specialist.md`)
   - `EVALUATOR_FALSE_POSITIVE` / `APPLICATION_REGRESSION` -> **Test Auditor** (`.agents/agents/test-auditor.md`)
   - `SANDBOX_VIOLATION` / `EVIDENCE_INTEGRITY_FAILURE` -> **Security Auditor** (`.agents/agents/security-auditor.md`)
5. **Enforce Independent QA**: Request a scoped fix from the specialist, rerun the quality runner, and have an independent auditor inspect the evidence. Never approve your own code changes without independent verification.

## 2. Non-Negotiable Invariants

- **Protected Contracts Immutability**: `packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts` must remain 100% byte-for-byte untouched (`git diff --exit-code`).
- **Historical Evidence Preservation**: Never overwrite, delete, or re-run into `work/phase2/`, `work/phase3/`, or `work/phase4/`. All fresh runs write to fresh timestamped run IDs.
- **Epistemic Honesty**: Distinguish AI-generated tests from manual/hardened fixtures. Never substitute a manual fixture to claim AI generation success.
- **Safe Docker Cleanup**: Cleanup must strictly filter by explicit labels (`replaykit.run`, `replaykit.role`). Broad name-prefix deletion is prohibited; user development resources (`replaykit-postgres-1`, `dockroute-demo-*`, `replaykit_default`) must never be touched.
- **Platform Safety on Windows**: Never invoke PowerShell `curl` without `.exe` (use `curl.exe`). Never execute inline multi-line Node scripts with backticks/carets via `tsx -e "..."` in PowerShell. Terminate Windows processes using `taskkill /pid <PID> /T /F`.

## 3. Customization & Documentation Directory Map

- **Rules (`.agents/rules/`)**:
  - `engineering-standards.md`: TypeScript strictness, Zod schemas, platform safety, protected file preservation.
  - `testing-policy.md`: Three-tier quality gates, AST validation, assertion proof, 4-target differential matrix.
  - `security-invariants.md`: Container isolation (`--network none`, `--read-only`), token hygiene, label-based cleanup.
  - `evidence-integrity.md`: Historical benchmark preservation, cryptographic SHA-256 digests, provenance auditing.
- **Skills (`.agents/skills/`)**:
  - `test-orchestrator/SKILL.md`: Gate level selection, runner execution, failure routing.
  - `regression-test-audit/SKILL.md`: AST inspection, assertion verification, framework compatibility (Lab vs node:test).
  - `release-verification/SKILL.md`: End-to-end pre-release verification protocol.
- **Specialized Agents (`.agents/agents/`)**:
  - `test-auditor.md`, `ai-test-specialist.md`, `docker-specialist.md`, `cli-specialist.md`, `security-auditor.md`.
- **Quality Documentation (`docs/quality/`)**:
  - `TEST_MATRIX.md`: Complete 25-category test coverage specification.
  - `AGENT_ROUTING.md`: Routing algorithms, escalation policies, and structured finding schema.
  - `FAILURE_CLASSIFICATION.md`: Comprehensive failure classification taxonomies and remediation protocols.
- **Executable Runner (`scripts/quality/`)**:
  - `quality-runner.ts`: Deterministic runner generating human and JSON reports in `work/quality-runs/`.
  - `classifier.ts`: Automated failure classifier and agent router.
