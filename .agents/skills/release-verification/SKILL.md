---
name: release-verification
description: >-
  Execute the complete ReplayKit pre-release verification protocol including full test matrix execution, clean Docker daemon sweep, protected contract diff check, and Apple ReplayKit trademark review.
---

# ReplayKit Release Verification Skill

Use this skill prior to staging a release, publishing an npm package, creating a git release tag, or declaring a milestone accepted.

## Procedure

### Step 1: Execute Full Pre-Release Quality Suite

Run the full RELEASE gate:
```powershell
pnpm quality:release
```

Verify that all checks report `PASS` with exit code 0:
- TypeScript typecheck (`tsc --noEmit`).
- Monorepo unit tests (65+ tests passing).
- Security token scan across all files (clean, 0 leaks).
- Pinned image and local Ollama connectivity.
- Example configuration schema validity (`examples/qs33.json`, `examples/fastify4807.json`).

### Step 2: Verify Protected Contract Immutability

Ensure protected files are 100% byte-for-byte identical to baseline:
```powershell
git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts
```

### Step 3: Verify Zero Docker Host Mutations

Verify that the local Docker daemon has 0 lingering ReplayKit resources:
```powershell
pnpm replaykit clean --dry-run
```
Confirm `containersRemoved: 0`, `networksRemoved: 0`, `volumesRemoved: 0`.

### Step 4: Trademark and Legal Disclaimer Audit

Ensure all public documentation contains the mandatory Apple Inc. non-affiliation disclaimer:
1. `README.md` Section 9 contains the legal notice:
   > *"ReplayKit" as used in this open-source developer project refers to an automated regression replay and test generation framework for Node.js applications. This project is independent, open-source software and is not affiliated with, sponsored by, or endorsed by Apple Inc.*
2. Verified migration roadmap to `@reprokit/cli` documented in `docs/release/V0_1_0_ACCEPTANCE.md`.

### Step 5: Generate Release Acceptance Record

Update `docs/release/V0_1_0_ACCEPTANCE.md` with the latest run IDs, durations, and verification hashes. Do not push tags or publish packages without explicit coordinator authorization.
