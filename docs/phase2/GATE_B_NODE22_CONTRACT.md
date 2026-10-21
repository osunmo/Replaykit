# Gate B local-06 predeclared evidence contract

This contract is fixed before running `qs33-gateb-local-06`. If an assertion
fails, the run is BLOCKED or PARTIAL and its raw evidence is preserved. Do not
change these expectations in response to local-06 output. The previous
`qs33-gateb-local-05` run remains untouched and did **not** pass Gate B.

## Source and runtime

| Item                      | Pinned value                                                                   |
| ------------------------- | ------------------------------------------------------------------------------ |
| Upstream buggy qs         | `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725`                                     |
| Upstream fixed qs         | `6a97ad1d71d8a9069f5d6002cab3130752519ccb`                                     |
| Node image                | `node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392` |
| Lab dependency            | exact `3.0.0`, verified npm lockfile, registry origin, and integrity           |
| Lab leak detector SHA-256 | `b4455470cb519a1a5189f8024a8c7b7e620435e5cd87cf494e98260626d8bb32`             |
| Lab TAP reporter SHA-256  | `dcd8b9d6f8399e0a4c1ca942739ff972fba807b05313a16d29b6fe7ff150a0fa`             |

The frozen local collector files for this attempt are:

| File                                       | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `scripts/phase2/run-gate-b.ps1`            | `4be0fbf690a2a70b25e2699cf1b7ac06d5f7a4c23c39459f1f14ca53d36f81ee` |
| `scripts/phase2/gate-b-probe.cjs`          | `1be6ecf9e72579e8b18079bdad2459263f377baf1a221ed17fe5dae1751ce696` |
| `scripts/phase2/gate-b-lab-adaptation.cjs` | `85731ef6b4a360b326bafd7eccf4447ffbafb0eb0f96303560f1d7bef39e1a73` |
| `scripts/phase2/verify-gate-b-tap.mjs`     | `69e5af7c08917eb275ab88c8ae814489e2128d643ca5855e9277a04e2f80d21e` |

Lab 3.0.0 has no selective leak-ignore CLI. Its `-l` switch disables leak
detection altogether and is forbidden for this run. The official child in
**each** role starts with the same `--require /case/gate-b-lab-adaptation.cjs`
preloader and runs the complete, unfiltered upstream suite using Lab's TAP
reporter. The preloader snapshots the values and own property descriptors of
exactly these eight Node 22 globals before loading the suite:

`queueMicrotask`, `structuredClone`, `atob`, `btoa`, `performance`, `fetch`,
`navigator`, `crypto`.

It requires Lab's initial detector output to contain exactly those names. At
suite completion it suppresses a listed name only if its value and descriptor
are unchanged, retains every unrelated leak, and adds any changed listed name
that Lab's value-based scan missed. An unexpected remaining leak fails the
host validation even if the buggy suite already exited 1 for its test failure.
The preloader emits the exact allowance and remaining leak names to the raw
official stderr, and the host records their validation. The validated adapter
and its SHA-256 are copied into each run's provenance before either role starts.

## Predeclared expected results

| Check                                   | Buggy                                                                                                                | Fixed                                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Full official TAP plan and result lines | 56 unique IDs, 1–56                                                                                                  | Same 56 IDs and titles                                                                                                  |
| Official per-test outcomes              | 55 pass; only ID 40, `parse parses plain objects correctly`, fails                                                   | All 56 pass                                                                                                             |
| Official TAP footer                     | tests 56, pass 55, fail 1, skipped 0, todo 0                                                                         | tests 56, pass 56, fail 0, skipped 0, todo 0                                                                            |
| Official child exit                     | 1                                                                                                                    | 0                                                                                                                       |
| Official native error                   | `TypeError: source.hasOwnProperty is not a function`, `at exports.clone (/case/lib/utils.js:47:20)`                  | No failing test                                                                                                         |
| Supplementary probe                     | Control passes; issue-33 parse throws native `TypeError` with top qs frame `/case/lib/utils.js:47` and child exits 1 | Control passes; issue-33 parse does not throw, `JSON.stringify(output)` is exactly `{"a":{"b":"c"}}`, and child exits 0 |
| Lab leak result                         | No remaining or changed globals beyond the exact allowance                                                           | Same                                                                                                                    |

The probe requires `/case/index.js`, executes actual upstream production code,
and checks the structural JSON output. It does not compare object prototypes.
An assertion thrown by the probe itself is not accepted as the buggy library
error. The host requires the buggy top application frame and the official
regression stack separately. The TAP validator rejects duplicate/missing
results, skips, TODOs, unexpected failures, inaccurate footer counts,
different test identities across roles, or missing adaptation markers.

The existing source, dependency, inventory, Docker isolation, nonroot,
read-only root, offline network, independent PID 1 watchdog, timeouts, raw
transport, artifact hashes, and exact-owned-resource cleanup requirements
remain in force. `GATE_B_SUMMARY.md` is written to the new run directory and
printed as the script's sole stdout output; progress goes to stderr. The
summary includes the raw buggy probe stdout and stderr. Exit 0 means evidence
collection completed for independent review, not Gate B acceptance. The
external runner remains blocked until both raw roles are reviewed.
