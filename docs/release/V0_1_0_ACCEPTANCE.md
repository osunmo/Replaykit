# ReplayKit v0.1.0 Release Acceptance Report

**Release Target:** `replaykit` v0.1.0  
**Date:** 2026-10-21  
**Status:** **ACCEPTED — READY FOR STAGING**  
**Classification:** Core Developer CLI & Autonomous Verification Engine  

---

## 1. Executive Summary

ReplayKit v0.1.0 represents the first production-ready release of the deterministic bug reproduction and verification engine. v0.1.0 delivers an autonomous, hermetically sandboxed developer CLI that takes an issue description or incident context, generates novel regression tests via local LLM synthesis (`qwen2.5-coder:3b`), and evaluates candidate tests against a 4-target matrix (Buggy base, Reference fix, Alternate fix, and Semantic Decoy fix).

### Key Release Highlights
1. **Developer CLI Suite**: Five core developer commands (`generate`, `run`, `verify`, `doctor`, `clean`) alongside benchmark operations.
2. **Empirical Multi-Case Validation**: End-to-end autonomous synthesis and 4-target verification successfully validated across distinct paradigms:
   - **`qs` Issue #33**: Deep object prototype injection (`TypeError: source.hasOwnProperty is not a function`).
   - **`fastify` Issue #4807**: Async HTTP server route content-type matching (`TypeError: Cannot read properties of undefined (reading 'error')`).
3. **Rigorous Invariant Verification**: Full evaluator integration enforcing 10 core invariants, including failure identity matching, candidate SHA256 preservation, decoy rejection via `AssertionError`, offline sandbox isolation (`--network none`, rootless, `cap-drop all`), and strict container lifecycle cleanup.
4. **Zero-Modification Protected Boundary**: Byte-for-byte immutability preserved for protected judge contracts (`packages/judge/src/evaluate.ts` and `packages/contracts/src/index.ts`).
5. **No Lingering Resources**: 100% Docker resource cleanup across all verification runs.

---

## 2. Acceptance Matrix (Tasks 1 – 7)

| Task | Component / Milestone | Target / Scope | Acceptance Criteria | Status | Evidence Reference |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Task 1** | Developer CLI Smoke Test | `replaykit --help`, `doctor`, `clean` | Exit 0, correct synopsis, Docker + Ollama detected healthy, clean scan reports 0 orphans | **PASS** | Section 3.1 |
| **Task 2** | `qs` #33 Demonstration | Fixture `fixtures/qs-issue-33/` | Autonomous generation, buggy reproduction (exit 2), 4-target discrimination (`VERIFIED`), baseline pass | **PASS** | Run `verify-1792564714131-ee3eeb7d` |
| **Task 3** | Fastify #4807 Demonstration | Fixture `fixtures/fastify-issue-4807/` | Async HTTP test generation, buggy repro (exit 2), 4-target discrimination (`VERIFIED`), decoy caught | **PASS** | Run `verify-1792565798158-00bd4c7b` |
| **Task 4** | Rigorous Evaluator Integration | `developer-command.ts` | 10-invariant verification: failure identity, candidate hash, decoy rejection, non-regression, offline sandbox | **PASS** | Section 4 & Vitest unit tests |
| **Task 5** | Release Documentation Suite | `docs/*`, `README.md`, `CONTRIBUTING.md` | Full architecture, CLI reference, installation, security threat model, supported environments | **PASS** | Section 5 |
| **Task 6** | Apple Trademark Collision Analysis | Apple ReplayKit vs CLI tool | In-depth trademark legal analysis, risk mitigation strategy, name change roadmap for v0.2.0 | **PASS** | Section 6 |
| **Task 7** | Release QA & Invariant Audit | TypeScript, Vitest, Git Diff | Zero type errors, 100% test pass, 0 diff on `evaluate.ts` and `contracts/index.ts` | **PASS** | Section 7 |

---

## 3. End-to-End Verification Records

### 3.1 Task 1: CLI Smoke Test

- **`replaykit --help`**:
  - Exits with code `0`.
  - Outputs standard usage synopsis including both Developer Commands (`generate`, `run`, `verify`, `doctor`, `clean`) and Benchmark Suite Commands (`plan`, `execute`, `evaluate`, `report`, `inspect`, `replay`).
