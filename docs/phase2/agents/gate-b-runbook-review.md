# Gate B runbook review — Git fetch repair

Status: **APPROVED for static source readiness and user handoff**. The local regression remains **blocked**, not passing. This approval does not establish that the repaired checkout flow or Gate B has run successfully.

Reviewed current files:

| File | SHA-256 | Lines |
| --- | --- | --- |
| `scripts/phase2/run-gate-b.ps1` | `dd284da2a2d38195da1ed4d0734159304212ed7bd10b7e46e42d14fca4961b74` | 770 |
| `scripts/phase2/test-git-fetch-bare.ps1` | `1a703aab71ae1de894ad11b136422dd98a8895c5d31e49c78bc24985159a23be` | 155 |
| `docs/phase2/GIT_FETCH_REPAIR.md` | `4648a0c2f68b7258a24d6fa01c1bf3d17ca855ac6272533015f241d94901deb6` | 73 |

No critical or high-severity defect was found in the current repair. A normal-shell execution of the local regression is still required to measure its pre-fix failure and post-fix success. Do not represent this static approval as that result.

No Docker/upstream execution was performed by me. I did not invoke the Gate B script, fetch upstream sources, execute qs or Lab, install dependencies, retry restricted research, or modify the source files. I ran one standalone local synthetic Git regression and preserved its failure artifacts. No escalation or retry followed its sandbox failure.

## Findings and dispositions

**No remaining critical source findings.** The changes address the observed acquisition defect without weakening the previously reviewed Docker/evidence contract.

**Validation blocker: local regression exited 1 before its comparison assertions.** My attempt created two synthetic commits and the bare repository, then its first local fetch exited **128**. Raw stderr records Git's `sh.exe` failing `NtCreateDirectoryObject` under `BaseNamedObjects` with **0xC0000022**. The test correctly wrote `passed=false`, with no pre-fix checkout or role results. This is an environment failure before the assertions at test lines 113–141, not evidence that the repair works or fails.

Exact new result path: `work/phase2/git-fetch-bare-tests/independent-review-20261019-01/result.json`.

Exact failing command record and raw streams: `work/phase2/git-fetch-bare-tests/independent-review-20261019-01/10-bare-fetch-4b509d67.json`, `.stdout`, and `.stderr`. All synthetic repositories remain under that result directory's `repos/`. Commands 1–9 exited 0; command 10 exited 128; none recorded timeout or launch failure. Disposition: preserve the attempt and obtain a separately authorized normal-shell test execution. No code change is required solely because of this sandbox limitation.

## Repair audit

| Area | Evidence and assessment |
| --- | --- |
| Persistent refs | Runbook lines 263–279 create `refs/heads/gateb-buggy` and `refs/heads/gateb-fixed` after both pinned fetches. Both refs are checked using exact `show-ref --verify` output and full-SHA `rev-parse --verify` equality. This supplies persistent reachable history rather than treating the last `FETCH_HEAD` as a durable pair of refs. |
| Bare commit/tree checks | Lines 274–278 require each pinned object to have type `commit`, require its tree to exist, and require tree type `tree`. Exact fetched commit checks, raw commit records, fsck, and the fixed-parent equality remain at lines 256–282. |
| Independent clone | Line 297 replaces shared-object cloning with `clone --no-hardlinks --no-checkout`; line 298 rejects an alternates file. This avoids a dependency on acquisition-repository object storage. The named refs make both histories discoverable before each clone. |
| Accessibility before checkout | Lines 299–301 require the exact commit and tree inside the clone before checkout and save the tree SHA. A successful acquisition-repository check cannot substitute for these clone-local checks. |
| Exact detached checkout | Lines 302–309 check out the approved full SHA, require exact HEAD equality, require `symbolic-ref --quiet HEAD` exit 1 without timeout/launch failure, retain the clean-source check, and compare the checked-out tree with the pre-checkout tree. Materialized blob and source inventory checks remain at lines 310–323. |
| Regression design | Test lines 95–112 create only synthetic local fixtures, then fetch each synthetic SHA into an unreferenced bare repository. Lines 113–121 require no persistent refs, last-fetch `FETCH_HEAD`, the empty-clone warning, and failed checkout. Lines 122–141 add both named refs and require independent clones, no alternates, accessible commit/tree, exact HEAD, and detached status for both roles. The test fails if the pre-fix case unexpectedly succeeds. |
| Regression scope and safety | The test does not call Docker, npm, the Gate B script, or upstream code. Git stdout/stderr/exit/timeout/launch information is preserved per invocation (lines 53–90). Results refuse overwrite, repositories stay private under a new result directory, and there is no recursive deletion (lines 18–26, 145–155). Git global/system configuration and inherited object-storage variables are cleared. |
| Repair documentation | `GIT_FETCH_REPAIR.md` lines 5–17 match the preserved empty-clone warning and failed exact-SHA checkout logs that I read. Lines 19–34 accurately describe the repair/test. Lines 36–60 honestly preserve failed attempts, distinguish sandbox approval failure from unsafe-action rejection, and make no passing regression or Gate B claim. Its static-check description does not substitute for runtime validation. |

