# ReplayKit Phase 2 end-of-phase report

Recorded 2026-10-19 UTC. Gate A passed for the permitted qs issue-33
provenance. The pinned pair is buggy parent
`360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` and fixed commit
`6a97ad1d71d8a9069f5d6002cab3130752519ccb`; the saved fix metadata records the
sole-parent relationship and the saved diff includes the complete official
plain-object regression.

Gate B is **BLOCKED before execution**. The delegated execution agent preserved
raw artifacts under `work/phase2/reproduction/` and reported:

| Command | Exit/result |
| --- | --- |
| `python work/phase2/reproduction/prepare.py` | 1; DNS failure acquiring pinned parent metadata |
| `docker version --format '{{json .}}'` | 1; Docker named-pipe permission denial |
| `docker info --format '{{json .}}'` | 1; Docker named-pipe permission denial |
| `docker ps -a --no-trunc --format '{{json .}}'` | 1; Docker named-pipe permission denial |
| `docker image inspect node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392` | 1; Docker named-pipe permission denial |
| `npm.cmd --version` | 0; 10.9.0, identity check only |
| two escalated read-only Docker retries | not executed; automatic approval review capacity failure |
| `python work/phase2/reproduction/finalize-blocked.py` | 0; artifact preservation and hash inventory |

Neither upstream revision, the official Lab suite, nor any Docker workload ran.
No resources were created, no R1 file changed, and no runner/normalizer was
implemented. The raw streams, prepared probe and official test bytes, license,
and `artifact-sha256.json` remain available under `work/phase2/reproduction/`.

Gate B therefore has no actual buggy/fixed output or production exception
frame and cannot pass. The approved next action is to restore the Docker/network
access path and rerun this same sequential bounded pair. Until then, Gate C,
runner implementation, alternate/decoy work, and the full matrix stay blocked.

## Local runbook handoff

The restored local path is now captured by
`scripts/phase2/run-gate-b.ps1`, reviewed at SHA-256
`516645b9ec08ca0c153baac605dc3aa90b4fb337bd35f1cde614abff784d6320`.
Independent review approved it for static handoff after resolving read-only
`/case` staging and Docker-client-only timeout findings. No Docker or upstream
execution was performed by Codex during this implementation or review.

Run from a normal Windows PowerShell terminal at repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\phase2\run-gate-b.ps1 -RunId qs33-gateb-local-01
```

This command collects evidence only. Exit 0 is not Gate B acceptance. The lead
must inspect the raw buggy/fixed outputs and independent evidence before any
runner implementation.

## Checkout repair

The first local run's bare repository had the pinned objects but no persistent
refs: `show-ref` was empty, `FETCH_HEAD` was populated, cloning warned that the
repository was empty, and checkout exited 128. The repaired script creates and
verifies `refs/heads/gateb-buggy` and `refs/heads/gateb-fixed`, checks commit and
tree objects in the bare repository and each independent `--no-hardlinks` clone,
then asserts detached full-SHA HEAD. The companion local Git regression test is
preserved under `work/phase2/git-fetch-bare-tests/`; its Codex-sandbox attempt
stopped at Git fetch exit 128 before its assertions because Git/MSYS could not
create a `BaseNamedObjects` object. Independent review approved the repair for
static handoff, but this remains no runtime Gate B evidence.
