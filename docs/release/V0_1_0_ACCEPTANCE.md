# ReplayKit v0.1.0 Release Acceptance Report

**Release Target:** `replaykit` v0.1.0  
**Date:** 2026-10-21  
**Status:** **PUBLIC DISTRIBUTION ON HOLD — NAMING/LEGAL DECISION REQUIRED**
**Classification:** Core Developer CLI & Autonomous Verification Engine  

---

## 1. Executive Summary

ReplayKit v0.1.0 represents the first production-ready release of the deterministic bug reproduction and verification engine. v0.1.0 delivers an autonomous, hermetically sandboxed developer CLI that takes an issue description or incident context, generates novel regression tests via local LLM synthesis (`qwen2.5-coder:3b`), and evaluates candidate tests against a 4-target matrix (Buggy base, Reference fix, Alternate fix, and Semantic Decoy fix).

### Key Release Highlights
1. **Developer CLI Suite**: Five core developer commands (`generate`, `run`, `verify`, `doctor`, `clean`) alongside benchmark operations.
2. **Empirical Multi-Case Validation**: End-to-end autonomous synthesis and 4-target verification successfully validated across distinct paradigms:
   - **`qs` Issue #33**: Deep object prototype injection (`TypeError: source.hasOwnProperty is not a function`).
   - **`fastify` Issue #4807**: Async HTTP server route content-type matching (`TypeError: Cannot read properties of undefined (reading 'config')`).
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
| **Task 6** | Naming Risk Review | Apple ReplayKit vs CLI tool | Verified primary-source facts; candidate availability and human naming/legal decision unresolved | **NEEDS_REVIEW** | Section 6 |
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
  - Captured Error: `TypeError: Cannot read properties of undefined (reading 'config')` at `/case/lib/request.js:204:55`.
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

## 6. Apple ReplayKit Naming Review & Unresolved Release Decision

### 6.1 Verified Facts and Limits

Checked 2026-10-22: Apple’s [trademark list](https://www.apple.com/legal/intellectual-property/trademark/appletmlist.html) lists ReplayKit with a registered-symbol designation and the generic description software framework. Apple’s [trademark guidelines](https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html) restrict use of its marks in company, product, or service names except as specified there. These are the owner’s published statements, not a legal determination about this project. No specific registration number, trademark classes, territorial portfolio, infringement conclusion, permission, or legal clearance has been verified.

The identical name creates plausible discoverability and affiliation-confusion concerns across software audiences. Complaints, distribution interruption, or migration costs are possible risks, not established events or predictions. The different technical purpose and a non-affiliation notice do not establish permission. Engineering QA cannot resolve this naming/legal decision. Public distribution remains on hold pending human review and a documented decision.

### 6.2 Unverified Naming Examples

Earlier candidate names are retained only as examples for possible investigation; none is selected, reserved, cleared, or guaranteed available.

| Candidate example | Possible npm coordinate | Verification status |
| :--- | :--- | :--- |
| BugReplay | `@bugreplay/cli` | UNVERIFIED |
| ReproKit | `@reprokit/cli` | UNVERIFIED |
| TraceReplay | `@tracereplay/cli` | UNVERIFIED |
| DeterministicReplay | `@detreplay/cli` | UNVERIFIED |

For every candidate, npm scope ownership and package publish rights require separate current checks; GitHub, marketplace, domain, and trademark availability also remain unverified. Registry availability alone is not legal clearance. This review authorizes no reservation, registration, rename, or publication.

### 6.3 Contingent Migration Considerations

The current `pnpm replaykit` command is a repository script in root `package.json`. Both the root and `packages/cli/package.json` are `private: true`; the CLI manifest has no `bin` mapping. No published standalone executable or legacy stub is established here. [npm’s package.json documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#private) states that `private: true` prevents npm publication; its [bin documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#bin) explains command mappings and Windows command shims (checked 2026-10-22).

A future migration requires a separately authorized choice of product identity and implementation plan. A scoped package name alone does not change the product brand or command. The plan must specify package/import coordinates, local scripts and any future `bin` mappings, help/examples/CI, MCP tools and client bindings, editor command/settings IDs, report/telemetry identifiers, and repository links. Compatibility aliases retain some old-name exposure and need an explicit tradeoff decision and tests; a legacy stub/deprecation notice would require verified ownership and separate publication authorization. No zero-risk outcome is promised.

Historical benchmark names, raw evidence, hashes, and pinned fixtures must remain intact. Any future resource-label migration must retain safe recognition of explicitly owned legacy resources without broadening cleanup to name prefixes. No migration is implemented by this documentation correction.

### 6.4 Current Non-Affiliation Notice

This independent, open-source Node.js regression testing project is not affiliated with, sponsored by, or endorsed by Apple Inc. The [README notice](../../README.md#9-trademark-notice) records the verified source and unresolved decision; it does not establish permission or legal clearance.

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

The engineering results recorded above do not establish naming/legal clearance or authorization for public distribution. Task 6 remains NEEDS_REVIEW pending a human naming/legal decision. The codebase exhibits zero type regressions, clean sandboxing guarantees, 100% preservation of protected evaluator invariants, and deterministic reproducibility across real-world Node.js defects.

**Per operational constraints:**
- No remote Git push has been executed.
- No Git release tags have been published.
- No npm package has been published.
- The local release records do not authorize public distribution; the unresolved naming/legal decision remains a release hold.
