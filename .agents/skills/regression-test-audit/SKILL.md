---
name: regression-test-audit
description: >-
  Audit AI-generated or manually authored regression tests for AST safety, swallowed promise rejections, framework assertion compatibility (Lab vs node:test), and 4-target differential discrimination.
---

# ReplayKit Regression Test Audit Skill

Use this skill when inspecting a newly generated or hardened regression test to prevent false-positive passes, unhandled promise rejections, or tautological assertions.

## Procedure

### Step 1: Perform Abstract Syntax Tree (AST) Validation

Run `validateTestAst()` checks against the test file to ensure:
1. No swallowed exceptions: Disallow `.catch(console.error)` or empty `catch` blocks that exit with code 0.
2. Mandatory assertion presence: Ensure at least one assertion library (`assert`, `expect`, `Lab.expect`) is imported and invoked.
3. No process bypasses: Reject explicit `process.exit(0)` calls that short-circuit failing assertions.
4. Bounded execution: Ensure asynchronous tests contain deterministic timeout or await completion.

### Step 2: Validate Framework-Specific Assertion Syntax

Verify that the test assertions match the framework version of the target repository:
- **`qs` (Lab 3.0.0 / Node 22)**:
  - Must use `var expect = Lab.expect;`
  - Valid syntax: `expect(res).to.deep.equal({ a: { b: 'c' } });`
  - Must pass callback `done()` and invoke `done();` upon test completion.
- **`fastify` (node:test / Node 22)**:
  - Must use `const assert = require('node:assert');` or `node:assert/strict`.
  - Must `await fastify.inject(...)` inside an `async` function.
  - Assert that `req.routeConfig === undefined` (strict check against `{}` decoy).

### Step 3: Four-Target Differential Audit

Verify that the test performs genuine differential discrimination:
1. **Buggy Base**: Fails with the historical native error class and top application frame.
2. **Reference Fix**: Passes cleanly (exit code 0).
3. **Alternate Fix**: Passes cleanly (exit code 0).
4. **Semantic Decoy**: Fails with an `AssertionError`. If the test passes on the decoy, reject the test immediately as tautological.