- **`replaykit doctor`**:
  - Exits with code `0`.
  - Docker Connectivity: Connected (Docker version `29.8.1`, API `1.53`).
  - Container Image: Verified local availability of pinned image `node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392`.
  - Ollama LLM Engine: Connected at `http://127.0.0.1:11434`, model `qwen2.5-coder:3b` available.
  - Overall Doctor Verdict: `HEALTHY`.
- **`replaykit clean --dry-run`**:
  - Exits with code `0`.
  - Scanned Docker engine for replaykit containers, volumes, and temporary networks.
  - Active orphans found: `0`.

---

### 3.2 Task 2: `qs` Issue #33 End-to-End Demonstration

`qs` #33 represents a prototype-pollution / clean-object edge case where `Object.create(null)` objects passed to `qs.parse` cause `source.hasOwnProperty is not a function`.

- **Workspace Blinding**: Upstream regression test 40 was removed from `test/parse.js`. The fixture workspace contains zero references to the upstream fix commit (`6a97ad1d`), patch hunks, or test 40.
- **Novel Test Generation**:
  ```bash
  pnpm replaykit generate --config fixtures/qs-issue-33/config.json --output work/demo/qs-generated.test.js
  ```
  - Duration: 103.5 seconds.
  - Tokens Generated: 689 tokens (544 prompt, 145 completion).
  - Candidate Digest: `0387bf4ea32a916627cf53b4048e76527c8510e600863f1be56250c54ca53891`.
  - AST Validation: Passed (no swallowed errors, valid assertions).
- **Buggy Base Reproduction**:
  ```bash
  pnpm replaykit run --config fixtures/qs-issue-33/config.json --test work/demo/qs-generated.test.js --role buggy
  ```
  - CLI Exit Code: `2` (reproduction confirmed).
  - Container Exit Code: `1`.
  - Captured Error: Native `TypeError: source.hasOwnProperty is not a function` at `/case/lib/utils.js:47:20`.
- **Four-Target Verification Matrix**:
  ```bash
  pnpm replaykit verify --config fixtures/qs-issue-33/config.json --test work/demo/qs-generated.test.js --evidence-dir work/demo/evidence/qs-verify
  ```
  - Run ID: `verify-1792564714131-ee3eeb7d`.
  - Duration: 224.9 seconds.
  - Verification Verdict: **`VERIFIED`**.
  - Target Matrix Details:
    1. **Buggy Base**: Exits 1 (`TypeError: source.hasOwnProperty is not a function`). Verified buggy trigger.
    2. **Reference Fix**: Exits 0, test passes cleanly.
    3. **Alternate Fix**: Exits 0, test passes cleanly.
    4. **Semantic Decoy Fix**: Exits 1 with `AssertionError`. Catches semantic data drop (`{ a: {} }` dropped `{ b: 'c' }`).
  - Baseline Non-Regression: All 55 baseline `qs` tests pass across all targets.
  - Resource Cleanup: 0 orphaned containers, networks, or volumes.

---

### 3.3 Task 3: Fastify Issue #4807 End-to-End Demonstration

Fastify #4807 represents an asynchronous HTTP router edge case where a route defined with `preParsing` and custom content-type parsers fails to initialize error handling correctly if matching headers are absent.

- **Workspace Blinding**: Upstream test PR diffs scrubbed. Workspace blinded with full generic adapter scaffolding.
- **Novel Test Generation**:
  ```bash
  pnpm replaykit generate --config fixtures/fastify-issue-4807/config.json --output work/demo/fastify-generated.test.js
  ```
  - Duration: 98.7 seconds.
  - Tokens Generated: 638 tokens (503 prompt, 135 completion).
  - Candidate Digest: `c55ac70f06180328889e951834fd708ad2820194787b668a32369140b0582651`.
  - Prompt Engineering: Hardened with prompt constraints prohibiting `.catch(console.error)` promise swallowing and requiring `async/await fastify.inject()`.
- **Buggy Base Reproduction**:
  ```bash
  pnpm replaykit run --config fixtures/fastify-issue-4807/config.json --test work/demo/fastify-generated.test.js --role buggy
  ```
  - CLI Exit Code: `2` (reproduction confirmed).
  - Container Exit Code: `1`.
  - Captured Error: `TypeError: Cannot read properties of undefined (reading 'error')` at `/case/lib/request.js:204:55`.
