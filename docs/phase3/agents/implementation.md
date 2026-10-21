# Phase 3 Implementation Agent Report — Architecture & Components

**Agent Role:** Implementation Agent (Agent B)  
**Date:** 2026-10-20  
**Target:** ReplayKit Phase 3 Blind AI Regression-Test Generation Architecture  
**Status:** COMPLETE & FROZEN  

---

## 1. Executive Summary & Objective

In Phase 3, ReplayKit transitions from validating existing official test benchmark executions (Gates B and C1–C4) to creating genuinely novel, executable regression tests from production incident telemetry and behavioral contracts.

The implementation agent designed and built modular, strongly typed components supporting the 6-stage lifecycle:
1. **Incident Context Schema**: Strongly typed schemas in `packages/contracts/src/incident-context.ts` implementing `docs/phase2/INCIDENT_CONTEXT_CONTRACT.md`.
2. **Sanitizer & Blinding Auditor**: `packages/runtime/src/sanitizer.ts` for clean workspace construction and independent anti-leakage verification.
3. **AI Test Generator**: `packages/runtime/src/ai-generator.ts` with real local Ollama API binding (`qwen2.5-coder:3b`), AST validation, and Levenshtein lexical independence calculation.
4. **Blind Four-Target Evaluator**: `packages/runtime/src/blind-evaluator.ts` executing candidate tests against Buggy, Reference Fix, Alternate Fix, and Decoy Fix under strict container isolation.
5. **Orchestrator Script**: `scripts/phase3/run-blind-synthesis.ts` automating the end-to-end execution, controls, and cryptographic artifact registration.

---

## 2. Component Inventory & Architectural Roles

| Component | File Path | Architectural Role | Protected Invariant Status |
| --------- | --------- | ------------------ | -------------------------- |
| **Incident Contracts** | `packages/contracts/src/incident-context.ts` | Zod schemas for incident context, error telemetry, oracle provenance, sufficiency, and synthesis results. | Protected file `packages/contracts/src/index.ts` left untouched. |
| **Workspace Sanitizer** | `packages/runtime/src/sanitizer.ts` | Extracts buggy source, removes historical test #40 from `test/parse.js`, ensures 0 leaked tokens, produces workspace manifest. | Reads from pinned `source-buggy`, writes to isolated workspace. |
| **AI Generator** | `packages/runtime/src/ai-generator.ts` | Epistemic sufficiency check, prompt construction, Ollama model invocation, code extraction, AST safety validation. | Does not hardcode tests or fabricate assertions on insufficient oracle. |
| **Blind Evaluator** | `packages/runtime/src/blind-evaluator.ts` | Multi-target dispatcher executing generated test in Docker containers against 4 targets; normalizes TAP output and evaluates semantic rejection. | Reuses `external-supervisor.ts`; enforces `--network none` and limits. |
| **Unit Test Suite** | `packages/runtime/src/blind-synthesis.test.ts` | 9 unit tests verifying scrubbing, AST safety, Levenshtein distance, epistemic gating, and TAP parsing. | 9/9 passing under Vitest. |
| **Master Orchestrator** | `scripts/phase3/run-blind-synthesis.ts` | Orchestrates Stage S1 to S5, records manifests, hashes, and verdict. | Automated, deterministic local execution. |

---

## 3. Epistemic Separation: Facts vs. Behavioral Specification

The implementation enforces a strict division between:
1. **Observed Incident Telemetry (Facts)**:
   - Exception type: `TypeError`
   - Exception message: `source.hasOwnProperty is not a function`
   - Application frame: `/case/lib/utils.js:47:20`
   - Triggering input: Object containing null-prototype dictionary (`Object.create(null)`).
2. **Expected Behavior (Specification)**:
   - Upstream API Specification: `Qs.parse(object)` recursively clones and parses nested object keys into a merged query object preserving all key-value entries regardless of prototype inheritance chain.
   - Provenance: `upstream_issue_spec`.

When the behavioral specification is absent (as tested in the Insufficient-Oracle Control Trial), the generator abstains from guessing and immediately yields `status: "INSUFFICIENT_ORACLE"`.

---

## 4. Protected R1 Immutability

The implementation agent strictly preserved all Phase 1 and Phase 2 invariants:
- `packages/judge/src/evaluate.ts`: 0 bytes changed (`git diff --exit-code`).
- `packages/contracts/src/index.ts`: 0 bytes changed (`git diff --exit-code`).
- Gate B runs (`work/phase2/gate-b-runs/`): 100% untouched.
- Gate C runs (`work/phase2/gate-c-runs/`): 100% untouched.
