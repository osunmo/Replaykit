# ReplayKit — CLI Reference Manual

The `replaykit` command-line interface provides tools for synthesizing regression tests from incident evidence, running isolated candidate test executions, and performing formal 4-target differential verification.

---

## Command Overview

```
pnpm replaykit clean [--dry-run] [--run-id <run-id>]
pnpm replaykit doctor
pnpm replaykit generate --config <config.json> [--output <test.js>] [--model <model>] [--ambiguous-oracle]
pnpm replaykit run --config <config.json> [--test <test.js>] [--role <role>] [--patch <patch>]
pnpm replaykit verify --config <config.json> --test <test.js> [--patches-dir <dir>] [--evidence-dir <dir>]
```

### Exit Code Semantics
- `0`: Success / Differential verdict **VERIFIED**.
- `1`: Infrastructure failure, missing flags, or invalid configuration.
- `2`: Test failure, non-reproduction, or differential verdict **REJECTED** / **NOT_REPRODUCED**.

---

## 1. `replaykit clean`

Safely removes ephemeral Docker containers, networks, and volumes created during test execution.

```bash
# Preview what resources would be removed
pnpm replaykit clean --dry-run

# Prune all ReplayKit managed resources
pnpm replaykit clean

# Prune resources specific to a run ID
pnpm replaykit clean --run-id verify-1792560184488-e37f0771
```

### Options
- `--dry-run`: Scans for resources with `replaykit.run` labels without deleting them.
- `--run-id <id>`: Scopes resource pruning to a specific execution run.

---

## 2. `replaykit doctor`

Inspects host dependencies, Docker connectivity, and local Ollama model availability.

```bash
pnpm replaykit doctor
```

### Output Fields
- `docker`: Connection status (`CONNECTED`, `ERROR`, `UNAVAILABLE`) and Docker version.
- `ollama`: Connection status (`CONNECTED`, `NOT_RUNNING_OR_UNAVAILABLE`) and available models.
- `overallStatus`: `HEALTHY`, `DEGRADED_NO_OLLAMA`, or `UNHEALTHY`.

---

## 3. `replaykit generate`

Synthesizes a standalone, executable regression test from a production incident specification using a local LLM.

```bash
pnpm replaykit generate \
  --config examples/fastify4807.json \
  --output test/repro.test.js \
  --model qwen2.5-coder:3b
```

> **Requirements**:
> - Adapter Configuration: Requires a valid schema-validated configuration file (e.g. `examples/fastify4807.json` or `examples/qs33.json`).
> - Local Model: Ollama running at `http://127.0.0.1:11434` with `qwen2.5-coder:3b` (`ollama pull qwen2.5-coder:3b`).

### Options
- `--config <path>`: *(Required)* Path to the generic adapter configuration JSON (e.g. `examples/fastify4807.json`).
- `--output <path>`: Destination path where the generated test file should be saved.
- `--model <name>`: Ollama model name (default: `qwen2.5-coder:3b`).
- `--incident <path>`: Explicit path to incident context (default: resolved from config).
- `--workspace <path>`: Path to sanitized clean workspace for API documentation inspection.
- `--ambiguous-oracle`: Epistemic control flag. Simulates an ambiguous behavioral contract and returns `INSUFFICIENT_ORACLE` with exit code 2.

---

## 4. `replaykit run`

Executes a candidate test inside a hardened, isolated Docker container against a specific target revision.

```bash
pnpm replaykit run \
  --config examples/fastify4807.json \
  --test work/v0.1.0/runs/fastify-generated.js \
  --role buggy
```

> **Offline Dependencies**: Execution uses `--network none`. Dependencies are pre-staged from `fixtures/<case>/modules/` before container startup.

### Options
- `--config <path>`: *(Required)* Path to adapter configuration JSON.
- `--test <path>`: Path to test file to execute inside container.
- `--role <role>`: Execution role: `buggy` (default), `reference`, `alternate`, or `decoy`.
- `--patch <path>`: Unified diff patch file to apply before running the test.
- `--workspace <path>`: Base workspace directory to stage into the container.
- `--modules-dir <path>`: Pre-bundled offline `node_modules` directory.

### Output
Returns JSON detailing:
- `role`: Role tested.
- `executionStatus`: `COMPLETED` or `ERROR`.
- `containerExitCode`: Actual process exit code from container inspect.
- `testPassed`: Whether assertions succeeded without error.
- `reproductionVerified`: Confirms whether the original defect was observed on the buggy baseline.
- `failureIdentity`: Extracted error type and top application frame.
- `isolationVerified`: Confirms readonly root and dropped Linux capabilities.

---

## 5. `replaykit verify`

Executes the four-target differential verification matrix (`buggy`, `reference`, `alternate`, `decoy`) and produces a formal cryptographic verdict supported by raw execution artifacts.

```bash
pnpm replaykit verify \
  --config examples/fastify4807.json \
  --test work/v0.1.0/runs/fastify-generated.js \
  --evidence-dir work/v0.1.0/evidence/fastify-verify
```

### Options
- `--config <path>`: *(Required)* Adapter configuration JSON.
- `--test <path>`: *(Required)* Candidate test script.
- `--patches-dir <path>`: Directory containing `reference.patch`, `alternate.patch`, and `decoy.patch`.
- `--evidence-dir <path>`: Directory where raw stdout, stderr, and evaluation verdicts will be saved.

### Output & Verdicts
- `VERIFIED`: The test reproduces the defect on `buggy`, passes on `reference` and `alternate`, and semantically rejects the `decoy` with an `AssertionError`. Exit code `0`.
- `NOT_REPRODUCED`: The buggy baseline did not exhibit the expected failure. Exit code `2`.
- `REJECTED`: A valid fix failed, or the decoy patch was accepted. Exit code `2`.
- `ERROR`: Infrastructure error or timeout occurred. Exit code `1`.
