# ReplayKit

ReplayKit turns incident evidence into an executable regression test and checks whether that test reproduces the original failure. This repository contains the **first R1 payment/idempotency vertical slice**. The full product described in AGENTS.md is still in development.

The checkout service really writes charges to PostgreSQL. Sending the same payment twice makes the buggy implementation generate two provider keys and two charges. Two independent fixes keep one charge. A decoy suppresses the error response while still charging twice; the generated test must catch it.

## Run the end-to-end smoke

Prerequisites: Node 22.13+ in the Node 22 line (tested locally on 22.23.3), pnpm 10.20.0, and a running Docker engine with Linux containers. Docker Desktop works on Windows. Run commands from this directory. No model API key or real payment account is needed.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm sandbox:build
pnpm benchmark smoke
```

The image build needs internet access to download pinned dependency resolutions and base images. Candidate execution and planning run offline. The smoke command captures a real synthetic incident, generates a short TypeScript regression test, runs ten fresh buggy environments, three reference fixes, three alternate fixes and one decoy, then checks wrong-frame rejection and missing-body abstention. It prints the measured verdict and relative report path. A missing Docker engine or broken execution produces an error, never a verified reproduction.

The matrix uses a bounded worker pool with concurrency **3** by default. Configure it with `pnpm benchmark smoke --concurrency 2` (allowed range 1–10). `incident run` and `replay verify` accept the same flag. Each execution has its own PostgreSQL container, empty tables, app container and internal network, with unchanged per-container limits. Candidate bytes and hashes stay identical across all seventeen executions. The pool stops dispatching after infrastructure errors and drains active work before returning.

For measured wall time, stage breakdowns and sampled Docker resource use, run `pnpm benchmark:measure --label local-concurrency3 --concurrency 3`. Raw `measurement.json`, per-execution `profile.json`, `pipeline.json` and `smoke-profile.json` stay under ignored `runs/`. Run comparisons one at a time. Stage sums overlap under concurrency; use the measured wall time for elapsed latency. See [the PostgreSQL and scaling experiment](docs/POSTGRES_PERFORMANCE.md) and [earlier worker-pool findings](docs/PERFORMANCE.md).

Use `--sampling off` for the same full measured smoke without periodic Docker resource commands, for example `pnpm benchmark:measure --label sequential-unsampled --concurrency 1 --sampling off`. The timer and judge remain unchanged. The one-time Docker capacity query occurs before timing. Unsampled artifacts explicitly record sampling as off, with zero samples and unavailable resource peaks; `measurement.json` is written when the run finishes.

The default `sandbox:build` retains fresh PostgreSQL initialization. To try the measured template experiment, run `pnpm sandbox:build --postgres-mode template-copy`. It initializes an empty template using the same compiled schema as the app. Each execution copies it into its own fresh tmpfs and installs a new database password before opening TCP. No running database or mutable data directory is shared. PostgreSQL `fsync` remains enabled. Validate clone isolation, authentication and bootstrap rejection with `pnpm exec tsx scripts/postgres-snapshot-check.ts` after that build. Restore the default with `pnpm sandbox:build --postgres-mode initdb`. The template reduced startup cost but did not establish an end-to-end speedup at default concurrency 3, so it remains opt-in.

Artifacts appear under `runs/<run-id>/`: `incident.json`, `plan.json`, `repro.test.ts`, `matrix.json`, `result.json`, `report.md`, `executions.csv`, and per-execution application/database/isolation evidence. `environment.json` records immutable image IDs and source/dependency hashes. The Docker build manifest lives at `work/sandbox/manifest.json`; rebuild after changing source.

## Capture, replay and inspect

```sh
pnpm replaykit incident capture --output benchmark/incidents/R1/visible/incident.json
pnpm replaykit incident run --fixture benchmark/incidents/R1/visible/incident.json
pnpm replaykit incident run --fixture benchmark/incidents/R1/visible/incident.json --tier minimal
pnpm replaykit replay verify --run <run-id>
pnpm benchmark report --input runs/<run-id>
```

Replace `<run-id>` with an ID printed by a previous run. `replay verify` reruns the saved test and refuses altered provenance. Minimal telemetry deliberately withholds the payment body, spans and breadcrumbs; the planner reports `MISSING_REQUEST_BODY` rather than inventing values. Full and partial inputs preserve explicit missing-field information. Exit code 0 means success/verified, 2 means a non-verified result, and 1 means an infrastructure or input error.

## Local checkout development and tests

```sh
pnpm db:up
pnpm --filter checkout-api dev
```

The dev API listens on port 4318; PostgreSQL is bound only to `127.0.0.1:55432`. `db:up` generates a random password and volume suffix in the ignored root `.env`. The development and integration-test commands load this file; `.env.example` contains documentation placeholders only and should not be copied over it. Existing local configuration and database volumes are preserved. The raw server requires an explicit `DATABASE_URL`. Stop the dev API with Ctrl+C.

In another terminal:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:sdk
pnpm test:integration
pnpm test:security
pnpm format:check
pnpm db:down
```