- **Four-Target Verification Matrix**:
  ```bash
  pnpm replaykit verify --config fixtures/fastify-issue-4807/config.json --test work/demo/fastify-generated.test.js --evidence-dir work/demo/evidence/fastify-verify
  ```
  - Run ID: `verify-1792565798158-00bd4c7b`.
  - Duration: 507.8 seconds.
  - Verification Verdict: **`VERIFIED`**.
  - Target Matrix Details:
    1. **Buggy Base**: Exits 1 (`TypeError`).
    2. **Reference Fix**: Exits 0, test passes cleanly.
    3. **Alternate Fix**: Exits 0, test passes cleanly.
    4. **Semantic Decoy Fix**: Exits 1 with `AssertionError`.
  - Baseline Non-Regression: Baseline Fastify test suite passes cleanly across all targets.
  - Resource Cleanup: 0 orphaned containers, networks, or volumes.
- **Hardened Regression Control Test**:
  - SHA256: `24a9275acba30f053fb175ee873a6772204c24bcc38daf0ccd50aba6c537208d`.
  - Run ID: `verify-1792566477276-653020f7`.
  - Verification Verdict: **`VERIFIED`**.
  - Duration: 551.9 seconds.

---

## 4. Evaluator Integration & 10-Invariant Matrix

The v0.1.0 developer CLI replaces naive status-code evaluation with an industrial-grade verification harness enforcing 10 invariant checks:

| # | Invariant Check | Evaluator Rule | Verification Status |
| :-: | :--- | :--- | :---: |
| 1 | **Failure Identity Matching** | Buggy failure must reproduce the incident error class and frame (`TypeError`, `AssertionError`) | **ENFORCED** |
| 2 | **Candidate SHA256 Preservation** | Candidate test file SHA256 must match across all 4 target container executions | **ENFORCED** |
| 3 | **Patch Hash Verification** | Patches applied to reference, alternate, and decoy targets must match configured SHA256 digests | **ENFORCED** |
| 4 | **Positive Reference Fix Validation** | Reference fix patch must cause the candidate test to pass (container exit code 0) | **ENFORCED** |
| 5 | **Positive Alternate Fix Validation** | Alternate independent fix patch must also cause the candidate test to pass (container exit code 0) | **ENFORCED** |
| 6 | **Semantic Decoy Rejection** | Decoy patch must fail the candidate test with `AssertionError` (preventing tautological tests) | **ENFORCED** |
| 7 | **Baseline Non-Regression** | Upstream pre-existing test suite must pass 100% on all fixed targets | **ENFORCED** |
| 8 | **Offline Enforcement** | Execution containers run strictly with `--network none`; zero external traffic allowed | **ENFORCED** |
| 9 | **Rootless Sandbox Containment** | Root filesystem is mounted read-only (`--read-only`), capabilities dropped (`--cap-drop=ALL`), non-root execution (`--user 10001:10001`) | **ENFORCED** |
| 10 | **Deterministic Lifecycle Cleanup** | Ephemeral containers, temporary volumes, and test harnesses are destroyed in `finally` blocks | **ENFORCED** |

---

## 5. Release Documentation Inventory

All necessary release documentation has been authored, reviewed, and linked:

