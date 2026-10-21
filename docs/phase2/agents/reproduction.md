# Gate B upstream reproduction — BLOCKED

Recorded 2026-10-19 04:20 UTC (2026-10-18 America/Chicago).
Gate B did not pass. Neither pinned upstream revision executed, the official
Lab suite did not run, and no exception or production frame was observed.
The external runner implementation remains blocked pending a passing Gate B.

## Scope and pinned inputs

Baseline repository HEAD was read as
`15647d5fd9172eddaef84a40f82fd34c42830c4b`; initial Git status contained
only the existing untracked `docs/phase2/` directory. This task touched only
this report and `work/phase2/reproduction/`. No commit was created. No
`packages/`, evaluator/contracts, or R1 files were changed. No completed agent
was restarted or contacted. No restricted research, advisories, or exploit
material was requested.

The bounded correctness candidate remains qs issue 33:

- Buggy: `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725`.
- Fixed: `6a97ad1d71d8a9069f5d6002cab3130752519ccb`.
- Saved fixed-commit metadata names the buggy SHA as its sole parent and
  tree `88c578810719c82c08739d610ed8cfd0bce9cae8`.
- Required runtime:
  `node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392`.
  This digest was supplied by the lead; this agent could not inspect its local
  image identity. No other image was substituted.

All paths below are relative to the repository. Artifact paths without another
prefix are under `work/phase2/reproduction/`.

## Actual commands and failures

The exclusive heavy-workload lease was claimed before preparation. No Docker
workload, dependency install, benchmark, or R1 smoke was started.

| Command | Actual result | Evidence |
| --- | --- | --- |
| `python work/phase2/reproduction/prepare.py` | Exit 1 during first source-metadata download; preparation incomplete | `prepare.py`; `access-failures.md`; child-command records below |
| `docker version --format '{{json .}}'` | Exit 1; client 29.8.1, server unavailable due to pipe denial | `docker-version.json`, `.stdout`, `.stderr` |
| `docker info --format '{{json .}}'` | Exit 1; pipe denial; default/zero fields are not daemon measurements | `docker-info.json`, `.stdout`, `.stderr` |
| `docker ps -a --no-trunc --format '{{json .}}'` | Exit 1; pipe denial; empty stdout is not proof of an empty inventory | `containers-before.json`, `.stdout`, `.stderr` |
| `docker image inspect node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392` | Exit 1; pipe denial | `image-inspect.json`, `.stdout`, `.stderr` |
| `C:\Users\sunmo\AppData\Roaming\npm\npm.cmd --version` | Exit 0; 10.9.0; identity check only | `npm-version.json`, `.stdout`, `.stderr` |
| Escalated `docker ps -a --no-trunc --format '{{json .}}'`, initial attempt | Not executed; automatic approval review failed | `access-failures.md` |
| Same read-only escalation, one lead-authorized bounded retry | Not executed; identical review failure | `access-failures.md` |
| `python work/phase2/reproduction/finalize-blocked.py` | Exit 0; copied existing permitted evidence as data and hashed artifacts | `finalize-blocked.py`, `blocked-status.json`, `artifact-sha256.json` |

The four sandbox Docker reads emitted the same raw stderr:

    permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine

Each stderr SHA-256 is
`f89815d4595407c5445b5cd4bec5a3d3279f8c9d3f4c7f63b9455a24fbbeeeed`.
Their JSON records include exact argv, process exit, start/finish timestamps,
and separate stdout/stderr hashes. The failed inventory's stdout is zero
bytes, SHA-256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

Both escalation attempts returned this tool status, rather than a process exit:

    Automatic approval review failed: Selected model is at capacity. Please try a different model.
    The action was not executed because automatic approval review could not be completed.
    This is a review failure, not a determination that the action is unsafe.
    Do not bypass the approval check; resolve the error or ask the user for guidance.

The exact metadata URL attempted by Python was:

    https://api.github.com/repos/ljharb/qs/commits/360e2b0b48548b9bfdb71f8c82a68c4f34ec0725

It failed with
`urllib.error.URLError: <urlopen error [Errno 11001] getaddrinfo failed>`.
No response body or archive was acquired. That traceback exists in the tool
output; `access-failures.md` preserves its terminal message as a transcription,
not a claimed raw-byte capture. The review failures likewise have no raw process
stream because no process started. No workaround or further escalation was used.

## Disk and Docker preservation

`disk-before.json` records C: free 15,904,694,272 bytes at
2026-10-19T04:18:36.891339Z. `blocked-status.json` records free
15,889,674,240 bytes at 04:20:00.998966Z. These are host measurements and do
not measure Docker's internal free space or attribute the difference to this task.

The lead's prior inventory identified three exited R1 containers with IDs
beginning `517d430f`, `6bb2f8f1`, and `0dbb9919`. This agent could not obtain
an exact independent pre-existing inventory or daemon identity. It issued no
Docker create/start/stop/remove/build/prune command and therefore left those
containers and all pre-existing Docker resources untouched.