Integration tests reset the dedicated local replaykit test tables and require `pnpm db:up`. Sandbox smoke uses separate temporary PostgreSQL instances and does not touch the dev database. Run integration tests only against synthetic local data. `db:down` stops the dev containers and preserves the named volume. Sandbox runs remove only their own named containers and network on completion or handled error. Docker Desktop itself remains running.

`test:security` runs live disposable-container probes for private-file/host access, read-only filesystem enforcement, network egress, arbitrary broker commands, infinite loops and memory exhaustion. It never executes those probe strings on the developer host.

Captured fixtures identify an exact application image and are local generated files excluded from Git. Capture one before `incident run`, and recapture it after rebuilding images; ReplayKit rejects an unsupported revision rather than testing a different application snapshot. `benchmark smoke` captures its own fresh incident automatically.

## Trust boundaries and verdicts

- The planner runs in a restricted container containing visible code and normalized evidence, with no host mounts, private fixes, judge data, Git history or network.
- Candidate tests run as an unprivileged user with no network, a read-only filesystem, bounded temporary storage and process/memory/time limits. Only the generated test directory is mounted read-only.
- A bounded stdin/stdout broker permits the captured payment request and its charge-count query. It exposes no arbitrary URLs, shell commands, file paths, headers or database credentials.
- The trusted supervisor gathers application failure frames and PostgreSQL state separately from candidate stdout. Candidate code never runs on the developer host.
- `VERIFIED` requires the actual failure identity, 3/3 successes for each valid fix, a still-failing decoy, 10/10 fresh buggy failures, distinct execution IDs, consistent test hash and satisfied isolation/review gates. `PARTIAL` and `NOT_REPRODUCED` include failed checks; infrastructure faults are `ERROR`.

The cooperative scheduler has finite named checkpoints, cancellation and deadlock diagnostics. It is currently tested independently; R1 uses sequential retries, and real scheduled database-race scenarios remain future work.

## Shared Runtime, Job Management, and Sentry Import

ReplayKit provides an asynchronous runtime (`packages/runtime`) and CLI commands for managing reproduction jobs without blocking:

```sh
# Start an asynchronous reproduction job
pnpm replaykit job start --fixture benchmark/incidents/R1/visible/incident.json

# Check list and status of reproduction jobs
pnpm replaykit job list
pnpm replaykit job status --run <run-id>

# View the generated regression test and independent verification report
pnpm replaykit job open-test --run <run-id>
pnpm replaykit job report --run <run-id>

# Cancel an active job safely
pnpm replaykit job cancel --run <run-id>

# Import an incident from Sentry via SSRF-hardened transport
pnpm replaykit incident import --event-id <sentry-event-id> --token <sentry-auth-token>
```

## Model Context Protocol (MCP) Server