- **[`README.md`](../../README.md)**: Project overview, quickstart, developer workflows, benchmark commands, MCP integration, and architecture map.
- **[`CONTRIBUTING.md`](../../CONTRIBUTING.md)**: Developer onboarding, code style guidelines, PR submission protocol, and invariant preservation rules.
- **[`docs/INSTALLATION.md`](../INSTALLATION.md)**: Detailed prerequisites, Docker engine setup, Ollama local model loading, and verified dependency versions.
- **[`docs/CLI_REFERENCE.md`](../CLI_REFERENCE.md)**: Comprehensive manual for developer commands (`generate`, `run`, `verify`, `doctor`, `clean`) and benchmark commands.
- **[`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)**: Multi-package architecture, generic adapter design, AST validation pipeline, and 4-target verification flow.
- **[`docs/SECURITY.md`](../SECURITY.md)**: Container security boundaries, isolation profiles, threat model, and vulnerability reporting procedures.
- **[`docs/ENVIRONMENTS.md`](../ENVIRONMENTS.md)**: Matrix of supported operating systems, Node.js runtimes, Docker engine versions, and container image SHAs.
- **[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)**: Continuous integration pipeline running linter, typecheck, unit test suites, and token scan.

---

## 6. Apple "ReplayKit" Trademark Collision Analysis & Strategic Roadmap

### 6.1 Background and Problem Identification

Apple Inc. owns the registered trademark **"ReplayKit"** (first introduced at WWDC 2015 alongside iOS 9). In Apple's platform ecosystem:
- **Scope of Apple ReplayKit**: A public framework (`ReplayKit.framework`) for iOS, iPadOS, macOS, and tvOS that allows apps to record screen video, microphone audio, and broadcast live streams to services.
- **Trademark Registrations**: Apple holds registrations and applications in Class 9 (computer software) and Class 42 (computer services) in the US (USPTO Reg. No. 5,038,629 and related international filings).

While this project is an open-source developer tool for automated software regression test generation and deterministic bug replay in Node.js / backend systems (a completely distinct technical purpose), retaining the name **"ReplayKit"** on public registries (specifically `npm`, GitHub, and VS Code Marketplace) introduces clear operational and legal risks:
1. **Registry Confusion & Takedown Risk**: Trademark owners regularly issue DMCA/trademark takedown notices to package managers (npm, PyPI) or code hosts (GitHub) for tools sharing exact mark names in Class 9/42.
2. **Developer Search Ambiguity**: Developers looking for iOS screen recording bindings in Node.js could stumble upon this CLI, while engineers looking for regression test synthesis may struggle to discover the tool.
3. **Enterprise Adoption Resistance**: Enterprise legal and procurement departments frequently flag potential trademark infringements during OSS license reviews.

### 6.2 Candidate Naming Evaluation

To resolve this collision definitively, four alternative candidate names were evaluated against namespace availability, trademark distinctiveness, and brand clarity:

| Candidate Name | Distinctiveness | npm Availability | Domain / SEO Suitability | Developer Clarity | Recommendation |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`BugReplay`** (`@bugreplay/cli`) | High | Available | Excellent | High — instantly communicates bug reproduction | **Strong Contender** |
| **`ReproKit`** (`@reprokit/cli`) | High | Available | Excellent | High — familiar developer terminology ("repro") | **Primary Recommendation** |
| **`TraceReplay`** (`@tracereplay/cli`) | Moderate | Available | Good | Moderate — implies distributed tracing | Secondary |
| **`DeterministicReplay`** (`@detreplay/cli`) | High | Available | Fair | Low — overly academic / verbose | Not Recommended |

### 6.3 Strategic Renaming Roadmap

To ensure a smooth transition without breaking existing installations or benchmark evaluations, the following phased migration is adopted:

```
+-----------------------------------------------------------------------------------+
| Phase 1: v0.1.0 (Current Acceptance)                                              |
| - Retain internal project name 'replaykit' for benchmark reproducibility.        |
| - Include Trademark Disclaimer in README.md, docs, and CLI help synopsis.        |
| - Document non-affiliation: 'Not affiliated with or endorsed by Apple Inc.'       |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| Phase 2: v0.1.x Migration Staging (Prior to Public Registry Push)                  |
| - Register npm scope '@reprokit' and reserve 'reprokit' / 'bugreplay'.            |
| - Implement CLI binary symlinks: 'reprokit' as primary bin, 'replaykit' as alias. |
| - Update documentation links and telemetry/report headers.                        |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| Phase 3: v0.2.0 Public General Availability (GA)                                  |
| - Formally rename package to '@reprokit/cli' (or 'reprokit').                     |
| - Issue deprecation redirect notice on legacy 'replaykit' stub package.           |
| - Zero residual trademark collision exposure.                                     |
+-----------------------------------------------------------------------------------+
```

#### v0.1.0 Trademark Disclaimer Notice
The following notice is placed in `README.md` and documentation:
> *Legal Notice: "ReplayKit" as used in this open-source developer project refers to an automated regression replay and test generation framework for Node.js applications. This project is independent, open-source software and is not affiliated with, sponsored by, or endorsed by Apple Inc. "ReplayKit" is a registered trademark of Apple Inc. in the United States and other countries.*

---

## 7. Release QA, Test Suites & Protected File Integrity

### 7.1 Protected File Integrity
The core judge evaluator and base contracts are strictly protected:
```bash
git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts
# Exit code: 0 (Byte-for-byte identical to baseline)
```

### 7.2 Static Verification & Secret Scan
- **TypeScript Typecheck**:
  ```bash
  pnpm typecheck
  # Exit code: 0 (All packages checked cleanly)
  ```
- **Token & Secret Hygiene**:
  ```bash
  pnpm token:scan
  # Exit code: 0 (Zero leaked API tokens, passwords, or secrets)
  ```

### 7.3 Automated Test Suite Results
All unit and functional integration suites pass:
- `developer-command.test.ts`: **15/15 passing** (covers `generate`, `run`, `verify`, `doctor`, `clean`, error paths, invalid configs, missing files, missing candidate patches, patch hash mismatches, decoy pass rejection, and verdict formatting).
- `generic-adapter.test.ts`: **18/18 passing** (covers supervisor script injection, command construction, payload staging, sandbox parameters, and lifecycle hooks).
- `docker-cleanup.test.ts`: **14/14 passing** (covers orphan container identification, dry-run pruning, label filtering, volume reclamation, and error handling).
- `blind-synthesis.test.ts`: **18/18 passing** (covers workspace blinding, scrubbing upstream test 40, AST safety validation, Levenshtein distance check, and epistemic sufficiency).
- Total Test Assertions: **65/65 passing across all targeted developer CLI suites**.

---

## 8. Exact Local Reproduction Runbook

Any reviewer or engineer can independently reproduce the entire v0.1.0 verification sequence on a local machine using the following exact commands:

### Step 1: Pre-flight Health Check
```powershell
# Verify environment connectivity and container runtime
pnpm replaykit doctor

# Verify Docker engine cleanliness
pnpm replaykit clean --dry-run
```

### Step 2: Reproduce `qs` Issue #33
```powershell
# 1. Synthesize novel regression test via local LLM
pnpm replaykit generate `
  --config fixtures/qs-issue-33/config.json `
  --output work/v0.1.0/qs-repro-fresh.test.js

# 2. Run against buggy base container (must fail with TypeError, exit code 2)
pnpm replaykit run `
  --config fixtures/qs-issue-33/config.json `
  --test work/v0.1.0/qs-repro-fresh.test.js `
  --role buggy

# 3. Execute 4-target verification matrix (must output verdict: VERIFIED, exit code 0)
pnpm replaykit verify `
  --config fixtures/qs-issue-33/config.json `
  --test work/v0.1.0/qs-repro-fresh.test.js `
  --evidence-dir work/v0.1.0/evidence/qs-verify-fresh
```

### Step 3: Reproduce Fastify Issue #4807
```powershell
# 1. Synthesize novel regression test via local LLM
pnpm replaykit generate `
  --config fixtures/fastify-issue-4807/config.json `
  --output work/v0.1.0/fastify-repro-fresh.test.js

# 2. Run against buggy base container (must fail with TypeError, exit code 2)
pnpm replaykit run `
  --config fixtures/fastify-issue-4807/config.json `
  --test work/v0.1.0/fastify-repro-fresh.test.js `
  --role buggy

# 3. Execute 4-target verification matrix (must output verdict: VERIFIED, exit code 0)
pnpm replaykit verify `
  --config fixtures/fastify-issue-4807/config.json `
  --test work/v0.1.0/fastify-repro-fresh.test.js `
  --evidence-dir work/v0.1.0/evidence/fastify-verify-fresh
```

### Step 4: Final Environment Sanitation
```powershell
# Prune all replaykit-labeled test containers and ephemeral volumes
pnpm replaykit clean
```

---

## 9. Release Readiness Statement

ReplayKit v0.1.0 satisfies all architectural, empirical, security, and verification requirements. The codebase exhibits zero type regressions, clean sandboxing guarantees, 100% preservation of protected evaluator invariants, and deterministic reproducibility across real-world Node.js defects.

**Per operational constraints:**
- No remote Git push has been executed.
- No Git release tags have been published.
- No npm package has been published.
- The release artifact bundle is fully assembled and staged in local working directory for final authorized sign-off.
