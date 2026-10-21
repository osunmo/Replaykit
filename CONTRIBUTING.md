# Contributing to ReplayKit

Thank you for your interest in contributing to ReplayKit! This document provides guidelines for contributing code, tests, documentation, and benchmark adaptations.

---

## Code of Conduct

ReplayKit is an open and welcoming project. All participants are expected to adhere to standard professional etiquette, ensuring a harassment-free environment for everyone.

---

## Development Setup

### System Prerequisites
- **Node.js**: `v22.13.0` or higher (verified on Node `v22.23.3`)
- **pnpm**: `v10.20.0`
- **Docker**: Engine `20.10+` with Linux container support (Docker Desktop on Windows/macOS or Docker Engine on Linux)
- **Ollama**: (Optional for test execution, required for local AI generation) running at `http://127.0.0.1:11434` with model `qwen2.5-coder:3b`

### Initial Bootstrap

```bash
# Clone the repository
git clone https://github.com/replaykit/replaykit.git
cd replaykit

# Install dependencies (frozen lockfile)
pnpm install --frozen-lockfile

# Typecheck and test
pnpm typecheck
pnpm test
```

---

## Verifying System Health

Run the built-in diagnostic tool to verify environment readiness:

```bash
pnpm replaykit doctor
```

Output confirms Docker connectivity and local Ollama model availability:
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

## Architecture & Project Structure

- `packages/cli`: Developer-facing command line interface (`clean`, `doctor`, `generate`, `run`, `verify`).
- `packages/contracts`: Core schemas and formal TypeScript interfaces (Zod-validated).
- `packages/runtime`: Differential execution engine, Docker supervisor, sandboxing, AI synthesizer.
- `packages/judge`: Ground-truth evaluator and benchmark matrix verifier.
- `fixtures`: Self-contained demonstration fixtures for reproducible evaluation (`qs-issue-33`, `fastify-issue-4807`).

---

## Protected Files & Trust Boundaries

The following files represent the ground-truth specification boundary and are protected:
- `packages/judge/src/evaluate.ts`
- `packages/contracts/src/index.ts`

Any modification to these files without explicit coordinator authorization will invalidate the evaluation pipeline.

---

## Pull Request Guidelines

1. **Focused Diffs**: Keep PRs focused on single tasks or fixes. Avoid unrelated formatting changes.
2. **Typecheck & Lints**:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm format:check
   ```
3. **Secret Token Scan**:
   Ensure no private credentials or unauthorized API keys are introduced:
   ```bash
   pnpm token:scan
   ```
4. **Unit & Integration Tests**:
   ```bash
   pnpm test
   ```
5. **No Regressions on Protected Files**:
   ```bash
   git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts
   ```
