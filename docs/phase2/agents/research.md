# Phase 2 upstream research — closure report

Final status: **PARTIAL / BLOCKED**. This report preserves permitted findings already observed. No upstream candidate was executed, no runnable candidate was established, and no external verification claim is made.

The parent agent reported a content-safety restriction and instructed this agent to stop research and preserve only permitted technical observations. This report follows that instruction. No additional research, downloads, source execution, installation, Docker operation, commit, deletion, or delegation was performed after the closure instruction. Restricted material is excluded.

## Objective and scope

Investigate a small historical JavaScript correctness regression with primary upstream provenance and a potential genuine production exception, while preserving ReplayKit's existing strict identity and R1 contracts. The assigned ReplayKit baseline was `15647d5`; this agent did not independently verify that checkout revision.

Repository: `C:\Users\sunmo\Documents\Codex\2026-10-16\files-mentioned-by-the-user-agents\outputs\replaykit`.

Owned paths were this report and `work/phase2/research/`. No implementation files or evaluator contracts were changed by this agent.

## Permitted finding: qs ordinary correctness issue 33

| Item | Observed evidence |
| --- | --- |
| Upstream repository | [ljharb/qs](https://github.com/ljharb/qs) |
| Public issue | [Issue 33, Error when plain object in a value](https://github.com/ljharb/qs/issues/33), closed |
| Buggy revision | `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` |
| Fixed revision | [`6a97ad1d71d8a9069f5d6002cab3130752519ccb`](https://github.com/ljharb/qs/commit/6a97ad1d71d8a9069f5d6002cab3130752519ccb) |
| Revision relationship | The fix metadata identifies the buggy revision as its sole parent. The fix message explicitly closes issue 33. |
| Integration evidence | GitHub comparison of the fixed revision to `main` returned `status: ahead`, `ahead_by: 955`, `behind_by: 0`; both base and merge-base were the fixed revision. This establishes observed default-branch ancestry, not a separately verified PR merge. |
| Package | `qs` version `2.2.1`, CommonJS `main: index.js` |
| Runtime dependencies | `{}` in both downloaded parent and fixed package manifests |
| Build requirement | No compilation step was identified in the inspected package manifest. Actual Node 22 compatibility remains untested. |
| Original test dependency | `lab: 3.x.x` |
| License | Downloaded parent `LICENSE` contains the three-clause BSD conditions. Package metadata calls it BSD. Retain the actual license text with redistributed source. |

The issue describes failure while parsing a nested object without the ordinary object prototype. Its published stack includes a `TypeError` in the actual production `lib/utils.js` clone function. This is upstream reported evidence, **not an exception captured by ReplayKit**. A future execution must independently observe the real type and first production frame; this report does not infer a successful identity match.

The fix changes five own-property checks across `lib/parse.js`, `lib/stringify.js`, and `lib/utils.js`. It also adds one complete official `it` statement to `test/parse.js`, titled `parses plain objects correctly`. That test constructs an object with `Object.create(null)`, gives it `b: 'c'`, passes it as nested property `a`, and expects the parsed result to equal `{ a: { b: 'c' } }`.

The complete added statement appears compatible in shape with the existing single-added-`it` extraction profile. The profile was **not run** against this patch; compatibility is an inspection assessment only. Existing control tests must remain unchanged.

Immutable source archive URLs identified before closure:

- `https://codeload.github.com/ljharb/qs/tar.gz/360e2b0b48548b9bfdb71f8c82a68c4f34ec0725`
- `https://codeload.github.com/ljharb/qs/tar.gz/6a97ad1d71d8a9069f5d6002cab3130752519ccb`

Those archives were not downloaded by this agent. Individual immutable files and API metadata were downloaded as data.

## Official runner facts already inspected

The parent Makefile contains these commands:

```text
test:          node node_modules/lab/bin/lab
test-cov:      node node_modules/lab/bin/lab -t 100
test-cov-html: node node_modules/lab/bin/lab -r html -o coverage.html
```

The package's `npm test` invokes `make test-cov`. The official parse suite imports `lab`, uses `Lab.expect`, `Lab.experiment` and `Lab.test`, and imports the actual package through `require('../')`.

Registry metadata for **Lab 3.0.0** was inspected, without installing it. It declares Node `>=0.10.22` and dependencies `chai: ^1.9.1`, `diff: 1.0.x`, `async: 0.2.x`, `esprima: 1.0.x`, `optimist: 0.6.x`, and `handlebars: 1.2.x`. This metadata does not establish that Lab 3.0.0 is the final version selected by `3.x.x`, that transitive dependencies are pinned, or that the old runner works on Node 22.

## Work and inspected files

Repository documentation inspected: `AGENTS.md`, `README.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/THREAT_MODEL.md`, `docs/LIMITATIONS.md`, and `docs/EXTERNAL_VALIDATION.md`. Some combined command outputs were truncated; subsequent bounded reads inspected the leading architecture/decision/threat/limitation sections. A filename search returned the root `AGENTS.md` only.

The prior external-validation record reports an assertion-only failure without a production application frame, browser startup failures, and an interrupted large-image acquisition. These are historical records, not executions by this agent. They explain why genuine production identity and a small dependency footprint were priorities.

Relevant local data already acquired:

- `work/phase2/research/qs-33.json`
- `work/phase2/research/qs-33-events.json`
- `work/phase2/research/qs-33-comments.json`
- `work/phase2/research/qs-33-fix.json`
- `work/phase2/research/qs-33-fix.diff`
- `work/phase2/research/qs-33-main-ancestry.json`
- `work/phase2/research/qs33-Makefile`
- `work/phase2/research/lab3-package.json`
- Revision directories `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725/` and `6a97ad1d71d8a9069f5d6002cab3130752519ccb/`, each containing downloaded `package.json`, `LICENSE`, `test-parse.js`, `lib-utils.js`, and `lib-parse.js`.

Other previously acquired research data remains in the assigned work directory. This closure report does not reproduce restricted material from it. No further candidates are selected here.

## Commands and actual outcomes

All commands were PowerShell read/download/data-inspection operations. The following records preserve the exact material command expressions and actual outcomes; none executed downloaded JavaScript.

1. `Get-Content C:\Users\sunmo\.codex\plugins\cache\openai-curated-remote\superpowers\6.4.2\skills\using-superpowers\SKILL.md; Get-Content C:\Users\sunmo\Documents\Codex\2026-10-16\files-mentioned-by-the-user-agents\outputs\replaykit\AGENTS.md` — exit **0**. The skill explicitly tells dispatched subagents to ignore that skill.
2. With `$r` set to the repository, `Get-Content "$r\README.md", "$r\docs\PROGRESS.md", "$r\docs\DECISIONS.md", "$r\docs\ARCHITECTURE.md", "$r\docs\THREAT_MODEL.md", "$r\docs\LIMITATIONS.md", "$r\docs\EXTERNAL_VALIDATION.md"; rg --files -g AGENTS.md $r` — exit **0**, combined output truncated; root instructions file found.
3. Initial un-escalated `Invoke-RestMethod 'https://api.github.com/search/issues?q=repo%3ATehShrike%2Fdeepmerge%20TypeError%20is%3Aissue&per_page=10'` — PowerShell process exit **0**, but the operation **failed**, reporting `No such host is known.` The script lacked `$ErrorActionPreference='Stop'`; its process exit does not indicate a successful download.
4. A bounded, escalated GitHub issue-search download with `$ErrorActionPreference='Stop'` — exit **0**, public metadata acquired. Subsequent issue/fix/event/comment downloads also exited **0**. These corrected the network-access problem; no auto-review rejection was returned for them.
5. Bounded download batches used `Invoke-RestMethod $x[1]; $j | ConvertTo-Json -Depth 50 | Set-Content "$d\$($x[0]).json"` for public issue, closing-event, comment and commit API endpoints. Issue 33 and its parent/fix metadata were acquired; completed batches exited **0**.
6. The immutable-file batch used `Invoke-WebRequest -Uri $uri -OutFile (Join-Path $out ($p.Replace('/','-'))) -TimeoutSec 30` over explicit revision/file lists. It downloaded both issue-33 revision file sets and another inspected parent set, then exited **1** on a later HTTP **404 Not Found** for a differently named license file. This was a filename failure, not a DNS failure. No issue-33 source download failure was observed.
7. The final bounded metadata batch used `Invoke-WebRequest -Uri $x[1] -OutFile "$d\$($x[0])" -TimeoutSec 30` over an explicit target list including the issue-33 comparison API URL, its `.diff`, parent Makefile and `https://registry.npmjs.org/lab/3.0.0` — exit **0**. The downloaded files and runner dependency facts are listed above.
8. Local data inspection used `Get-Content "$d\360e2b0b48548b9bfdb71f8c82a68c4f34ec0725\lib-utils.js" -TotalCount 85`, `Get-Content "$d\qs-33-fix.diff"`, and `ConvertFrom-Json` followed by `Select-Object status,ahead_by,behind_by` for the comparison metadata — exit **0**. Key comparison output: `ahead`, `955`, `0`, with the fixed revision as merge-base.

Primary web browsing also inspected public GitHub pages. Some web fetches returned cache-miss or inaccessible-URL errors. Web tool results have no shell exit code. Successful metadata downloads, rather than those failed browser fetches, support the immutable revision facts above.

## Unconfirmed items and remaining work

- No complete source archive or immutable runtime/dependency bundle was acquired by this agent.
- No SHA-256 content hashes were computed for the full fix diff, test-only patch, production-only patch, candidate statement, official file, license or archives. Git commit IDs and metadata are not substitutes for those hashes.
- No install resolution, lockfile, Lab reporter behavior, full official inventory, Node 22 compatibility, or offline command behavior was verified.
- No buggy/fixed preflight, alternate fix, decoy, sensitivity, deterministic repetition or formal matrix ran.
- An independent alternate implementation and honest symptom-masking decoy were not authored, reviewed or executed. Their feasibility remains unconfirmed.
- A genuine captured error type and production application frame remain required. Do not substitute test/assertion frames or the upstream report for actual execution evidence.
- The existing evaluator, candidate extraction/static checks, isolation policy and legacy R1 contracts remain untouched.

Tests **NOT RUN**: all candidate tests, official upstream suites, ReplayKit tests, typechecking, linting, formatting, security scans, R1 smoke, external preflights and Docker execution. No Docker build, install, commit or deletion was performed by this agent.

The inspected ordinary correctness issue is a plausible small candidate for later authorized feasibility work. It is not a runnable or verified selection. Research is closed under the parent's restriction; this report makes no completion claim beyond preserving the observations above.