## Preserved Gate B safeguards

The previously reviewed script, preserved at `work/phase2/gate-b-runs/qs33-gateb-local-01/provenance/run-gate-b.ps1`, hashes to `516645b9ec08ca0c153baac605dc3aa90b4fb337bd35f1cde614abff784d6320`. A .NET line comparison, with line endings normalized and only the explicit repair hunks removed/reverted, confirms the remaining source is identical. The repair hunks are current lines 32–37, 263–279, 298–301, 303–306, 309, and the replacement of `--shared` with `--no-hardlinks` at line 297.

- Authentic qs pins/origin and host-only Git/npm preparation remain. Official complete-diff and test-only patch reversibility, full official file hashes, and unchanged controls remain at lines 336–363. Lab 3.0.0 metadata, lock integrity/origin, separate dependency closure, and lifecycle-script disabling remain at lines 365–396. Transitive resolution is newly frozen per run, not a previously committed historical closure.
- The identical direct probe at lines 400–422 calls actual `require('./')`, logs resolution, checks meaningful control/output, and records native type/full original stack. It contains no role branch, manual expected-error throw, fabricated stack, shim, or answer-key logic. Host evidence checks still require actual `/case/index.js`, the native `/case/lib/utils.js:46` frame and official-suite failure evidence (lines 659–677).
- Docker argv at lines 558–566 retains the immutable image digest, network none, nonroot 1000:1000, read-only root, ALL capabilities dropped, no-new-privileges, one CPU, 256 MiB memory/equal swap limit, 64 PIDs, bounded private tmpfs, and an owned fresh `/case` volume without host source binds. Exact inspected image/resource/mount/watchdog checks remain at lines 585–600.
- PID 1 remains `/usr/bin/timeout --verbose --signal=KILL 29s`; the 40-second `docker start --attach` client timeout remains a separately identified transport bound. Native watchdog identity, Docker terminal state and measured lifetime <=30 seconds are required (lines 601–652). Client termination is not claimed to terminate the workload. Missing watchdog evidence, overrun, timeout, abnormal exit, or OOM prevents completed collection.
- Raw official/probe streams are exported live as base64 while tmpfs exists, and original transport bytes remain saved. Reconstruction does not assume tmpfs survives container stop. Child exit/signal/timeout data, before/after input hashes, runtime/module path, before/after inspect and raw Docker logs remain (lines 208–228, 431–499, 605–657). Interrupted/OOM/timeout runs may have only partial streams and cannot count as complete.
- Successful roles remain sequential, with exact owned-container and labeled-volume removal/absence checks before the next role (lines 682–693). Failure cleanup remains limited to exact owned resources, records uncertainty, and performs no global prune or unrelated deletion (lines 701–744). Final evidence hashes are written after cleanup logging (lines 746–753).
- Role expectations only evaluate measured evidence; final status remains BLOCKED/PARTIAL, `gateBAccepted=false`, and no VERIFIED/PASS is synthesized (lines 754–765). Complete official control/skips/unrelated-failure review, external runner/evaluator, alternate/decoy matrix, and determinism are explicitly outstanding (lines 695–696). A failed first role can still stop collection before the second role.

## Commands and actual results

The working root used below was:

```powershell
$root='C:\Users\sunmo\Documents\Codex\2026-10-16\files-mentioned-by-the-user-agents\outputs\replaykit'
```

**Local regression: exit 1.** Exact invocation (the wrapper also exited 1):

```powershell
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\sunmo\Documents\Codex\2026-10-16\files-mentioned-by-the-user-agents\outputs\replaykit\scripts\phase2\test-git-fetch-bare.ps1' -ResultDirectory 'C:\Users\sunmo\Documents\Codex\2026-10-16\files-mentioned-by-the-user-agents\outputs\replaykit\work\phase2\git-fetch-bare-tests\independent-review-20261019-01'
Write-Output ('LocalRegressionExit=' + $LASTEXITCODE)
exit $LASTEXITCODE
```

The execution-policy option was process-scoped; no machine/user policy was changed. Result/failed-stderr inspection exited 0 and confirmed the blocker described above.

**PowerShell 7 parsing/hashes: exit 0.** PowerShell `7.6.5`; zero parse errors for both scripts; hashes match the table.

