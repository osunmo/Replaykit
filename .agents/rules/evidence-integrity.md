---
description: Non-negotiable evidence integrity rules for ReplayKit benchmark truth, cryptographic digests, and immutable audit logs.
globs: ["work/**", "benchmark/**", "docs/**"]
---

# ReplayKit Evidence Integrity

These rules safeguard the scientific reproducibility and integrity of ReplayKit benchmark results and evaluation evidence.

## 1. Historical Benchmark Evidence Immutability

Previous experimental evidence and benchmarks are preserved historical records:
- `work/phase2/` (Gate B, Gate C1–C4 runs and summaries)
- `work/phase3/` (First blind AI synthesis runs and audit artifacts)
- `work/phase4/` (Fastify generalization and hardened runs)

**Rule**: These directories must remain 100% byte-for-byte immutable. Never overwrite, delete, rename, or re-run historical benchmarks into these directories. All new runs must write to fresh output paths (e.g., `work/v0.1.0/`, `work/demo/`, `work/quality-runs/`, or `work/perf/`).

## 2. Cryptographic Digest Auditing

- **Candidate Test Hashing**: Every synthesized or candidate test file must be hashed (SHA-256) upon creation. The evaluator must verify that the test source executed against the buggy base is byte-identical to the test executed against reference, alternate, and decoy targets.
- **Candidate Patch Verification**: Every patch applied to reference, alternate, or decoy revisions must match its predeclared SHA-256 digest in `config.patchHashes`. Tampered patches must be immediately rejected.
- **Machine-Readable Verdict Artifacts**: Every verification run must emit an `evaluation-verdict.json` containing the verdict (`VERIFIED`, `REJECTED`, `NOT_REPRODUCED`, or `ERROR`), candidate hash, individual target outcomes, timestamps, duration, and error details.

## 3. Epistemic Honesty in Test Provenance

- **Clear Distinction of Origin**: An AI-generated test must never be conflated with a human-written or hardened fixture. If a test was synthesized by a model, its prompt, model name, generation duration, token usage, and raw output must be recorded.
- **No Manual Fixture Substitution**: Never substitute a manually hardened test (e.g., `hardened-repro.test.js`) in place of an AI-generated test while claiming AI generation success.
- **Oracle Sufficiency**: If the incident context lacks a definitive expected-behavior contract, the generator or runner must report `INSUFFICIENT_ORACLE` rather than hallucinating assertions.
