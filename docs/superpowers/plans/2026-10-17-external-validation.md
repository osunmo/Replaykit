# Phase 1 External Validation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to execute this approved work inline. Do not start Phase 2.

**Goal:** Repair Gate 0 and demonstrate the runner/judge against real official benchmark tests and patches.

**Architecture:** Preserve the original R1 evaluator. Add an explicitly selected external-suite evidence contract, with trusted supervisor collection and an independent evaluator. Fresh, resource-limited offline containers execute every real patch variant.

**Tech Stack:** Existing TypeScript, Zod, Vitest, pnpm and Docker.

**Spec:** docs/specs/external-evidence-contract.md and the user's ordered Phase 1 instructions.

## Global Constraints

No simulation or outcome selection by labels. No candidate execution on the host. No judge-gate weakening. No credential literals; token scan before every commit. Phase 1 only. Raw command output and exit codes in the report. Stop and report real blockers.

## Review Focus

- Null or missing R1 observations must not activate another evidence contract.
- Token scanning must reject uppercase/binary/untracked/ignored artifact leaks and Git failures.
- Official tests that are skipped, renamed or absent must not become passing suite evidence.
- Missing images, patch failures, timeouts and incomplete cleanup must remain ERROR.
- Failure identity and file hashes must come from the executed container, never a variant label.

### Task 1: Gate 0 repairs

Files: packages/judge/src/evaluate.ts; packages/contracts/src/index.ts; packages/judge/src/judge.test.ts; packages/telemetry/src/token-scan.ts and token-scan.test.ts; scripts/token-scan.ts; CI.

- [ ] Add permanent null-observation/invariant-field R1 regression cases and real temporary-repository scanner probes. Run them and record the expected failures.
- [ ] Restore the exact committed R1 evaluator and schema; remove the unapproved fallback tests. Implement fail-closed Git file enumeration plus artifact scanning; report file/line only.
- [ ] Run focused tests, all unit/type/lint/format checks, cleanup and variant greps, baseline judge diff, and a real R1 smoke. Rebuild sandbox images only if source provenance requires it.
- [ ] Run the token scan, then make a small Gate 0 commit. Do not push without a remote.

### Task 2: External evidence contract

Files: packages/contracts/src/external.ts; packages/judge/src/external.ts and external.test.ts; benchmark manifest schema.

- [ ] Write rejecting tests for every matrix gate, mixed contracts, wrong R1 routing, missing official inventory/report and infrastructure errors; observe failures.
- [ ] Implement separate typed evaluator and manifest binding. Keep the R1 evaluator body unchanged.
- [ ] Run focused and full checks, token scan and a small contract commit.

### Task 3: Official benchmark selection and real Stage A

Files: packages/benchmark-runner/; scripts/external-benchmark.ts; benchmark/external/; docs/EXTERNAL_VALIDATION.md.

- [ ] Reverify primary benchmark/image/license sources, select a pullable amd64 JS/TS instance with a short official test, and record pinned provenance before implementing its reporter adapter.
- [ ] Add tests for reporter inventory/identity parsing and unsafe patches; observe failures, then implement the trusted supervisor, real patch application and artifact hashing.
- [ ] Run the official test against 10 buggy, 3 reference, 3 independent alternate and 1 honest decoy fresh offline containers. Record actual Docker argv and observed timing.
- [ ] Run reversed-gold, missing-image, assert-true and unconditional-throw sensitivities. Missing honest decoy means PARTIAL, never a skipped gate.

### Task 4: Exploratory study and Phase 1 report

- [ ] Expand to three instances across two repositories where the real environment permits it; disclose every attempt and raw status counts. Stage B is optional and is not implemented without a configured provider decision/credentials.
- [ ] Update progress/decisions/limitations and export machine-readable provenance with raw logs. Run the final R1 smoke and quality gates after source changes, token scan before commits, and review the final diff.
- [ ] Stop with an end-of-phase report; incomplete or externally blocked criteria remain explicit. Do not start the next phase.