```powershell
Write-Output ('PowerShell='+$PSVersionTable.PSVersion)
foreach($name in @('run-gate-b.ps1','test-git-fetch-bare.ps1')){
  $p=Join-Path $root ('scripts\phase2\'+$name)
  $tokens=$null;$errors=$null
  $ast=[System.Management.Automation.Language.Parser]::ParseFile($p,[ref]$tokens,[ref]$errors)
  Write-Output ($name+': ParseErrors='+$errors.Count)
  $errors|Format-List
  if($errors.Count -gt 0){exit 1}
  Get-FileHash -Algorithm SHA256 -LiteralPath $p|Format-List
}
```

**Actual Windows PowerShell 5.1 parsing: exit 0.** PowerShell `5.1.26100.9444`; both scripts zero errors; `PS51ParseExit=0`.

```powershell
& powershell.exe -NoProfile -NonInteractive -Command '$root="C:\Users\sunmo\Documents\Codex\2026-10-16\files-mentioned-by-the-user-agents\outputs\replaykit"; Write-Output ("PowerShell="+$PSVersionTable.PSVersion); foreach($name in @("run-gate-b.ps1","test-git-fetch-bare.ps1")){$p=Join-Path $root ("scripts\phase2\"+$name);$tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile($p,[ref]$tokens,[ref]$errors);Write-Output ($name+": ParseErrors="+$errors.Count);$errors|Format-List;if($errors.Count -gt 0){exit 1}}'
Write-Output ('PS51ParseExit='+$LASTEXITCODE)
exit $LASTEXITCODE
```

**Embedded JavaScript syntax only: exit 0 overall and for each check.** Node `v22.23.3`; neither embedded program was executed.

```powershell
$p=Join-Path $root 'scripts\phase2\run-gate-b.ps1'
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($p,[ref]$tokens,[ref]$errors)
foreach($name in @('Probe','Supervisor')){
  $assignment=$ast.Find({param($n)$n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and $n.Left.VariablePath.UserPath -eq $name},$true)
  $scriptText=$assignment.Right.Expression.Value
  if([string]::IsNullOrEmpty($scriptText)){throw 'Missing embedded program'}
  $scriptText|& node.exe --check
  Write-Output ($name+'NodeCheckExit='+$LASTEXITCODE)
  if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
}
& node.exe --version
Write-Output ('NodeVersionExit='+$LASTEXITCODE)
```

**Source-preservation comparison:** `git.exe diff --no-index -- $old $current` failed with **exit 128**, `fatal: cannot change to 'C:/Users/sunmo'`, so no successful Git diff is claimed. Here `$old` is the preserved script path identified above and `$current` is `Join-Path $root 'scripts\phase2\run-gate-b.ps1'`. A first manual hunk projection exited 1 because its header-removal range mistakenly removed the closing comment marker; the corrected comparison below reported 738 original/projected lines and `OutsideRepairHunks=identical`. This was reviewer comparison tooling, not a source or regression-test failure.

```powershell
$oldLines=[IO.File]::ReadAllLines((Join-Path $root 'work\phase2\gate-b-runs\qs33-gateb-local-01\provenance\run-gate-b.ps1'))
$newLines=[IO.File]::ReadAllLines((Join-Path $root 'scripts\phase2\run-gate-b.ps1'))
$projected=New-Object 'System.Collections.Generic.List[string]'
for($i=0;$i -lt $newLines.Length;$i++){
  $n=$i+1
  if(($n -ge 32 -and $n -le 37) -or ($n -ge 263 -and $n -le 279) -or ($n -ge 298 -and $n -le 301) -or ($n -ge 303 -and $n -le 306) -or $n -eq 309){continue}
  $line=$newLines[$i]
  if($n -eq 297){$line=$line.Replace("'--no-hardlinks'","'--shared'")}
  $projected.Add($line)
}
Write-Output ('OldLines='+$oldLines.Length+' ProjectedLines='+$projected.Count)
if(($oldLines -join "`n") -cne ($projected -join "`n")){throw 'Unexpected change outside reviewed repair hunks'}
Write-Output 'OutsideRepairHunks=identical (line endings normalized)'
```

Source/hash/document reads completed with exit 0. Truncated tool output was followed by bounded line reads; it was not treated as proof that omitted source was absent.

## Handoff disposition

**APPROVED for static handoff of the exact hashes above.** The implementation preserves the upstream-code execution path and the prior isolation/evidence requirements. The Git regression remains blocked at its first fetch, and its full before/after comparison must be measured in a normal shell before claiming the repair validated. No measured Gate B acceptance, qs behavior, successful Docker cleanup, or VERIFIED result is established by this review.

No Docker/upstream execution was performed by me.
