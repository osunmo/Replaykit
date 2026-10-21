# Gate B lockfile parser repair — independent QA

Verdict: **approved for a fresh local Gate B collection attempt**, with Gate B itself **BLOCKED** pending actual upstream buggy and fixed execution and independent review. This is a source and local-regression review, not a qs execution result.

| Reviewed file                             | SHA-256                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `scripts/phase2/run-gate-b.ps1`           | `4ffdf282267640f208cfff6201166039204d3ff76bee767343659fb30855933e` |
| `scripts/phase2/validate-gate-b-lock.mjs` | `31dbce23fa31b3af3ffeae8b0cb15db8a8dcb49aedf178e3381aec7a4adcc566` |
| `scripts/phase2/test-lockfile-json.mjs`   | `611d0c58c439fa1d2276a55eff6469a09993728f7fd017f830fc9f5daca2c812` |

## Actual failure and repair

The saved `qs33-gateb-local-02/lab-bundle/package-lock.json` is a valid npm lockfile v3 with `packages[""]`; it has 18 package entries and SHA-256 `cb06631e8c6cb83e8199e3411184fabe674410427cf48b53dba7553f8cee750b`. Windows PowerShell 5.1 `ConvertFrom-Json` on those bytes raised the reported `argument "name" is not valid` exception. That is the empty root package key that previously caused line 387 to stop collection. Saved `report.json` says `BLOCKED`, `gateBAccepted: false`, zero role executions, and 60 recorded commands. The last command was cleanup inventory; npm metadata, lock creation and `npm ci` had already exited 0. The prior run remains untouched.

The runbook now copies a fixed Node validator into the run's provenance directory, hashes it in `host.json`, invokes it through `Invoke-Recorded`, requires exit 0, and saves its machine-readable stdout. The validator reads the lockfile as strict UTF-8 JSON data through `JSON.parse`; it does not evaluate or import lockfile content. JavaScript property lookup preserves both the empty root key and case distinctions. It emits only fixed error codes on stderr, with no lockfile values, paths, credentials or token-bearing URLs. Successful stdout contains a fixed-order summary and a SHA-256 of the exact lockfile bytes. The runbook separately copies the raw lockfile and inventories bundle bytes, preserving evidence provenance.

The validator requires lockfile v3, the expected private bundle identity and root Lab pin, an exact `node_modules/lab` version equal to `3.0.0`, equality between that entry's integrity and the saved registry metadata integrity, canonical SRI integrity for every package entry, and HTTPS `registry.npmjs.org` origins without URL credentials, query or fragment. `npm ci --ignore-scripts` still runs before any upstream execution; no dependency check has been skipped. Unsupported structure and malformed JSON/UTF-8 exit nonzero.

## Fresh local checks

Commands were run from the repository root with Node `v22.23.3` and PowerShell 7.6.5. No Docker, network, upstream qs, npm install, or Gate B run was invoked in this review.

