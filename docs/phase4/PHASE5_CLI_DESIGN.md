# Phase 5 Developer-Facing CLI Architecture & Verification

**Date:** 2026-10-20  
**Status:** **IMPLEMENTED, TESTED & VERIFIED**  
**Module:** `packages/cli/src/developer-command.ts`, `packages/cli/src/index.ts`

---

## 1. Executive Summary

ReplayKit Phase 5 introduces a developer-facing CLI surface that decouples framework benchmarking from internal test scripts and exposes direct operator commands for:
1. **Resource Hygiene (`clean`):** Safely sweeps orphaned Docker containers, networks, and volumes labeled `replaykit.run` or prefixed `rk-`, with zero interference to Docker Compose or developer database fixtures.
2. **Environment Diagnostics (`doctor`):** Audits container runtime connectivity, pinned images, and local Ollama model availability (`qwen2.5-coder:3b`).
3. **AI Test Generation (`generate`):** Ingests configuration-driven incident contexts, invokes local LLM test synthesis, validates AST safety invariants (rejecting swallowed promises, missing assertions, and process bypasses), and produces versioned standalone test files.
4. **Isolated Test Execution (`run`):** Config-driven execution of candidate tests inside sandboxed Docker containers (`--network none`, read-only rootfs, 256 MiB RAM, 1 CPU, 29s watchdog), output normalization, and exit code reporting.
5. **Differential Evaluation (`verify`):** Multi-target differential verification comparing buggy base, reference fix, alternate fix, and decoy patch, returning formal evaluator verdicts (`VERIFIED`, `REJECTED`, `NOT_REPRODUCED`).

---

## 2. Command Reference

### `replaykit clean [--dry-run] [--run-id <run-id>]`
- **Description:** Sweeps orphaned ReplayKit Docker resources left behind by aborted executions, crashes, or timeouts.
- **Flags:**
  - `--dry-run`: Pre-inspects resources without executing deletion commands.
  - `--run-id <id>`: Scopes cleanup to a specific execution ID.
- **Exit Codes:** `0` on success; `1` on error.

### `replaykit doctor`
- **Description:** Diagnostic health check of Docker daemon and local AI service.
- **Output:** JSON report detailing Docker version, Ollama connection status, available models, and overall environment health.
- **Exit Codes:** `0` if healthy; `1` if Docker or container runtime is unavailable.

### `replaykit generate --config <path> [--output <path>] [--model <model>] [--ambiguous-oracle]`
- **Description:** Synthesizes a new executable regression test file from incident context.
- **Flags:**
  - `--config <path>`: Path to `GenericAdapterConfig` or incident context JSON.
  - `--output <path>`: Path where synthesized test is saved.
  - `--model <name>`: LLM model tag (default: `qwen2.5-coder:3b`).
  - `--ambiguous-oracle`: Epistemic honesty control returning deterministic `INSUFFICIENT_ORACLE` without fabricating assertions.
- **Exit Codes:** `0` on `GENERATED`; `2` on `INSUFFICIENT_ORACLE` or AST validation rejection; `1` on error.

### `replaykit run --config <path> [--test <path>] [--role <buggy|reference|alternate|decoy>] [--patch <path>]`
- **Description:** Executes a single candidate test against a target revision in an isolated container.
- **Exit Codes:** `0` if test passed; `2` if test failed; `1` on infrastructure or container error.

### `replaykit verify --config <path> --test <path> [--patches-dir <dir>]`
- **Description:** Executes four-target differential evaluation (buggy, reference, alternate, decoy) to verify semantic regression behavior.
- **Exit Codes:** `0` on `VERIFIED`; `2` on `REJECTED` or `NOT_REPRODUCED`; `1` on error.

---

## 3. Verification & Testing

- **Unit Test Suite:** 13/13 passing tests in `packages/cli/test/developer-command.test.ts`:
  - `clean --dry-run` and live Docker resource sweeping.
  - `doctor` diagnostics for connected and disconnected runtime states.
  - `generate` missing-flag handling and epistemic ambiguous-oracle controls.
  - `run` payload staging, supervisor isolation, and output normalization.
  - `verify` differential evaluation across all 4 targets (buggy failure, reference pass, alternate pass, decoy rejection).
- **TypeScript Typecheck:** `pnpm typecheck` passed with exit code 0 (zero errors).
- **Protected Contracts Invariant:** `packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts` verified 100% byte-for-byte untouched (`git diff --exit-code`).