ReplayKit includes a standard MCP server (`packages/mcp`) implementing the Model Context Protocol over stdio for Cursor, Claude Desktop, and other MCP clients.

### Available MCP Tools:

- `replaykit_reproduce`: Starts an asynchronous reproduction job from an incident fixture path. Returns the assigned run ID promptly without blocking.
- `replaykit_status`: Retrieves the current phase, completed execution count, and verdict for a run ID.
- `replaykit_report`: Retrieves the complete Markdown verification report for a run ID.
- `replaykit_open_test`: Reads the generated `repro.test.ts` from the managed run directory.
- `replaykit_cancel`: Cancels an active reproduction run.
- `replaykit_import_sentry_issue`: Fetches and normalizes an incident from Sentry.

### Cursor Configuration (`.cursor/mcp.json`)

You can configure the MCP server in Cursor automatically via the ReplayKit extension command (`replaykit.configureMcp`) or manually by adding to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "replaykit": {
      "command": "node",
      "args": ["--import", "tsx", "packages/mcp/src/index.ts"]
    }
  }
}
```

## VS Code & Cursor Extension

The ReplayKit extension (`apps/vscode-extension`) provides an Activity Bar panel in VS Code or Cursor:

- **Runs View**: Lists recent runs, tracks live execution progress (honest preliminary reporting; never reports premature `VERIFIED`), and displays failing gates.
- **Actions**: Start reproduction, open generated tests, open verification reports, cancel running jobs, configure MCP, and navigate directly to offending source code (`payments.ts`).
- **Secure Credentials**: Sentry API tokens are stored securely in VS Code `SecretStorage` and never leak into workspace files or reports.

## Current scope

Implemented: PostgreSQL payment endpoint, four R1 source variants, real OTel spans and Sentry-shaped capture, typed/redacted incident ingestion, evidence-based deterministic planner, isolated execution, strict judge, cryptographic execution provenance hashing, asynchronous shared runtime with crash safety and exclusive leases, MCP stdio server, VS Code / Cursor extension, secure Sentry importer, CLI and JSON/CSV/Markdown artifacts.

Not implemented: full order/inventory/webhook API, the remaining incident corpus, the 12/8 development/held-out split, three-trial model baselines, LLM provider adapter, arbitrary candidate patch verification, release publishing. Smoke counts are not a 20-case benchmark score. GitHub Actions is supplied but remote CI has not run in this local workspace.

See [progress](docs/PROGRESS.md), [architecture](docs/ARCHITECTURE.md), [threat model](docs/THREAT_MODEL.md), [evaluation](docs/EVALUATION.md), and [limitations](docs/LIMITATIONS.md).

Raw runs, Docker inspections, logs, generated incident fixtures and local `.env` credentials are excluded from Git and source archives. To publish a reviewed portable measurement projection, run `node --import tsx scripts/publish-r1-measurements.ts <run-id> ...`; only allowlisted fields reach `docs/measurements/r1-performance.json`. Previous local commits retain the first delivery's raw archived reports; history has not been rewritten or published to a remote.

## Layout

```text
apps/checkout-api/       PostgreSQL service and real telemetry
apps/vscode-extension/   VS Code & Cursor Activity Bar extension
packages/contracts/      Zod boundary schemas
packages/telemetry/      Redaction and Sentry-shaped normalization
packages/sentry/         SSRF-safe Sentry client, DNS pinning, and normalizer
packages/replay-engine/  Cooperative checkpoint scheduler
packages/planner/        Visible-evidence rule planner
packages/judge/          Sandbox, broker validation, and strict gates
packages/runtime/        Asynchronous job lifecycle, storage, and lease
packages/mcp/            Model Context Protocol (MCP) stdio server
packages/cli/            Capture, replay, smoke, jobs, and Sentry imports
benchmark/private/R1/    Judge-only source variants
docker/                  Candidate fixture SDK
scripts/                 Allowlisted runtime image builder and SDK tests
```

MIT licensed. All included incident data is synthetic.
