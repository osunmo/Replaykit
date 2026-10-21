# Gate B local-06 independent QA

Review status: **no blocking source finding for local-06 evidence collection**. This is a static/source-and-preserved-evidence review, not a Gate B acceptance. I did not run Docker, the Gate B runbook, npm, or upstream qs, and did not edit any source. The new run must still be judged from its raw role output.

## Exact candidate reviewed

| File | SHA-256 |
| --- | --- |
| `scripts/phase2/run-gate-b.ps1` | `4be0fbf690a2a70b25e2699cf1b7ac06d5f7a4c23c39459f1f14ca53d36f81ee` |
| `scripts/phase2/gate-b-probe.cjs` | `1be6ecf9e72579e8b18079bdad2459263f377baf1a221ed17fe5dae1751ce696` |
| `scripts/phase2/gate-b-lab-adaptation.cjs` | `85731ef6b4a360b326bafd7eccf4447ffbafb0eb0f96303560f1d7bef39e1a73` |
| `scripts/phase2/verify-gate-b-tap.mjs` | `69e5af7c08917eb275ab88c8ae814489e2128d643ca5855e9277a04e2f80d21e` |

If any candidate hash changes before local-06, this review must be refreshed for that file.

## Findings by severity

- **Blocking: none found in the reviewed candidate.** The official child in both roles has the same `--require /case/gate-b-lab-adaptation.cjs` and `-r tap` argv, without Lab `-l`. The preloader snapshots the eight named values and own descriptors before the suite, requires the initial Lab detector result to be exactly those eight, retains every unrelated detector result, and reports a changed allowed global even when Lab's value-only detector misses it. The pinned local-05 Lab source calls `Leaks.detect()` once at suite completion and its TAP reporter emits `SKIP`/`TODO` as title prefixes. The host requires one adaptation marker and one empty remaining-leaks marker for each official run.
- **Blocking: none found in TAP/probe validation.** The verifier requires one 56-test plan, 56 unique IDs 1–56, exact role outcomes, exact footer counts including zero skips and TODOs, ID 40's title, and the buggy official TypeError plus production frame. The host compares the full ID/title digest across roles. The revised probe uses the real `/case/index.js`, passes the direct control, and compares the fixed result as exact structural JSON. For buggy it requires exit 1, the exact native TypeError message, the top qs frame in the event stack, and the native TypeError and `exports.clone (/case/lib/utils.js:47:20)` in raw probe stderr. This excludes a probe assertion as the buggy library failure.
- **Blocking: none found in provenance/isolation/cleanup.** The runbook freezes the adapter, probe, verifier, and supervisor in provenance before either role; checks the pinned Lab leak/TAP file hashes; verifies both source trees, the reversible test patch, identical complete parse-suite bytes, and the dependency lock. It stages separate role payloads under private labeled volumes, then checks copied input hashes before and after execution. The root is read-only, network is none, user is 1000:1000, and PID 1 is the native watchdog. Successful role cleanup verifies exact container and volume removal before starting the next role; failure cleanup acts only on recorded owned resources. No shared prune/removal path is present. The only explicit host stdout write is the completed `GATE_B_SUMMARY.md`; progress goes to stderr.
- **Informational verification limit.** The local synthetic behavior test exercises changed global *value* and unrelated leaks, but not a descriptor-only change. The TAP test exercises skip, extra failure, unrelated leak and truncation, but not every duplicate/TODO/footer variant. The reviewed code has explicit rejection branches for these cases. The local-06 raw run remains the decisive runtime check.

## Preserved local-05 evidence and R1

`qs33-gateb-local-05/report.json` remains `PARTIAL`, `evidenceCollectionCompleted: false`, `gateBAccepted: false`; its fixed official and probe children both exited 1. The raw official output shows the eight Node 22 globals as Lab leaks in both roles. The buggy official raw output has the single regression failure and `exports.clone (/case/lib/utils.js:47:20)`; the buggy probe stderr has the same native top frame. The fixed probe stderr shows an assertion over a null-prototype nested object, although the value's structural JSON is correct. This is the specific local-05 failure addressed by the structural probe check. The original local-05 run was read only. Its artifact manifest still matches the SHA-256 of both official stdout files and both probe stderr files. `git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts` exited 0.

## Local verification commands

| Command | Exit | Result |
| --- | ---: | --- |
| `node scripts/phase2/test-gate-b-tap.mjs` | 0 | `Gate B TAP contract regression: PASS` |
| `node scripts/phase2/test-gate-b-behavior.mjs` | 0 | `Gate B probe/adaptation regression: PASS` |
| PowerShell `[System.Management.Automation.Language.Parser]::ParseFile('scripts/phase2/run-gate-b.ps1', ...)` | 0 | No parse errors |
| local-05 artifact-manifest comparison for both official stdout and both probe stderr files | 0 | Four of four hashes matched |
| `git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts` | 0 | Protected R1 files unchanged |

Disposition: **ready for a new local-06 collection at the exact reviewed hashes; Gate B remains unaccepted pending independent inspection of the new raw official and probe evidence.**
