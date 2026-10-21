# Gate B bare-fetch repair

Date: 2026-10-18 America/Chicago (2026-10-19 UTC).

The preserved `work/phase2/gate-b-runs/qs33-gateb-local-01/` run stopped before
upstream checkout. Its `commands/015-buggy-local-clone.stderr` records
`warning: You appear to have cloned an empty repository.` Its
`commands/016-buggy-checkout.stderr` records
`fatal: reference is not a tree: 360e2b0b48548b9bfdb71f8c82a68c4f34ec0725`.

The bare repository contains both approved commit objects and their trees, but
`show-ref` returns exit 1 with no refs. `FETCH_HEAD` names the last fetched fixed
commit. Fetching a SHA alone does not create a persistent branch ref. The clone
therefore did not discover a referenced source history. Having the objects in
the acquisition repository did not establish their availability in the clone.
This was a source-preparation defect, not evidence about qs behavior or Docker.
The failed run and its raw evidence remain unchanged.

`scripts/phase2/run-gate-b.ps1` now creates `refs/heads/gateb-buggy` and
`refs/heads/gateb-fixed` after both exact fetches. It records and verifies each
ref with `show-ref` and `rev-parse`, verifies commit/tree object types in the bare
repository, and creates independent `--no-hardlinks --no-checkout` clones.
Each clone must have no alternates file, contain its exact commit/tree objects
before checkout, and finish with the approved full SHA at detached HEAD. The
existing source hashes, official patch/control identity checks, pinned versions,
container settings, native watchdog, raw evidence and exact cleanup remain.

`scripts/phase2/test-git-fetch-bare.ps1` is a standalone Git-only regression.
It creates two synthetic commits and fetches them by SHA into an unreferenced
bare repository. It requires an empty-clone warning and failed pre-fix checkout,
then adds the two named refs and requires successful independent detached
checkouts. Every Git invocation preserves stdout/stderr/exit status. All repos
and logs remain inside a new result directory; no prior evidence is reused.
The default repository location is the result directory's `repos/` subdirectory.

Local execution attempts:

- Windows PowerShell 5.1 without an execution-policy override exited 1 before
  executing the test (`AuthorizationManager check failed`). No machine or user
  execution policy was changed.
- The process-scoped `-NoProfile -ExecutionPolicy Bypass` invocation started the
  original test with OS-temp repos. It exited 1 at seed initialization because
  Git could not write HEAD. The failed result is preserved at
  `work/phase2/git-fetch-bare-tests/20261019T045635Z-b27337df/result.json`.
- After moving the default private repos under the result directory, the command
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/phase2/test-git-fetch-bare.ps1 -ResultDirectory work/phase2/git-fetch-bare-tests/git-bare-workspace-01`
  created both synthetic commits and exited 1 during the first local fetch.
  Git fetch exited 128 because sandboxed `sh.exe` could not create its MSYS
  `BaseNamedObjects` object (`0xC0000022`). Complete logs and the failed result
  remain at that result directory. This attempt does not claim a passing
  regression or an observed pre-fix/post-fix comparison.
- An escalation request was not executed because automatic approval review
  could not complete while its selected model was at capacity. This was a
  review failure, not a determination that the local test was unsafe. No
  alternative was used to bypass approval.

The remaining verification is an approved normal-shell execution of the local
Git test, followed by separate user-authorized Gate B execution using a fresh
run ID. This repair did not run Docker, npm, the Gate B runbook, or any qs code.
It does not accept Gate B or produce a VERIFIED claim.

Static checks completed after the repair:

- Actual Windows PowerShell 5.1.26100.9444 AST parsing: both scripts had zero
  errors; parser command exited 0.
- PowerShell 7.6.5 AST parsing: both scripts had zero errors.
- `node --check` on both extracted runbook JavaScript programs: exit 0 each;
  syntax checking did not execute either program.
- `git diff --check`: exit 0. The newly added files also received a full-file
  trailing-whitespace scan because untracked files are absent from Git diffs.
- Read-only inspection of the preserved bare repository: `show-ref` exit 1
  without refs; `cat-file -t` returned `commit` and `tree` for each pin with exit
  0; `rev-parse FETCH_HEAD` returned the approved fixed SHA with exit 0.
