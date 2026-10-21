# Gate B inventory repair: independent QA

**Verdict:** Approved for a fresh, sequential local collection attempt only. Gate B remains **PARTIAL/BLOCKED**: local-04 has a genuine buggy execution, but no fixed-revision execution. This review did not run Docker or access the network.

## Original failure and exact cause

I loaded `Same-Inventory` from the preserved `work/phase2/gate-b-runs/qs33-gateb-local-04/provenance/run-gate-b.ps1` with PowerShell's parser and called it with the saved `provenance/buggy-payload.json` and `evidence-buggy/inputs-before.json`, recreating the runbook's `@(... | ConvertFrom-Json)` input shape. Both manifests contain 356 entries. Their hashes, pinned in the regression test, are:

| Manifest | SHA-256                                                            |
| -------- | ------------------------------------------------------------------ |
| Prepared | `ef25318c1afff4ea7061ddac9511dff227bf450bf6cf01bfacd96e7db0214b6d` |
| Before   | `e6fe407f0189e5efb0460c1945ab11a64baa7c3c9e7cb74f8770f62d0d7f84e3` |
| After    | `e6fe407f0189e5efb0460c1945ab11a64baa7c3c9e7cb74f8770f62d0d7f84e3` |

Under Windows PowerShell 5.1, the prepared list is 356 `PSCustomObject` entries, while the observed list is one `Object[]` containing 356 entries. The preserved function's string rendering therefore has 356 lines on the left and one line, `System.Object[] System.Object[] System.Object[]`, on the right. It rejects the identical data with `Inventory mismatch: buggy container input bytes before execution`. Flattening only that observed wrapper makes the preserved function accept. PowerShell 7.6.5 receives flat 356-entry lists and accepts directly. This isolates the false positive to `ConvertFrom-Json`/array shape, not `Sort-Object` culture or case ordering. The original local-04 `collection-error.txt` records the same mismatch.

Reproduction command: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File $env:TEMP\replaykit-qa-inventory-repro.ps1`, then `pwsh.exe -NoProfile -File $env:TEMP\replaykit-qa-inventory-repro.ps1`. Each command exited 0; the Windows PowerShell reproduction intentionally reported `ORIGINAL=REJECT` and `FLAT=ACCEPT`, while PowerShell 7 reported `ORIGINAL=ACCEPT` and `FLAT=ACCEPT`. The temporary script extracted the preserved function via `FunctionDefinitionAst` and read only saved evidence.

## Repair and tests

The reviewed `scripts/phase2/run-gate-b.ps1` normalizes the single PowerShell 5.1 JSON-array wrapper and rejects unsupported nested entries. Each entry must have exactly `path`, `bytes`, and `sha256` properties; path must be a nonempty string, bytes a nonnegative integer, and SHA-256 a 64-character lowercase hex string. Both sides are indexed in ordinal, case-sensitive dictionaries, which reject duplicate paths. Entry counts and every path, byte length, and SHA-256 are compared; extra, missing, and modified files fail. Ordinal sorting controls traversal order without affecting equality. The host inventory still hashes actual files and the container still records actual `/case` input inventories before and after execution.

`scripts/phase2/test-inventory.ps1` extracts the **current production** function, checks all three pinned saved manifest hashes, accepts prepared-versus-before and prepared-versus-after, and rejects changed hash, changed byte length, missing file, extra file, case-changed path, and duplicate entries on both sides.

| Command                                                                                                                      |        Exit | Result                                                        |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------: | ------------------------------------------------------------- |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\phase2\test-inventory.ps1`                                |           0 | `Gate B inventory regression: PASS`                           |
| `pwsh.exe -NoProfile -File .\scripts\phase2\test-inventory.ps1`                                                              |           0 | Same PASS output                                              |
| PowerShell 5.1 parser on runbook and test                                                                                    |           0 | Zero parse errors in each file                                |
| PowerShell 7 parser on runbook and test                                                                                      |           0 | Zero parse errors in each file                                |
| `git diff --exit-code HEAD -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts`                                |           0 | Protected R1 files unchanged                                  |
| `git diff --no-index -- work/phase2/gate-b-runs/qs33-gateb-local-04/provenance/run-gate-b.ps1 scripts/phase2/run-gate-b.ps1` | 1, expected | Only inventory function and two buggy-frame assertions differ |

The reviewed script SHA-256 is `797f149c9f55fb1f9d828a344aeb5cfe6b5f08c36acc15522f21b0eee211957f`; test SHA-256 is `e7838c5949f6d44aa45719613541116257cbe08200b60dc6c3cfe76dce2b92ee`.

## Execution identity and limits

Saved local-04 `official.json` and `probe.json` each record child exit code **1**. `official.stdout` reports **1 of 56 tests failed**, specifically `#parse parses plain objects correctly`, with `TypeError: source.hasOwnProperty is not a function` and top qs frame `/case/lib/utils.js:47:20`. The probe records the same native TypeError and top qs frame after loading `/case/index.js` and passing its unaffected control. The pinned buggy `payload-buggy/lib/utils.js` line 47 is literally `if (source.hasOwnProperty(i))`. The reviewed runbook's two buggy failure-identity checks now require line 47, matching the preserved source and raw outputs. The container/supervisor exit code **0** means it finished collecting child results; it does **not** mean the official suite passed. The runbook separately requires buggy child exits 1, while its fixed role requires both child exits 0.

The raw official and probe stdout SHA-256 values, matching `artifact-sha256.json`, are `783cd3395c5e94905c24546568ae397f6e8b00d734889217f161d92c60f82297` and `b2ab650eae709cbec212b881f7bbdf9e5a4b36a9577c858ab436d7c5741a1a26`. The evidence demonstrates genuine historical buggy execution, not fixed-revision success. No Docker execution, resource-isolation retest, or fixed-side result occurred in this QA. The next run must preserve a new run ID, collect both real upstream roles, and undergo independent Gate B review before any PASS or external-runner work.
