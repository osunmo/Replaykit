# Progress

## 2026-10-16 — first working R1 slice

The initial workspace was empty. This delivery implements the R1 path through foundation, checkout payments, replay isolation, strict judging and CLI. It does **not** claim completion of every Phase 0–3 gate: full checkout orders/inventory/webhooks and real scheduler-controlled DB races are still missing, and remote CI has not run.

### Working deliverables

- `apps/checkout-api`: real PostgreSQL provider ledger, payment idempotency, payload conflict checks, explicit OpenTelemetry spans, Sentry-shaped capture derived from actual application error stacks.
- `benchmark/private/R1`: buggy, reference, distinct alternate and symptom-hiding decoy policy artifacts.
- `packages/contracts`, `packages/telemetry`: strict typed boundaries, normalized input redaction and explicit missing telemetry.
- `packages/planner`: deterministic evidence-driven rule planner, executed in a separate network-disabled image without private fixes or host mounts.
- `packages/replay-engine`: tested cooperative finite scheduler, cancellation and timeout diagnostics; not yet wired into a database race scenario.
- `packages/judge`: network-disabled candidate containers, bounded request broker, independent application/DB observations, fresh-state checks and full strict matrix.
- `packages/cli`: capture, fixture run, saved-test verification, smoke, JSON/CSV/Markdown artifacts.
- `scripts/build-sandbox.ts`, `docker/replay-fixture.mjs`, Compose, CI definition, README, MIT license and security/methodology docs.

### Actual verification

| Command                                                                                             | Observed result                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                    | PASS, lockfile current across 8 workspace projects                                                                                                                          |
| `pnpm typecheck`                                                                                    | PASS                                                                                                                                                                        |
| `pnpm lint`                                                                                         | PASS                                                                                                                                                                        |
| `pnpm test`                                                                                         | PASS, 70 tests in 12 files                                                                                                                                                  |
| `pnpm test:sdk`                                                                                     | PASS, 6 tests                                                                                                                                                               |
| `pnpm test:integration`                                                                             | PASS, 12 real PostgreSQL integration tests                                                                                                                                  |
| `pnpm build`                                                                                        | PASS                                                                                                                                                                        |
| `pnpm sandbox:build`                                                                                | PASS, real app/candidate/planner images built and inspected                                                                                                                 |
| `pnpm benchmark smoke`                                                                              | PASS, run `40a29c65-b65e-4853-9911-665e984f7893`, VERIFIED; 10/10 fresh buggy failures, both valid fixes pass, decoy fails, wrong frame rejected, missing request abstained |
| `pnpm test:security`                                                                                | PASS, 4 live probe groups; run `c8508008-b6bd-47bd-8174-4daef37e2333`                                                                                                       |
| `pnpm replaykit replay verify --run 40a29c65-b65e-4853-9911-665e984f7893`                           | PASS, saved candidate independently reran the full matrix; new run `3aeb3f43-f65d-4d6c-9cbe-8a456083ff01`, VERIFIED                                                         |
| `pnpm replaykit incident capture --output benchmark/incidents/R1/visible/incident.json`             | PASS, new real synthetic fixture captured in run `c6f340ad-e637-432b-bd0c-4782186e3279`                                                                                     |
| `pnpm replaykit incident run --fixture benchmark/incidents/R1/visible/incident.json --tier minimal` | Expected exit 2, NOT_REPRODUCED with MISSING_REQUEST_BODY; run `8ad0d5ae-40df-4205-9829-a5d1f26c8239`                                                                       |
| `pnpm benchmark report --input runs/40a29c65-b65e-4853-9911-665e984f7893`                           | PASS, reads the measured report                                                                                                                                             |
| `pnpm format:check`                                                                                 | PASS                                                                                                                                                                        |
| `pnpm db:down`                                                                                      | PASS, development container/network stopped; synthetic named volume retained                                                                                                |

The smoke report and raw evidence are copied under `benchmark/results/r1-smoke-2026-10-16/`. Security evidence is under `benchmark/results/security-2026-10-16/`, and the second full verification is under `benchmark/results/r1-rerun-2026-10-16/`. Minimal-input abstention evidence is under `benchmark/results/r1-minimal-2026-10-16/`. These are measured single-scenario records, not full-benchmark performance claims. No containers or networks with the `replaykit.run` ownership label remained after the runs completed.

### Review and corrections

Independent review found five substantive defects. Seven regression tests first reproduced them, then passed after fixes: abnormal exits/OOM must not verify; normalized inputs must be redacted; a proposal cannot substitute or invent the request; incident revision/service must match the executed snapshot; partially created resources must be reconciled by ownership label. Saved-test reruns additionally compare the prior candidate hash.

An initial security probe run failed because the probe generator accidentally inserted a literal newline inside JavaScript quotes. The malformed candidate did not exercise the broker. Corrected the test source and required the exact `CANDIDATE_PROTOCOL_REJECTED` reason; the complete four-probe rerun passed. The earlier failed run remains under local `runs/b2c6ae0e-b49e-4665-a517-398f287623ba` for diagnostics and is not presented as a successful security result.

Packaging measured evidence exposed a tooling issue: the TypeScript and lint globs also included archived container-only candidate sources. Excluded `benchmark/results` from host build/type/lint checks, as already done for local `runs`; the executable repository sources remain checked. Archived candidates retain their exact measured hashes.

### Environment and limits

Node 22.23.3, pnpm 10.20.0, TypeScript 5.9.3, PostgreSQL 17.11, Docker Engine 29.8.1, Docker Desktop 4.93.0, Compose 5.5.1 on Windows/WSL2. Docker Desktop was initially stopped and was started. The Codex Windows sandbox denied Docker pipe and some package/Git reads; the approved local test commands ran with sandbox escalation. No software install, global settings change, production data or external payment service was required.

The complete 20-case benchmark, fixed 12/8 split, three-trial model comparisons, LLM adapter, Cursor/MCP integration, arbitrary patch verification and dashboard remain incomplete. No remote repository, CI run or release publication was created.

### Next concrete task

Implement D2 inventory lost update with real PostgreSQL operations controlled by the existing cooperative scheduler, independently validate its buggy/reference/alternate/decoy matrix, then add N5 as an executed different-code-path negative case. Preserve the supplied milestone order and expand the corpus only after those cases pass the strict judge.
