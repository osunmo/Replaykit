# Gate B local PowerShell runbook

This runbook is the reviewed evidence collector for the pinned qs issue-33
candidate. It is intended to be run by the user from a normal Windows terminal,
outside Codex's restricted sandbox. It does not implement ReplayKit's external
runner or issue a VERIFIED verdict.

Reviewed script: `scripts/phase2/run-gate-b.ps1`

Current local-06 collector SHA-256:
`4be0fbf690a2a70b25e2699cf1b7ac06d5f7a4c23c39459f1f14ca53d36f81ee`

The exact Node 22 adaptation and result expectations were fixed before this
attempt in [GATE_B_NODE22_CONTRACT.md](GATE_B_NODE22_CONTRACT.md).
The authentic paired local-06 execution has since passed its independent
[Gate B decision](GATE_B_DECISION.md) for the reproduction only.

The saved-manifest regression is `scripts/phase2/test-inventory.ps1`, SHA-256
`e7838c5949f6d44aa45719613541116257cbe08200b60dc6c3cfe76dce2b92ee`.
Its independent review is `docs/phase2/agents/gate-b-inventory-qa.md`.

The local isolation regression is `scripts/phase2/test-docker-binds.ps1`,
SHA-256 `4c21f24d1ec2ed71218c43cd31b23928053bf6c3e3aa9cae8d40bbd076894c0d`.
Its independent review is `docs/phase2/agents/gate-b-bind-qa.md`.
That reviewer approved these exact hashes for a fresh local collection attempt
only, after checking the saved local-03 Docker inspect and volume records.

The fixed Node JSON validator is `scripts/phase2/validate-gate-b-lock.mjs`,
SHA-256 `31dbce23fa31b3af3ffeae8b0cb15db8a8dcb49aedf178e3381aec7a4adcc566`.
Its regression test is `scripts/phase2/test-lockfile-json.mjs`, SHA-256
`611d0c58c439fa1d2276a55eff6469a09993728f7fd017f830fc9f5daca2c812`.

The companion local regression test is
`scripts/phase2/test-git-fetch-bare.ps1`, SHA-256
`1a703aab71ae1de894ad11b136422dd98a8895c5d31e49c78bc24985159a23be`.

Pinned revisions:

| Role  | Commit                                     |
| ----- | ------------------------------------------ |
| Buggy | `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` |
| Fixed | `6a97ad1d71d8a9069f5d6002cab3130752519ccb` |

The script fetches and verifies the exact upstream Git objects, creates durable
`refs/heads/gateb-buggy` and `refs/heads/gateb-fixed` refs, checks both commit
and tree objects, and uses independent `--no-hardlinks` clones with clone-local
object checks before detached full-SHA checkout. It applies only the
saved official regression patch to the buggy tree, freezes the same complete
test/probe/dependency bytes, and records source and payload inventories. It
prepares Lab outside the offline containers with lifecycle scripts disabled.
Each role runs sequentially against the pinned Node image digest with network
disabled, nonroot execution, read-only root, dropped capabilities,
no-new-privileges, CPU/memory/PID limits, a private labeled staging volume, and
an independent native PID 1 watchdog. It preserves raw official and probe
streams, container inspection, exit/signal/OOM/deadline state, hashes, and exact
owned-resource cleanup. No host source bind mount or global Docker cleanup is
used.

The prior independent review approved the Git checkout repair at its recorded
hash. The lockfile parser change has a separate independent QA report at
`docs/phase2/agents/gate-b-lock-qa.md`. Static review only makes this collector
ready for another local run; Gate B still requires inspection of genuine buggy
and fixed upstream execution outputs and an independent acceptance decision.
That QA report approved these exact script and validator hashes for a fresh
collection attempt and found no critical repair defect.

The preserved first attempt demonstrated that the bare object database had the
commits and trees but no persistent refs: `show-ref` was empty, the clone warned
that the repository was empty, and checkout failed with `reference is not a
tree`. The repair note is [GIT_FETCH_REPAIR.md](GIT_FETCH_REPAIR.md). The local
synthetic regression is included, but its Codex-sandbox execution stopped at
Git fetch exit 128 before its assertions; that is not a repair pass.

The second local attempt, `qs33-gateb-local-02`, passed source preparation and
the npm `lab-lock` and `lab-ci` commands (both exit 0). It stopped before any qs
execution: `report.json` is BLOCKED with zero role executions. Its generated
`lab-bundle/package-lock.json` is npm lockfile version 3 and contains the
standard empty root package key `packages[""]`. Windows PowerShell 5.1
`ConvertFrom-Json` rejects that property name. The original lockfile has
SHA-256 `cb06631e8c6cb83e8199e3411184fabe674410427cf48b53dba7553f8cee750b`;
it and the old run remain untouched.

