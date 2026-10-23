# ReplayKit

ReplayKit turns production incident telemetry and error traces into executable regression tests, verifies reproduction inside isolated Docker containers, and performs differential four-target verification against reference, alternate, and decoy repairs.

---

## Developer CLI Quick Start

ReplayKit provides a developer-facing CLI (`replaykit`) for generating, running, and verifying regression tests across backend codebases.

### 1. Prerequisites
- **Node.js**: `>=22.13.0` (LTS)
- **pnpm**: `10.20.0`
- **Docker**: Engine `20.10+` with Linux containers enabled
- **Ollama**: (Optional for test execution, required for local AI generation) running at `http://127.0.0.1:11434` with model `qwen2.5-coder:3b`

### 2. Verify Environment Health

```bash
pnpm replaykit doctor
```

```json
{
  "timestamp": "2026-10-21T04:24:11.617Z",
  "platform": "win32",
  "nodeVersion": "v22.23.3",
  "docker": {
    "status": "CONNECTED",
    "version": "29.8.1"
  },
  "ollama": {
    "status": "CONNECTED",
    "models": [
      "qwen2.5-coder:3b"
    ]
  },
  "overallStatus": "HEALTHY"
}
```

---

## 3. Five-Minute Reproduction Walkthrough

ReplayKit includes self-contained reproducible demonstration fixtures and top-level example configurations:
- `examples/fastify4807.json` (Fastify issue #4807)
- `examples/qs33.json` (qs issue #33)

> **Note on Test Synthesis**: `pnpm replaykit generate` requires a supported generic adapter configuration (such as `examples/fastify4807.json` or `examples/qs33.json`) pointing to valid incident context and workspace directories.
> **Note on Dependencies**: Because isolated Docker sandboxes run with `--network none`, dependencies are staged offline before execution from `fixtures/<case>/modules/`.
> **Note on Local Model**: Local test generation uses Ollama running locally at `http://127.0.0.1:11434` with `qwen2.5-coder:3b` (`ollama pull qwen2.5-coder:3b`).

### Demonstration 1: Fastify Malformed URL Handling (#4807)

```bash
# 1. Synthesize a regression test from incident telemetry via local Ollama
pnpm replaykit generate --config examples/fastify4807.json --output repro.test.js

# 2. Run the generated test against the buggy baseline (verifies authentic TypeError)
pnpm replaykit run --config examples/fastify4807.json --test repro.test.js --role buggy

# 3. Perform 4-target differential verification (buggy, reference, alternate, decoy)
pnpm replaykit verify --config examples/fastify4807.json --test repro.test.js

# 4. Clean up any execution containers
pnpm replaykit clean
```

### Demonstration 2: Qs Object.create(null) Dictionary (#33)

```bash
# 1. Synthesize a regression test
pnpm replaykit generate --config examples/qs33.json --output qs.test.js

# 2. Confirm reproduction of TypeError on buggy baseline
pnpm replaykit run --config examples/qs33.json --test qs.test.js --role buggy

# 3. Verify against reference and alternate repairs while rejecting the decoy
pnpm replaykit verify --config examples/qs33.json --test qs.test.js
```

---

## 4. Differential Verification & Trust Boundaries

The verification engine does not simply check booleans. A verdict of `VERIFIED` requires:
- **Actual execution evidence**: Raw process output and exit codes collected via trusted supervisor.
- **Matching test hashes**: SHA-256 of candidate test source is identical across all target runs.
- **Expected failure identity**: Buggy execution fails specifically with the reported error type and top application frame.
- **Recorded assertion execution**: Confirmed passing assertions on both reference and alternate fixes.
- **Semantic decoy rejection**: Incorrect repairs are rejected with an `AssertionError`.
- **Baseline non-regression**: Standard baseline test suites pass across all targets.
- **Offline isolation**: Enforces `--network none`, `--read-only`, and `--cap-drop ALL`.
- **Resource cleanup**: Containers and temporary volumes are guaranteed to be cleaned up.

---

## 5. Benchmark & Incident Commands

For synthetic payment/idempotency benchmark evaluation:

```bash
# Build sandbox container images
pnpm sandbox:build

# Run the 17-run smoke benchmark matrix
pnpm benchmark smoke

# Capture an incident from live checkout service
pnpm replaykit incident capture --output benchmark/incidents/R1/visible/incident.json

# Run incident replay
pnpm replaykit incident run --fixture benchmark/incidents/R1/visible/incident.json

# Replay and verify prior run
pnpm replaykit replay verify --run <run-id>
```

---

## 6. Model Context Protocol (MCP) & Editor Extension

- **MCP stdio server** (`packages/mcp`): Exposes `replaykit_reproduce`, `replaykit_status`, `replaykit_report`, `replaykit_open_test`, `replaykit_cancel` for Cursor and Claude Desktop.
- **VS Code Extension** (`apps/vscode-extension`): Activity Bar panel with live progress, report browsing, and direct code navigation.

---

## 7. Documentation & Guides

- [Installation Guide](docs/INSTALLATION.md)
- [CLI Reference Manual](docs/CLI_REFERENCE.md)
- [Architecture & Design](docs/ARCHITECTURE.md)
- [Security Policy & Sandboxing](docs/SECURITY.md)
- [Supported Environments Matrix](docs/ENVIRONMENTS.md)
- [v0.1.0 Release Acceptance Report](docs/release/V0_1_0_ACCEPTANCE.md)

---

## 8. License

MIT License. Copyright (c) 2026 ReplayKit contributors.

---

## 9. Trademark Notice

This independent, open-source Node.js regression testing project is not affiliated with, sponsored by, or endorsed by Apple Inc. Apple’s [trademark list](https://www.apple.com/legal/intellectual-property/trademark/appletmlist.html) lists ReplayKit with a registered-symbol designation as a software framework, and its [trademark guidelines](https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html) restrict product-name use (checked 2026-10-22). Specific registration numbers, classes, territorial rights, and legal applicability to this project have not been verified. This non-affiliation notice does not establish permission or legal clearance. Public distribution remains on hold pending a human naming/legal decision; no replacement name or migration has been adopted. See the [naming review](docs/release/V0_1_0_ACCEPTANCE.md#6-apple-replaykit-naming-review--unresolved-release-decision).

