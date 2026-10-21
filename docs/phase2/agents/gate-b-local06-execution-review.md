# Gate B local-06 independent execution review

**Decision: Gate B PASS for the authentic buggy/fixed paired reproduction only.** This decision is based on the new raw official TAP, probe, provenance, command, and Docker evidence under `work/phase2/gate-b-runs/qs33-gateb-local-06`. It does not accept the external ReplayKit runner: the decoy/alternate matrix, independent evaluator decision, and ten-run determinism evidence remain outstanding. The runbook's `PARTIAL`, `gateBAccepted: false`, and `evidenceCollectionCompleted: true` fields are consistent with that narrower decision. I did not run Docker or edit source.

## Raw artifacts and pinned inputs

- Recomputed SHA-256 and byte length for every one of the 370 entries in `artifact-sha256.json`; all matched. An independent enumeration of its scoped command, provenance, evidence, npm-log, and summary files also found exactly 370 files and no unlisted file.
- Actual Git `HEAD`/tree in the two saved source checkouts match the pins and provenance: buggy `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` / `bc14fed42a7b001e837dc8d6b8f5b67279c35a82`; fixed `6a97ad1d71d8a9069f5d6002cab3130752519ccb` / `88c578810719c82c08739d610ed8cfd0bce9cae8`. Raw fetch, ref, fsck, checkout, tree, blob, patch, and lock-validation command records completed successfully. `lab-lock-validation.json` records PASS, Lab 3.0.0, 18 packages, and lock SHA-256 `cb06631e8c6cb83e8199e3411184fabe674410427cf48b53dba7553f8cee750b`.
- Host payload inventories independently match the actual 357 files in each payload and both container `inputs-before.json` and `inputs-after.json`. The role payloads have identical paths and differ in SHA-256 only for `lib/parse.js`, `lib/stringify.js`, and `lib/utils.js`. Both complete `test/parse.js` copies and the saved official parse file have SHA-256 `be7137407c865b889674d1bb7a9a8317e8f605ff4ae189ef2a751feb0b9451a5`; the test-only patch is reversible in the recorded run.
- The copied runbook, adapter, probe, and TAP verifier match the reviewed source hashes: `4be0fbf690a2a70b25e2699cf1b7ac06d5f7a4c23c39459f1f14ca53d36f81ee`, `85731ef6b4a360b326bafd7eccf4447ffbafb0eb0f96303560f1d7bef39e1a73`, `1be6ecf9e72579e8b18079bdad2459263f377baf1a221ed17fe5dae1751ce696`, and `69e5af7c08917eb275ab88c8ae814489e2128d643ca5855e9277a04e2f80d21e`, respectively. Both payload copies of the adapter/probe match provenance. The installed Lab leak detector and TAP reporter match their predeclared SHA-256 pins `b4455470cb519a1a5189f8024a8c7b7e620435e5cd87cf494e98260626d8bb32` and `dcd8b9d6f8399e0a4c1ca942739ff972fba807b05313a16d29b6fe7ff150a0fa`.

## Official tests and supplementary probe

I parsed each raw `official.stdout` line independently of `official-per-test.json`. Each has exactly one `1..56` plan and one result for every ID 1–56 in order. All 56 titles are identical across roles; their independently recomputed ID/title digest is `7f780df5037cf1483a17ae488fd6c512692e55f665e65a142863716339c3d0f9`. Buggy has 55 `ok` and only `not ok 40 parse parses plain objects correctly`; fixed has 56 `ok`. Both raw footers exactly match those counts with `# skipped 0` and `# todo 0`. No result is marked SKIP or TODO. The buggy official output carries `TypeError: source.hasOwnProperty is not a function` and `at exports.clone (/case/lib/utils.js:47:20)`; no other official test fails.

Each raw official stderr has one `gate-b-lab-adaptation` marker naming precisely `queueMicrotask`, `structuredClone`, `atob`, `btoa`, `performance`, `fetch`, `navigator`, `crypto`, and one `gate-b-lab-leaks:{"remaining":[]}` marker. The official child argv in both roles is the same unfiltered Lab TAP command with the pinned preloader and no `-l` flag. Its exits are buggy 1 and fixed 0, with no timeout, signal, or launch error.

The raw probe outputs show `/case/index.js` and the passing unaffected direct control in both roles. Buggy probe exit is 1; its error event and raw stderr carry the exact native TypeError message and top application frame `exports.clone (/case/lib/utils.js:47:20)`. Fixed probe exit is 0; it has no error, its `issue33-output` serializes exactly as `{"a":{"b":"c"}}`, and its structural assertion event passes. The buggy native library failure is therefore distinct from a probe assertion.

## Runtime, isolation, cleanup, and report

Both raw container inspections show the pinned Node image digest, `--network none`, UID/GID 1000, `/case` working directory, read-only root, all capabilities dropped, no new privileges, bounded CPU/memory/PIDs, no host bind, one private local `/case` volume with `NoCopy`, and the bounded `/tmp` tmpfs. Both runtime records observe Node v22.23.3 and `/usr/bin/timeout` as PID 1 with `--signal=KILL 29s`. Containers reached terminal exit 0 without OOM or attach timeout; measured lifetimes were 7,454.5379 ms (buggy) and 3,337.047 ms (fixed), within the 30-second contract.

The 101 command records contain 93 successful exits and eight expected exit-1 checks (two detached HEAD checks, two fresh-volume absence checks, and four post-removal absence checks), with no command timeout or launch error. Exact owned container and volume removal/absence is confirmed for buggy before fixed volume creation, and again for fixed. Both roles' cleanup flags are true. The report's summary SHA-256 matches the actual `GATE_B_SUMMARY.md`; the summary includes the full raw buggy probe stdout and stderr. `git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts` exited 0, so protected R1 files are unchanged.

## Read-only review commands and exits

| Command/check | Exit | Observed result |
| --- | ---: | --- |
| PowerShell loop over `artifact-sha256.json`: recompute size/SHA-256 and compare scoped file enumeration | 0 | 370 manifest entries = 370 actual files; zero mismatches |
| Independent `node -` raw TAP/marker parser | 0 | 56 IDs per role, only buggy ID 40 fails, equal titles, exact footers, no skips/TODOs or remaining leaks |
| `git -C source-buggy rev-parse HEAD 'HEAD^{tree}'` and fixed equivalent | 0 each | Exact pinned heads and trees above |
| Independent `node -` payload inventory/role-diff check | 0 | 357 files per role equal host/before/after; only three production files differ |
| Independent `node -` probe-event/raw-stderr check | 0 | Buggy native error and fixed structural output confirmed |
| Independent `node -` raw inspect/watchdog/child/cleanup/summary check | 0 | Both roles meet isolation, timing, sequence, cleanup, and report consistency |
| `git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts` | 0 | Protected R1 files unchanged |

No blocking finding remains for the authentic paired reproduction. Its PASS applies to this local-06 pair alone.
