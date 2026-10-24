# UID Configuration Audit

Audit started: 2026-10-22; finalized after resumed independent review: 2026-10-24, America/Chicago. Starting HEAD: 869a27004e9822b5375312ca0750e83fcb891325, branch wip/quality-system; initial working tree clean. This is a documentation audit of current runtime configuration and saved evidence. No runtime behavior or historical result was changed.

## Current execution profiles
| Role | Configured UID:GID | Source and enforcement |
|---|---|---|
| External official-test container | 1000:1000 | packages/runtime/src/external-supervisor.ts:194–195 sets --user; :260 rejects a different inspected Config.User before start |
| Candidate container | 1000:1000 | packages/judge/src/sandbox.ts:370–371 sets --user; sandbox-policy.ts:24 requires the literal value for candidate isolation |
| Planner container | 1000:1000 | sandbox.ts:96–97 explicitly sets --user; image inherits the application base |
| Application container | 1000:1000 | sandbox.ts:328–329 explicitly sets --user; scripts/build-sandbox.ts:323 sets image USER |
| PostgreSQL service | 70:70 | sandbox.ts:287–288, build-sandbox.ts:282, and scripts/postgres-snapshot-check.ts:35; the probe source asserts inspected User at :128 |

The candidate image also sets USER 1000:1000 at build-sandbox.ts:354. The external evaluator's recorded-evidence schema (packages/judge/src/external.ts:218) accepts positive numeric UID syntax; it must not be described as enforcing the supervisor's exact UID pin. Container creation, pre-start inspection, image defaults and evaluator schemas are separate evidence layers.

Docker control-plane file copying and build-time setup are distinct from untrusted payload execution. No runtime-root helper exception was established by this targeted audit. A different non-root account is not automatically interchangeable with a pinned role. PostgreSQL must not be normalized to 1000:1000.

## Saved execution evidence
Raw pre-start Docker inspection for run qs33-gateb-local-07 records Config.User as 1000:1000 in all four files:

- work/phase2/gate-b-runs/qs33-gateb-local-07/commands/069-buggy-inspect-before.stdout:171.
- The same commands directory: 072-buggy-inspect-staged-before-start.stdout:171, 087-fixed-inspect-before.stdout:171 and 090-fixed-inspect-staged-before-start.stdout:171.

The orchestrator parsed these files independently and saved paths, SHA-256s and only the relevant User value in work/release-audit/uid-20261022/raw-uid-checkpoint.json. Full raw inspection data was not copied into the review bundle.

A saved R1 candidate inspection also records 1000:1000: runs/0f02fe69-14e7-4e63-b2a7-5421bd374abd/executions/026981e9-2e00-462b-b275-8eefda53dd47/isolation.json:168. This record establishes the candidate configuration, not the application or database user. Saved Fastify target summaries report the same test-container user but are secondary to raw inspect artifacts. No saved raw PostgreSQL inspection was established in this audit; its profile is supported by current source and probe assertions.

Config.User identifies Docker's configured account, not an independently observed live kernel UID/GID. No new Docker execution or fresh generation experiment was performed.

## Guidance corrections and historical preservation
Exactly five existing guidance locations were corrected:

- .agents/agents/docker-specialist.md:16: external-test identity and other role profiles.
- .agents/rules/security-invariants.md:15: pinned role-specific identities rather than an unsupported 10001:10001 alternative.
- docs/quality/FAILURE_CLASSIFICATION.md:99: root-user diagnostic with the correct role-specific expected values.
- docs/quality/TEST_MATRIX.md:174: candidate/planner and external-test inspect expectation 1000:1000.
- docs/release/V0_1_0_ACCEPTANCE.md:152: test-sandbox UID quotation corrected to 1000:1000.

Each edit is one exact byte replacement; all other bytes, including newline conventions, were preserved. Existing SECURITY.md, ARCHITECTURE.md and THREAT_MODEL.md already correctly describe the test/candidate account and were not edited. Runtime sources, protected contracts, fixtures, dependency bundles and candidates were not changed.

The October 21 docs/quality/INDEPENDENT_QA_AUDIT.md:45 retains its original 10001:10001 wording as dated audit evidence. That historical assertion is superseded for current guidance by this source/evidence review; it is not accepted as proof of the configured account. Historical phase documents, raw logs and all earlier release/notice audit reports remain untouched. Baseline SHA-256 checks cover selected source/config/history files and the raw inspections; this is not a complete hash proof for every ignored historical file.

## Independent QA
Independent documentation/evidence and preservation review passed.

The first fresh quick gate failed: run-1792721061956-249b66c4, exit 1, three checks passed, typecheck exceeded its unchanged 180000 ms limit without a TypeScript diagnostic, and seven checks were excluded by quick tier. Its 109 tests passed; separate existing sandbox-policy/manifest suites passed 11 tests (120 tests total). Those test passes do not override the failed gate. See the [initial independent QA report](../../work/release-audit/uid-20261022/agents/03-independent-qa.md).

A read-only CLI diagnosis found no version/configuration mismatch; broad slowdown is inferred, not established as root cause.

The one isolated retry passed: run-1792721477339-09d5cbc9, exit 0, four checks passed, zero failed, seven tier-excluded checks, total 189058 ms. Typecheck finished in 136957 ms, below its unchanged 180000 ms limit. The retry executed 109 passing tests across five files; the separate supplemental suites contributed 11 passing tests across two other files. The passing retry does not reclassify the first failed run or establish its root cause. Quick wall time exceeded the nominal under-30-second guidance; the existing runner applied its unchanged configured timeouts. Execution was October 22, 21:11:17–21:14:27 America/Chicago; the October 24 resumed review inspected saved evidence and unchanged files without running another gate. See the [independent retry review](../../work/release-audit/uid-20261022/agents/05-independent-qa-retry.md).

The failed run and report remain unchanged. Passing runs from before the UID edits are not post-edit validation for this correction.

## Reports and boundaries
- [Pre-edit evidence audit](../../work/release-audit/uid-20261022/agents/01-uid-evidence.md): FAIL identifies the five original documentation discrepancies, not a demonstrated runtime security failure.
- [Documentation correction report](../../work/release-audit/uid-20261022/agents/02-documentation-editor.md).
- [Initial independent QA](../../work/release-audit/uid-20261022/agents/03-independent-qa.md), [CLI timeout diagnosis](../../work/release-audit/uid-20261022/agents/04-typecheck-diagnosis.md), and [independent retry review](../../work/release-audit/uid-20261022/agents/05-independent-qa-retry.md).

This audit does not change the separate naming/legal or dependency-provenance publication decisions. No commit, push, tag, bundle update or publication is authorized or performed by this UID workflow.