The replacement uses the fixed validator copied into each run's provenance and
invoked through the command recorder. It parses JSON data with strict UTF-8,
checks the exact Lab pin against registry metadata, validates every nonroot
package's integrity and registry origin, and requires the root package identity
and dependency pin. It accepts the empty root key and keeps JSON keys case
sensitive. It emits only a deterministic status/count/lock-hash JSON summary or
a fixed error code; it does not evaluate lockfile content or print package values
or credential-bearing URLs. A nonzero result aborts collection. The raw lockfile,
validator copy, validation command, and summary are preserved and hashed.

All other `ConvertFrom-Json` calls were audited for this empty-key issue:

| Input                                                                                   | Calls                                   | Empty-name compatibility assessment                                                                                                                                                                              |
| --------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pinned upstream `package.json`; Lab registry metadata                                   | Upstream package and metadata reads     | The exact saved local-02 bytes converted successfully in PowerShell 5.1; neither has the npm lockfile `packages[""]` shape.                                                                                      |
| Docker container/volume/image inspect                                                   | Ownership, image, recovery checks       | Docker metadata can contain map-valued fields; no post-lock inspection output exists in local-02. An unexpected empty key would block collection and acceptance.                                                 |
| Artifact transport frames; input inventories; runtime/official/probe records and events | Evidence recovery and role verification | These are emitted by the fixed supervisor/probe with named fields. Inventory paths and probe values are strings or arrays, not JSON object keys sourced from the lockfile. Conversion failure blocks acceptance. |

The Node helper changes only the lockfile parse and validation path. The pinned
upstream revisions, source checks, private volumes, PID 1 watchdog, timeouts,
network isolation, artifact hashes, and exact-owned-resource cleanup are
unchanged. R1 judge/planner/contracts and prior Gate B evidence are unchanged.

The third local attempt, `qs33-gateb-local-03`, reached Docker container
inspection but stopped before copying inputs or executing qs. Its report is
BLOCKED with zero role executions. The saved pre-start inspect has
`HostConfig.Binds = null`; PowerShell evaluates `@($null).Count` as 1, so the
old zero-bind assertion raised `Unexpected container bind mount`. The same
inspect shows one configured and resolved writable named `/case` volume with
`NoCopy = true`, offline networking, read-only root, nonroot user, limits, and
the native PID 1 watchdog. The volume inspect has the matching exact name and
ownership labels. The preserved report SHA-256 is
`a43a3328683cfa421a108c5ee4db741a014f43d348f6c31b190b09bc7b0d888f`;
the pre-start inspect SHA-256 is
`43f576bc4c0bdbaac2ed0ab484d19ae08135f48e2ad12b7a89c772f87acbe18d`.

The revised assertion discards only null and empty bind entries before
counting; any nonempty bind still blocks collection. The review also tightened
the pre-copy isolation checks: `HostConfig.Mounts` must contain exactly the
approved named `/case` volume with `NoCopy = true`; the inspected volume must
carry the exact run token and role label; and `HostConfig.Tmpfs` may contain
only `/tmp` with the prior size and `noexec` requirements. Resolved mount,
read-only/offline/nonroot, resource, watchdog, evidence, and exact cleanup
checks remain in place. No previous run evidence was altered.

The fourth local attempt, `qs33-gateb-local-04`, ran the genuine pinned buggy
qs code. The official suite and reproduction probe both exited 1 with native
`TypeError: source.hasOwnProperty is not a function`; the official output says
1 of 56 tests failed and names `#parse parses plain objects correctly`.
Both raw streams identify `/case/lib/utils.js:47:20` in the actual buggy
source. The container exited 0 because its supervisor completed evidence
collection, not because the official suite passed. The run became PARTIAL
before the fixed role at the input-inventory comparison. No fixed-revision
execution exists, so Gate B remains blocked.

The preserved local-04 prepared, before, and after manifests each contain 356
files with identical paths, lengths, and SHA-256 values. Replaying the exact
old `Same-Inventory` under Windows PowerShell 5.1 reproduced its false
positive: the prepared argument had 356 entries while `@(ConvertFrom-Json)`
wrapped the observed array as one `Object[]` holding 356 entries. The old
function compared 356 rendered rows with one `System.Object[] ...` row.
Unwrapping that one array made the old function accept; PowerShell 7.6.5
accepted the original flat inputs. `Sort-Object` culture or case ordering was
not the cause. The repair normalizes only this wrapper, validates the exact
entry schema and types, rejects duplicate paths, and compares every path,
byte length, and hash using ordinal, case-sensitive keys. The two buggy
stack-frame assertions now require the actual pinned source line 47 rather
than stale line 46. All prior run artifacts are preserved.

The regression reads the actual saved manifests, pins their file hashes,
accepts prepared-versus-before and prepared-versus-after, and rejects changed
hashes, sizes, missing or extra files, changed path case, and duplicates on
both sides. It exited 0 on Windows PowerShell 5.1 and PowerShell 7.6.5. The
independent reviewer approved the exact script and test hashes above for a
fresh collection attempt only; see the QA report for the original replay,
raw child exits, and scope of review.

