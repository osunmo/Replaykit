# ReplayKit — Installation & Quick Start Guide

This guide describes how to install and run ReplayKit from a fresh clone across Linux, macOS, and Windows.

---

## 1. Prerequisites

| Component | Minimum Version | Verified Version | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | `>=22.13.0` | `v22.23.3` | Must be on the Node 22 LTS branch |
| **pnpm** | `10.20.0` | `10.20.0` | Recommended package manager |
| **Docker** | Engine `20.10+` | `29.8.1` | Must support Linux containers |
| **Ollama** | `0.3.0+` | `0.3.0+` | Local LLM host for test synthesis |

---

## 2. Installation from Clean Checkout

```bash
# 1. Clone repository
git clone https://github.com/replaykit/replaykit.git
cd replaykit

# 2. Install dependencies with strict frozen lockfile
pnpm install --frozen-lockfile

# 3. Build build-artifacts and verify TypeScript types
pnpm build
pnpm typecheck
```

---

## 3. Ollama Setup (Local AI Synthesis)

ReplayKit uses local AI models to synthesize regression tests from production incident telemetry without cloud egress or token leakage.

1. **Install Ollama**: Follow instructions at [ollama.com](https://ollama.com).
2. **Pull the recommended synthesis model**:
   ```bash
   ollama pull qwen2.5-coder:3b
   ```
3. **Ensure Ollama service is listening**:
   Default endpoint is `http://127.0.0.1:11434`.

---

## 4. Environment Verification (`replaykit doctor`)

Run the automated diagnostics to verify Docker daemon and Ollama readiness:

```bash
pnpm replaykit doctor
```

Expected output:
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

If Ollama is not running, the CLI reports `DEGRADED_NO_OLLAMA` status. You will still be able to execute `run` and `verify` commands with existing or manual tests.

---

## 5. Five-Minute Quick-Start Walkthrough

ReplayKit includes self-contained reproducible fixtures for instant validation without accessing private internal benchmark paths.

### Example A: Fastify URL-Parsing Incident (#4807)

```bash
# 1. Generate a regression test from sanitized production incident context
pnpm replaykit generate --config fixtures/fastify-issue-4807/config.json --output repro.test.js

# 2. Run the generated test against the buggy revision (confirms reproduction)
pnpm replaykit run --config fixtures/fastify-issue-4807/config.json --test repro.test.js --role buggy

# 3. Perform differential 4-target verification (buggy, reference fix, alternate fix, decoy)
pnpm replaykit verify --config fixtures/fastify-issue-4807/config.json --test repro.test.js

# 4. Clean up any test resources
pnpm replaykit clean
```

### Example B: Qs Null-Prototype Dictionary Incident (#33)

```bash
# 1. Generate test for qs
pnpm replaykit generate --config fixtures/qs-issue-33/config.json --output qs.test.js

# 2. Run against buggy baseline
pnpm replaykit run --config fixtures/qs-issue-33/config.json --test qs.test.js --role buggy

# 3. Verify against reference and alternate repairs while rejecting the decoy
pnpm replaykit verify --config fixtures/qs-issue-33/config.json --test qs.test.js
```