Cleanup: no resources were created; no cleanup command was required or run.
The lease is released with this blocked report. Runtime inspection before/after,
OOM/signal/deadline state, container timing, exact runtime Docker argv and
post-cleanup inventories are unavailable because execution never began.

## Frozen reviewable artifacts

These hashes identify prepared data, not successfully executed evidence:

| Artifact | SHA-256 | Provenance / purpose |
| --- | --- | --- |
| `direct-probe.cjs` | `7912a89777fa2c67ef5195b9209da6a67043eb8ccecbc2126d9b7de010ef8db4` | Supplementary probe; unexecuted |
| `execution.sh` | `141ddc0a5847915f1148d908d968eeaafbf106b4f1281fe041f23841fd56538c` | Unexecuted shell commands for the bounded pair; not an external runner implementation |
| `official-parse.js` | `be7137407c865b889674d1bb7a9a8317e8f605ff4ae189ef2a751feb0b9451a5` | Byte-for-byte copy of permitted saved fixed `test-parse.js`, containing the complete upstream regression and unchanged parse tests |
| `official-regression.patch` | `76cd9fa01ecaf309f2c8bd4ea0f9e40ecb8ddba8a81189668eb1bc2973f11c27` | Exact test-file diff bytes sliced from saved `qs-33-fix.diff`; no regression rewritten |
| `LICENSE.qs` | `d2f9d2835eb09ccf673e118e4fdc372075437c1787e66c2202912fbe3e5ee9e1` | Actual complete BSD license bytes copied from saved fixed-revision evidence |
| `package.qs.json` | `bdc98f72801d1b0b84a2000e2ab9215c5ec1d0754975ae972923dacdb1aeb5ec` | Saved qs 2.2.1 manifest: CommonJS `index.js`, empty runtime dependencies, Lab `3.x.x` dev dependency |
| `Makefile.qs` | `561f1e818ad2e2f372f9394cb1811aa16ecaffc3678aa3e2866f562bae7dc022` | Saved official command `node node_modules/lab/bin/lab` |

`upstream-fix.diff` preserves the entire saved fix diff.
`lab3-package.registry.json` preserves the previously permitted Lab 3.0.0
registry metadata, including its declared integrity. It is not an installed or
integrity-verified dependency closure. `artifact-sha256.json` inventories every
prepared file other than the inventory itself, including scripts and raw logs.
`blocked-status.json` is the explicit machine-readable non-execution status.

The direct probe calls actual `require('./')`, logs `require.resolve('./')`,
asserts the unaffected `a[b]=c` control, and uses the upstream ordinary input
`Object.create(null)` with `b = 'c'`, passed as `{ a: a }`. It asserts the real
fixed output `{ a: { b: 'c' } }`. Its catch logs the original error object,
constructor/name, own properties and full existing stack without modifying the
error. It contains no role branch, expected exception throw, `Error.stack`
assignment, answer-key read, or replacement package shim. These are source
inspection facts; no module path, error, output or assertion result was measured.

## Unrun acceptance items and next prerequisite

Every execution acceptance item remains open:

- Complete immutable archives and tree/file hash verification for both pinned
  SHAs, including actual entrypoint bytes. Saved snippets are not complete trees.
- Full frozen official test tree and test inventory used identically in both roles.
- Pinned, integrity-checked Lab 3.x dependency closure prepared outside the
  offline containers. The intended install command in `prepare.py` was
  `npm.cmd install --ignore-scripts --no-audit --no-fund --save-exact` in
  `work/phase2/reproduction/lab-bundle` with an exact `lab: 3.0.0` manifest.
  This command was not reached and has no exit code. No package-manager
  lifecycle script or upstream code executed on the host.
- Actual official invocation `node node_modules/lab/bin/lab`, with the complete
  fixed suite and all unchanged tests, on buggy and then fixed production code.
  Node 22 compatibility is unknown; no official-suite pass or incompatibility
  is claimed. No homemade runner, filter, or test skip was substituted.
- Both fresh containers under the required digest, network none, nonroot user,
  read-only root, cap-drop ALL, no-new-privileges, 1 CPU, 256 MiB, 64 PIDs,
  30-second deadline, private workspace and no host bind mount or credentials.
  These are required future conditions, not inspected settings.
- Buggy real production failure and first production frame plus official
  regression failure with controls passing; fixed candidate/official success
  with controls passing and zero hidden skips or unrelated failures.
- Raw execution streams/hashes, same candidate/test identity in both roles,
  real loaded module path, exit/state/timing evidence and exact-name cleanup.

The next prerequisite is restored automatic approval review for the same
read-only Docker inventory and approved pinned-input acquisition. Resume this
bounded Gate B preparation only after that access is available; do not proceed
to the Phase 2 matrix, runner/normalizer implementation, or alternate/decoy fixes.