The fifth local attempt, `qs33-gateb-local-05`, executed both pinned upstream
revisions and remains PARTIAL. The buggy official suite reported 1 of 56 tests
failed, test 40 `#parse parses plain objects correctly`, with the native
`TypeError: source.hasOwnProperty is not a function` and actual top qs frame
`/case/lib/utils.js:47:20`. Its probe reported the same TypeError and child
exit 1. The fixed official suite completed all 56 tests, but its child exit
was 1 solely because Lab 3.0.0 flagged eight Node 22 built-ins as global
leaks. The fixed probe produced JSON `{"a":{"b":"c"}}`, but the old
`deepStrictEqual` assertion rejected the nested null prototype, also exiting

1. Neither fixed child satisfied the Gate B pass criteria, so the runbook
   stopped with `Fixed official suite or probe failed`. The raw local-05 evidence
   is preserved and not reused as a passing pair.

Lab 3.0.0 has no selective leak-ignore CLI; `-l` would disable all leak
detection and is not used. The predeclared adaptation wraps Lab's detector for
exactly the eight unchanged Node 22 globals seen in local-05, while retaining
or adding changed/unrelated leak names. Both roles use the same pinned Node
image and the same adaptation bytes. The probe now checks structural JSON
output without comparing prototypes. The official suite emits TAP records for
all 56 test IDs; the host validates each outcome, zero skips/TODOs, the exact
buggy regression, the fixed passes, and matching test identities. The script
writes `GATE_B_SUMMARY.md` and prints that file on stdout; progress uses stderr.

The completed local-06 run used this command from the repository root in a
normal Windows PowerShell terminal. Its run ID is now occupied; do not rerun it:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\phase2\run-gate-b.ps1 -RunId qs33-gateb-local-06
```

The command writes a new run directory under
`work/phase2/gate-b-runs/qs33-gateb-local-06/`. It refuses to overwrite an
existing run. Preserve `report.json`, `artifact-sha256.json`, the `commands/`
records, both role evidence directories, and all raw stdout/stderr. Exit 0
means collection completed for independent review; it is not a Gate B pass.
Exit 1 means collection is blocked or partial. The run artifacts are preserved.
The lead and an independent QA reviewer have now examined the actual pair; see
the scoped [decision](GATE_B_DECISION.md).

Local-06 exited 0 after collecting both roles sequentially. Buggy official and
probe children each exited 1 with the native qs `TypeError` and top production
frame `/case/lib/utils.js:47:20`; its official TAP had 55 passes and only test
40 failing. Fixed official and probe children each exited 0, with 56 official
passes, zero skips/TODOs, and the exact structural probe JSON. The official
test identities match. The exact eight-globals Lab adaptation was applied
equally to both roles, and both reported zero remaining leaks. The summary
file was written and printed, with full raw buggy probe stdout and stderr.
The independent execution review checked all 370 artifact hashes, raw per-test
results, provenance, Docker isolation, resource limits, and cleanup. The
collector's `PARTIAL` status records that it could not self-approve before
independent review; the separate decision records Gate B PASS for this paired
reproduction only. No general runner or external VERIFIED claim follows from
this result.

Available static and local checks on the parser repair:

| Check                                                                                           | Result                                                                                   |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Windows PowerShell 5.1 AST parse                                                                | Exit 0; 0 parse errors                                                                   |
| PowerShell 7 AST parse                                                                          | Exit 0; 0 parse errors                                                                   |
| `node --check` on validator and test                                                            | Both exit 0                                                                              |
| Lockfile regression (empty key, case, malformed input, integrity, origin, secrecy, determinism) | Exit 0                                                                                   |
| Validator against saved local-02 lockfile and metadata integrity                                | Exit 0; PASS, 18 packages; lock hash above                                               |
| Validator invoked from Windows PowerShell 5.1 and PowerShell 7                                  | Both exit 0; identical deterministic JSON and lock hash                                  |
| `pnpm token:scan` in the Codex sandbox                                                          | Exit 1 before scanning: `EPERM` resolving repository `node_modules`; no clean-scan claim |
| `git diff --check`; protected R1 file diff                                                      | Both exit 0                                                                              |

Docker isolation repair checks: the production bind assertion failed the new
regression on the prior script (PowerShell 5.1 exit 1 for null Binds), then the
updated regression passed on PowerShell 5.1 and 7 (exit 0 each). It accepts
null/empty bind configurations and rejects unauthorized binds, extra mounts,
missing `NoCopy`, extra tmpfs, and wrong volume role labels. Both PowerShell
parsers report zero errors on the updated script and test. No Docker command was
run from Codex for this repair.

Codex did not run Docker for this repair. The local-02 attempt fetched upstream
code and acquired dependencies, but executed neither qs role. It is not Gate B
execution evidence. Earlier artifacts remain preserved and are not reused as
measured results.