| Command or check                                                                                                    | Exit code | Observed result                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | --------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node --check scripts/phase2/validate-gate-b-lock.mjs`                                                              |         0 | Syntax accepted.                                                                                                                                                                                 |
| `node --check scripts/phase2/test-lockfile-json.mjs`                                                                |         0 | Syntax accepted.                                                                                                                                                                                 |
| `node scripts/phase2/test-lockfile-json.mjs`                                                                        |         0 | `PASS`; valid empty root and case-distinct keys accepted; wrong-case Lab, missing integrity, credential URL, lock v2, malformed JSON and invalid UTF-8 rejected; repeated-byte output identical. |
| `node scripts/phase2/validate-gate-b-lock.mjs <saved-local-02-lock> 3.0.0 <integrity-from-saved-registry-metadata>` |         0 | `status: PASS`, `packageCount: 18`, `rootPackageKeyPresent: true`, and exact lock hash above. The integrity argument came from saved command `057-lab-registry-metadata.stdout`.                 |
| Invoke that same Node helper from `powershell.exe -NoProfile -Command`                                              |         0 | Windows PowerShell 5.1 passed the saved lock path and integrity through environment variables; result had the same deterministic JSON and hash.                                                  |
| Invoke that same Node helper from `pwsh.exe -NoProfile -Command`                                                    |         0 | PowerShell 7 returned identical JSON and hash.                                                                                                                                                   |
| PowerShell 7 AST parse of `run-gate-b.ps1`                                                                          |         0 | 0 parser errors.                                                                                                                                                                                 |
| Windows PowerShell 5.1 AST parse of `run-gate-b.ps1`                                                                |         0 | 0 parser errors.                                                                                                                                                                                 |
| `git diff --check`                                                                                                  |         0 | No tracked-diff whitespace errors.                                                                                                                                                               |
| `git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts`                            |         0 | Protected R1 judge/contracts unchanged.                                                                                                                                                          |

The PS5.1 reproduction used a wrapper that expected and caught `ConvertFrom-Json` failure; that wrapper exited 0 after printing the exact `argument "name" is not valid` exception. It was diagnostic evidence of the old defect, not a successful lockfile conversion.

The exact saved-lock helper invocation was:

```powershell
$m = 'work/phase2/gate-b-runs/qs33-gateb-local-02/commands/057-lab-registry-metadata.stdout'
$l = 'work/phase2/gate-b-runs/qs33-gateb-local-02/lab-bundle/package-lock.json'
$integrity = node -e "const o=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(o.dist.integrity)" $m
node scripts/phase2/validate-gate-b-lock.mjs $l 3.0.0 $integrity
```

The last command exited 0 and printed `{"schemaVersion":1,"status":"PASS","lockfileVersion":3,"rootPackageKeyPresent":true,"packageCount":18,"labVersion":"3.0.0","lockSha256":"cb06631e8c6cb83e8199e3411184fabe674410427cf48b53dba7553f8cee750b"}`. The integrity value was passed as an argument and was not echoed.

## Remaining JSON conversion audit

`run-gate-b.ps1` retains 12 `ConvertFrom-Json` sites, none on the npm lockfile. The same PS5.1 empty-name limitation applies mechanically to any of them **if** its input ever contains an empty property name. Each would abort or count a malformed frame and therefore block collection; none can silently yield Gate B acceptance. This is a residual compatibility limit, not evidence that those inputs currently contain an empty key.

| Lines                   | Input                                                                        | Empty-key exposure assessment                                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 333, 382                | Pinned upstream `package.json` files; saved Lab registry metadata            | All three saved local-02 files parse as JSON with zero empty keys. Those conversions already succeeded in local-02.                                                                                                                |
| 192, 199, 545, 575      | Docker container, volume and image inspection                                | Docker metadata may contain map-valued fields. No post-lock Docker inspect output exists in local-02. An empty key there would fail closed; this run cannot establish compatibility with every future image/daemon metadata shape. |
| 216                     | Supervisor artifact transport frame                                          | Fixed frame fields are `event`, `path`, `append`, `base64`; artifact bytes are encoded, not nested JSON in the frame. An unexpected empty field could cause a malformed-frame count and block collection.                          |
| 650, 653, 657, 658, 662 | Generated inventories, runtime, official/probe records and probe event lines | Fixed record schemas use named fields. The probe's current control/output object uses named `a` and `b` fields. Any unexpected empty key would fail closed before role checks complete.                                            |

## Preserved gates and limits

The changed lockfile parsing does not alter pinned upstream SHAs, exact Git object/tree and checked-out HEAD assertions, saved official regression bytes, the qs production entrypoint, role order, private Docker volume ownership, no-network/read-only/nonroot execution, PID 1 timeout watchdog, per-command timeouts, before/after input inventories, artifact hashes, or exact-resource cleanup. The helper is copied and hashed with the run. The collection script continues to set `gateBAccepted: false` and cannot claim VERIFIED from summaries.

No critical or important repair defect was found in this review. The remaining uncertainty is operational: the revised runbook has not yet produced real buggy and fixed upstream execution evidence. Gate B and external-runner implementation remain blocked until that evidence is collected and independently assessed.
