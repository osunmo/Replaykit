# Gate B decision — qs #33 local-07

**PASS for the authentic pinned buggy/fixed paired reproduction only.** The
collector exited 0 after both sequential roles, and an independent reviewer
verified the raw artifacts. This decision does not accept an external runner,
matrix results, an evaluator decision, determinism, or an R1 VERIFIED result.

The predeclared [Node 22 contract](GATE_B_NODE22_CONTRACT.md) was written before
these runs. It allowed precisely eight unchanged Node 22 globals in Lab 3.0.0,
retained detection for changed or unrelated globals, and prohibited Lab's `-l`
switch. The same pinned image, adapter, official suite, and probe conditions
were used for both upstream revisions. The probe required a nonthrowing fixed
parse whose JSON serialization is exactly `{"a":{"b":"c"}}`; it did not
compare prototypes.

Execution command from the repository root in ordinary Windows PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\phase2\run-gate-b.ps1 -RunId qs33-gateb-local-07
```

The command exited **0** and wrote and printed
[`GATE_B_SUMMARY.md`](../../work/phase2/gate-b-runs/qs33-gateb-local-07/GATE_B_SUMMARY.md).
The summary's `PARTIAL` and `gateBAccepted: false` fields were recorded by the
collector before independent review. They were not changed after the run. This
decision records the subsequent review; no predeclared acceptance rule was
loosened.

| Evidence                       | Buggy `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725`                             | Fixed `6a97ad1d71d8a9069f5d6002cab3130752519ccb` |
| ------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| Container collector exit       | 0                                                                            | 0                                                |
| Official Lab child exit        | 1                                                                            | 0                                                |
| Official TAP                   | 56 tests: 55 pass, only ID 40 fails; 0 skip/TODO                             | Same 56 IDs/titles: 56 pass; 0 skip/TODO         |
| Supplementary probe child exit | 1; native `TypeError: source.hasOwnProperty is not a function`               | 0; no throw, exact JSON `{"a":{"b":"c"}}`        |
| Library top frame              | `at exports.clone (/case/lib/utils.js:47:20)` in official and probe evidence | No error                                         |
| Lab leak detector              | Exact eight predeclared unchanged globals ignored; remaining `[]`            | Same                                             |

The buggy probe's full raw
[`stdout`](../../work/phase2/gate-b-runs/qs33-gateb-local-07/evidence-buggy/probe.stdout)
and
[`stderr`](../../work/phase2/gate-b-runs/qs33-gateb-local-07/evidence-buggy/probe.stderr)
are preserved and reproduced in the summary. Its stdout shows the module
`/case/index.js`, a passing unaffected control, and the issue-33 `TypeError`.
Its stderr begins:

```text
TypeError: source.hasOwnProperty is not a function
    at exports.clone (/case/lib/utils.js:47:20)
    at exports.clone (/case/lib/utils.js:48:31)
    at module.exports [as parse] (/case/lib/parse.js:141:89)
```

Raw official [`buggy`](../../work/phase2/gate-b-runs/qs33-gateb-local-07/evidence-buggy/official.stdout)
and [`fixed`](../../work/phase2/gate-b-runs/qs33-gateb-local-07/evidence-fixed/official.stdout)
TAP, their stderr and per-test JSON, command records, Docker inspections, input
inventories, and source provenance are under the same run directory. The
official test identity digest is identical across roles:
`7f780df5037cf1483a17ae488fd6c512692e55f665e65a142863716339c3d0f9`.
Both 357-file payloads equal their before/after container inventories. Only
three production files differ between roles (`lib/parse.js`, `lib/stringify.js`, `lib/utils.js`).
The 370-entry artifact manifest matched every saved file and contained no unlisted scoped artifact.
The summary hash is `93f1fd575aedd66d1e32bd6bccb8fa4e74a7123ed4a97b0ee12c835f50201e52`.

The independent [execution review](agents/gate-b-local07-execution-review.md)
reparsed raw TAP and probe streams and checked source heads/trees, dependency
integrity, isolation, watchdog, cleanup, and artifact hashes. All of its
read-only checks exited 0. The frozen collector SHA-256 was
`4be0fbf690a2a70b25e2699cf1b7ac06d5f7a4c23c39459f1f14ca53d36f81ee`;
the probe, adapter, and TAP verifier hashes remain pinned in the predeclared
contract. Protected R1 files have no diff (`git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts` exited 0).

Gate C runner implementation may be considered from this point, subject to its
own independent evaluator and matrix gates. No general external runner was
implemented or accepted as part of this decision.
