#requires -Version 5.1
<#
.SYNOPSIS
Collect the bounded qs issue-33 Gate B evidence from normal Windows PowerShell.
.DESCRIPTION
Run locally, outside Codex's sandbox, after the user has restored Docker/network
access. This file is a runbook, not ReplayKit's external runner or normalizer.
It does not issue VERIFIED or accept Gate B on behalf of an independent reviewer.

HOST PREPARATION uses Git HTTPS and npm registry access. It never executes qs on
the host, never uses ReplayKit's node_modules, and disables npm lifecycle scripts.
OFFLINE EXECUTION copies frozen inputs into two sequential disposable containers.
Each owns a fresh labeled /case volume for Docker-valid writable staging; the
root stays read-only, there are no host binds, and input hashes are checked before
and after execution. Only this run's exact containers and volumes are removed.
No Docker build, prune, shared-volume removal, or image removal.

A native /usr/bin/timeout PID 1 watchdog sends SIGKILL after 29 seconds, including
its process group, independently of the attached Docker client and Node's event
loop. Docker's terminal state must confirm a total container lifetime <=30 seconds.
The attach client's separate 40-second transport timeout is not a workload limit.
This is an OS-enforced timeout with measured confirmation, not a hard real-time
scheduling guarantee: missing watchdog/terminal evidence or an observed overrun
stops collection with BLOCKED/PARTIAL status.

Example (from repository root):
  powershell.exe -NoProfile -File .\scripts\phase2\run-gate-b.ps1 -RunId qs33-local-01

Exit 0 means evidence collection completed with status PARTIAL, awaiting review.
Exit 1 means BLOCKED/PARTIAL collection with missing evidence; inspect report.json.
All run directories are new: an existing run directory is never overwritten.

Repair diagnosis: qs33-gateb-local-01 fetched both pinned objects into a bare
repository but created no persistent refs; FETCH_HEAD named only the last fetch.
Its local clone was reported empty and exact-SHA checkout failed. Keep that run
as evidence. This version creates and verifies named refs before independent
--no-hardlinks clones, then verifies commit/tree objects and detached exact HEAD.
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$')]
    [string] $RunId = ('qs33-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)),
    [string] $OutputRoot = '',
    [ValidateSet('node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392')]
    [string] $ImageDigest = 'node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $RepoRoot 'work\phase2\gate-b-runs'
}
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)
$RunRoot = Join-Path $OutputRoot $RunId
if (Test-Path -LiteralPath $RunRoot) { throw "Refusing to overwrite existing run: $RunRoot" }
New-Item -ItemType Directory -Path $RunRoot | Out-Null
$Logs = Join-Path $RunRoot 'commands'
$Provenance = Join-Path $RunRoot 'provenance'
New-Item -ItemType Directory -Path $Logs, $Provenance | Out-Null
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Commands = New-Object 'System.Collections.Generic.List[object]'
$Containers = New-Object 'System.Collections.Generic.List[object]'
$Volumes = New-Object 'System.Collections.Generic.List[object]'
$Missing = New-Object 'System.Collections.Generic.List[string]'
$Roles = New-Object 'System.Collections.Generic.List[object]'
$Buggy = '360e2b0b48548b9bfdb71f8c82a68c4f34ec0725'
$Fixed = '6a97ad1d71d8a9069f5d6002cab3130752519ccb'
$LabVersion = '3.0.0'
$Upstream = 'https://github.com/ljharb/qs.git'
$RunToken = [Guid]::NewGuid().ToString('N')
$StartedAt = [DateTime]::UtcNow.ToString('o')
$CollectionComplete = $false
$Docker = $null
$Sequence = 0

function Write-Text([string] $Path, [string] $Value) {
    [IO.File]::WriteAllText($Path, $Value, $Utf8)
}
function Write-Json([string] $Path, $Value) {
    Write-Text $Path (($Value | ConvertTo-Json -Depth 60) + "`n")
}
function Hash-File([string] $Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Require([bool] $Condition, [string] $Message) {
    if (-not $Condition) { throw $Message }
}
# ProcessStartInfo on Windows PowerShell 5.1 has no ArgumentList. This implements
# Windows CommandLineToArgvW quoting, without cmd.exe or shell interpolation.
function Quote-Argument([string] $Value) {
    if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
    $Builder = New-Object Text.StringBuilder
    [void] $Builder.Append('"')
    $Backslashes = 0
    foreach ($Character in $Value.ToCharArray()) {
        if ($Character -eq '\') { $Backslashes++; continue }
        if ($Character -eq '"') {
            [void] $Builder.Append(('\' * (2 * $Backslashes + 1)))
        } else {
            [void] $Builder.Append(('\' * $Backslashes))
        }
        [void] $Builder.Append($Character)
        $Backslashes = 0
    }
    [void] $Builder.Append(('\' * (2 * $Backslashes)))
    [void] $Builder.Append('"')
    return $Builder.ToString()
}
function Invoke-Recorded {
    param(
        [string] $Name, [string] $Executable, [string[]] $Arguments,
        [string] $WorkingDirectory = $RunRoot, [int] $TimeoutSeconds = 120,
        [switch] $AllowFailure
    )
    $script:Sequence++
    $Prefix = Join-Path $Logs ('{0:D3}-{1}' -f $script:Sequence, $Name)
    $Stdout = $Prefix + '.stdout'
    $Stderr = $Prefix + '.stderr'
    $Record = [ordered]@{
        executable = $Executable; argv = @($Executable) + @($Arguments)
        cwd = $WorkingDirectory; timeoutSeconds = $TimeoutSeconds
        startedAt = [DateTime]::UtcNow.ToString('o'); finishedAt = $null
        exitCode = $null; clientTimedOut = $false; launchError = $null
        stdout = $Stdout; stderr = $Stderr; stdoutSha256 = $null; stderrSha256 = $null
    }
    $Process = New-Object Diagnostics.Process
    $Process.StartInfo = New-Object Diagnostics.ProcessStartInfo
    $Process.StartInfo.FileName = $Executable
    $Process.StartInfo.Arguments = (($Arguments | ForEach-Object { Quote-Argument $_ }) -join ' ')
    $Process.StartInfo.WorkingDirectory = $WorkingDirectory
    $Process.StartInfo.UseShellExecute = $false
    $Process.StartInfo.CreateNoWindow = $true
    $Process.StartInfo.RedirectStandardOutput = $true
    $Process.StartInfo.RedirectStandardError = $true
    # Ignore inherited module search paths/configuration that could load host code.
    foreach ($Key in @('NODE_OPTIONS', 'NODE_PATH', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE')) {
        $Process.StartInfo.EnvironmentVariables.Remove($Key)
    }
    # Ignore global Git URL rewrites, filters and hooks during source acquisition.
    $Process.StartInfo.EnvironmentVariables['GIT_CONFIG_NOSYSTEM'] = '1'
    $Process.StartInfo.EnvironmentVariables['GIT_CONFIG_GLOBAL'] = 'NUL'
    $Process.StartInfo.EnvironmentVariables['GIT_TERMINAL_PROMPT'] = '0'
    $Process.StartInfo.EnvironmentVariables.Remove('GIT_CONFIG_COUNT')
    $OutStream = [IO.File]::Create($Stdout)
    $ErrStream = [IO.File]::Create($Stderr)
    try {
        [void] $Process.Start()
        $OutCopy = $Process.StandardOutput.BaseStream.CopyToAsync($OutStream)
        $ErrCopy = $Process.StandardError.BaseStream.CopyToAsync($ErrStream)
        if (-not $Process.WaitForExit($TimeoutSeconds * 1000)) {
            $Record.clientTimedOut = $true
            $Process.Kill()
        }
        $Process.WaitForExit()
        [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($OutCopy, $ErrCopy))
        $Record.exitCode = $Process.ExitCode
    } catch {
        $Record.launchError = $_.ToString()
    } finally {
        $OutStream.Dispose(); $ErrStream.Dispose(); $Process.Dispose()
        $Record.finishedAt = [DateTime]::UtcNow.ToString('o')
        $Record.stdoutSha256 = Hash-File $Stdout
        $Record.stderrSha256 = Hash-File $Stderr
        Write-Json ($Prefix + '.json') $Record
        $Commands.Add([pscustomobject] $Record)
    }
    if (-not $AllowFailure -and ($Record.clientTimedOut -or $null -ne $Record.launchError -or $Record.exitCode -ne 0)) {
        throw "Command failed: $Name; raw records: $Prefix.*"
    }
    return [pscustomobject] $Record
}
function Command-Text($Record) { return [IO.File]::ReadAllText($Record.stdout).Trim() }
function Inventory([string] $Root) {
    $Items = @()
    foreach ($File in @(Get-ChildItem -LiteralPath $Root -File -Recurse -Force | Sort-Object FullName)) {
        $Relative = $File.FullName.Substring($Root.Length).TrimStart('\', '/').Replace('\', '/')
        if ($Relative -eq '.git' -or $Relative.StartsWith('.git/')) { continue }
        Require (($File.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) "Reparse point forbidden: $($File.FullName)"
        $Items += [pscustomobject]@{ path = $Relative; bytes = $File.Length; sha256 = Hash-File $File.FullName }
    }
    return $Items
}
function Same-Inventory($Left, $Right, [string] $Context) {
    function Index-Entries($Entries, [string] $Side) {
        # Windows PowerShell 5.1 wraps a JSON array returned by ConvertFrom-Json
        # inside one object[] when the caller uses @(...). Unwrap that exact
        # shape, but reject any nested entry or unsupported manifest schema.
        $Items = @($Entries)
        if ($Items.Count -eq 1 -and $Items[0] -is [array]) { $Items = $Items[0] }
        $Index = [System.Collections.Generic.Dictionary[string, object]]::new([StringComparer]::Ordinal)
        foreach ($Entry in $Items) {
            Require ($Entry -is [pscustomobject]) "Inventory invalid entry: $Context ($Side)"
            $Names = @($Entry.PSObject.Properties | ForEach-Object Name)
            Require ($Names.Count -eq 3 -and $Names -ccontains 'path' -and $Names -ccontains 'bytes' -and $Names -ccontains 'sha256') "Inventory invalid entry: $Context ($Side)"
            Require ($Entry.path -is [string] -and $Entry.path.Length -gt 0) "Inventory invalid path: $Context ($Side)"
            Require (($Entry.bytes -is [int] -or $Entry.bytes -is [long]) -and $Entry.bytes -ge 0) "Inventory invalid bytes: $Context ($Side)"
            Require ($Entry.sha256 -is [string] -and $Entry.sha256 -cmatch '^[a-f0-9]{64}$') "Inventory invalid SHA-256: $Context ($Side)"
            Require (-not $Index.ContainsKey($Entry.path)) "Inventory duplicate path: $Context ($Side)"
            $Index.Add($Entry.path, [pscustomobject]@{ bytes = [int64]$Entry.bytes; sha256 = $Entry.sha256 })
        }
        return $Index
    }
    $Expected = Index-Entries $Left 'prepared'
    $Observed = Index-Entries $Right 'observed'
    Require ($Expected.Count -eq $Observed.Count) "Inventory mismatch: $Context"
    $Paths = [string[]]@($Expected.Keys)
    [Array]::Sort($Paths, [StringComparer]::Ordinal)
    foreach ($Path in $Paths) {
        $ObservedEntry = $null
        Require ($Observed.TryGetValue($Path, [ref]$ObservedEntry)) "Inventory mismatch: $Context"
        $ExpectedEntry = $Expected[$Path]
        Require ($ExpectedEntry.bytes -eq $ObservedEntry.bytes -and [StringComparer]::Ordinal.Equals($ExpectedEntry.sha256, $ObservedEntry.sha256)) "Inventory mismatch: $Context"
    }
}
function Inspect-Owned($Container, [string] $Stage) {
    $Record = Invoke-Recorded "$($Container.role)-inspect-$Stage" $Docker @('container', 'inspect', $Container.id)
    $Data = @(Get-Content -LiteralPath $Record.stdout -Raw | ConvertFrom-Json)[0]
    Require ($Data.Id -ceq $Container.id) 'Container ID mismatch'
    Require ($Data.Config.Labels.'replaykit.gate-b.token' -ceq $RunToken) 'Container ownership token mismatch'
    return $Data
}
function Inspect-OwnedVolume($Volume, [string] $Stage) {
    $Record = Invoke-Recorded "$($Volume.role)-volume-inspect-$Stage" $Docker @('volume', 'inspect', $Volume.name)
    $Data = @(Get-Content -LiteralPath $Record.stdout -Raw | ConvertFrom-Json)[0]
    Require ($Data.Name -ceq $Volume.name -and $Data.Labels.'replaykit.gate-b.token' -ceq $RunToken -and $Data.Labels.'replaykit.gate-b.role' -ceq $Volume.role) 'Volume ownership mismatch'
    Require ($Data.Driver -ceq 'local' -and $Data.Scope -ceq 'local') 'Unexpected private staging volume driver/scope'
    return $Data
}
function Docker-Time([string] $Value) {
    # Docker uses nanosecond RFC3339 timestamps; .NET Framework accepts 7 digits.
    return [DateTimeOffset]::Parse(($Value -replace '(\.\d{7})\d+Z$', '$1Z'), [Globalization.CultureInfo]::InvariantCulture)
}
function Recover-Evidence([string] $TransportPath, [string] $Destination) {
    # Docker tmpfs disappears when a container stops. The supervisor streams
    # byte-preserving base64 chunks over attached stdout while it is alive.
    # Original transport bytes remain in commands/*start-attach.stdout.
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $Malformed = 0
    foreach ($Line in [IO.File]::ReadLines($TransportPath)) {
        try {
            $Frame = $Line | ConvertFrom-Json
            Require ($Frame.event -ceq 'gate-b-artifact') 'Unexpected transport event'
            Require ($Frame.path -match '^[a-z][a-z0-9.-]*\.(json|stdout|stderr)$') 'Unsafe artifact transport path'
            $Bytes = [Convert]::FromBase64String($Frame.base64)
            $Target = Join-Path $Destination $Frame.path
            if ($Frame.append) {
                $Stream = [IO.File]::Open($Target, [IO.FileMode]::Append, [IO.FileAccess]::Write)
                try { $Stream.Write($Bytes, 0, $Bytes.Length) } finally { $Stream.Dispose() }
            } else { [IO.File]::WriteAllBytes($Target, $Bytes) }
        } catch { $Malformed++ }
    }
    Write-Json (Join-Path $Destination 'transport-recovery.json') @{ malformedFrames = $Malformed; source = $TransportPath }
    return $Malformed
}

try {
    [Console]::Error.WriteLine("Gate B host preparation: $RunRoot")
    $Git = (Get-Command git.exe -ErrorAction Stop).Source
    $Node = (Get-Command node.exe -ErrorAction Stop).Source
    $Docker = (Get-Command docker.exe -ErrorAction Stop).Source
    $NpmCommand = Get-Command npm.cmd -ErrorAction Stop
    $NpmCli = Join-Path (Split-Path $NpmCommand.Source -Parent) 'node_modules\npm\bin\npm-cli.js'
    Require (Test-Path -LiteralPath $NpmCli -PathType Leaf) "npm CLI not found next to npm.cmd: $NpmCli"
    $LockValidatorSource = Join-Path $PSScriptRoot 'validate-gate-b-lock.mjs'
    Require (Test-Path -LiteralPath $LockValidatorSource -PathType Leaf) 'Gate B lock validator is missing'
    $LockValidator = Join-Path $Provenance 'validate-gate-b-lock.mjs'
    Copy-Item -LiteralPath $LockValidatorSource -Destination $LockValidator
    Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $Provenance 'run-gate-b.ps1')
    Write-Json (Join-Path $Provenance 'host.json') ([ordered]@{
        powershell = $PSVersionTable.PSVersion.ToString(); os = [Environment]::OSVersion.ToString()
        processArchitecture = $env:PROCESSOR_ARCHITECTURE; image = $ImageDigest
        git = $Git; node = $Node; npmCli = $NpmCli; docker = $Docker
        scriptSha256 = Hash-File $PSCommandPath; lockValidatorSha256 = Hash-File $LockValidator
        startedAt = $StartedAt
        hostPreparationHasNetwork = $true; executionHasNetwork = $false
    })
    $null = Invoke-Recorded 'git-version' $Git @('--version')
    $null = Invoke-Recorded 'node-version' $Node @('--version')
    $null = Invoke-Recorded 'npm-version' $Node @($NpmCli, '--version')

    # HOST: retrieve authentic Git objects from the named HTTPS origin. Neither
    # pre-existing Phase 2 artifacts nor installed qs are used as source code.
    $ObjectRepo = Join-Path $RunRoot 'upstream-git'
    $null = Invoke-Recorded 'git-init' $Git @('init', '--bare', $ObjectRepo)
    $null = Invoke-Recorded 'git-origin' $Git @('--git-dir', $ObjectRepo, 'remote', 'add', 'origin', $Upstream)
    foreach ($Commit in @($Buggy, $Fixed)) {
        $null = Invoke-Recorded "fetch-$Commit" $Git @('--git-dir', $ObjectRepo, '-c', 'http.sslVerify=true', 'fetch', '--no-tags', '--depth=2', 'origin', $Commit) -TimeoutSeconds 180
        $Actual = Command-Text (Invoke-Recorded "resolve-$Commit" $Git @('--git-dir', $ObjectRepo, 'rev-parse', "$Commit^{commit}"))
        Require ($Actual -ceq $Commit) "Fetched commit does not match pin: $Commit"
        $Raw = Invoke-Recorded "commit-object-$Commit" $Git @('--git-dir', $ObjectRepo, 'cat-file', 'commit', $Commit)
        Copy-Item -LiteralPath $Raw.stdout -Destination (Join-Path $Provenance "$Commit.commit")
    }
    # Fetching a SHA only updates FETCH_HEAD. A local clone needs persistent refs
    # to discover reachable objects; the last FETCH_HEAD is not a branch/refspec.
    $null = Invoke-Recorded 'pin-buggy-ref' $Git @('--git-dir', $ObjectRepo, 'update-ref', 'refs/heads/gateb-buggy', $Buggy)
    $null = Invoke-Recorded 'pin-fixed-ref' $Git @('--git-dir', $ObjectRepo, 'update-ref', 'refs/heads/gateb-fixed', $Fixed)
    foreach ($Definition in @(@('buggy', $Buggy), @('fixed', $Fixed))) {
        $Role = $Definition[0]; $Commit = $Definition[1]
        $Ref = 'refs/heads/gateb-' + $Role
        $Shown = Command-Text (Invoke-Recorded "$Role-bare-show-ref" $Git @('--git-dir', $ObjectRepo, 'show-ref', '--verify', $Ref))
        Require ($Shown -ceq ($Commit + ' ' + $Ref)) "Named bare ref mismatch: $Ref"
        $Resolved = Command-Text (Invoke-Recorded "$Role-bare-resolve-ref" $Git @('--git-dir', $ObjectRepo, 'rev-parse', '--verify', $Ref))
        Require ($Resolved -ceq $Commit) "Named bare ref resolved to wrong SHA: $Ref"
        $CommitType = Command-Text (Invoke-Recorded "$Role-bare-commit-type" $Git @('--git-dir', $ObjectRepo, 'cat-file', '-t', $Commit))
        Require ($CommitType -ceq 'commit') "Pinned bare object is not a commit: $Commit"
        $null = Invoke-Recorded "$Role-bare-tree-exists" $Git @('--git-dir', $ObjectRepo, 'cat-file', '-e', "$Commit^{tree}")
        $TreeType = Command-Text (Invoke-Recorded "$Role-bare-tree-type" $Git @('--git-dir', $ObjectRepo, 'cat-file', '-t', "$Commit^{tree}"))
        Require ($TreeType -ceq 'tree') "Pinned commit tree object missing/wrong type: $Commit"
    }
    $null = Invoke-Recorded 'git-fsck' $Git @('--git-dir', $ObjectRepo, 'fsck', '--full', '--strict')
    $Parent = Command-Text (Invoke-Recorded 'fixed-parent' $Git @('--git-dir', $ObjectRepo, 'rev-parse', "$Fixed^"))
    Require ($Parent -ceq $Buggy) 'Fixed commit parent is not the pinned buggy commit'
    $Diff = Invoke-Recorded 'upstream-complete-diff' $Git @('--git-dir', $ObjectRepo, 'diff', '--no-ext-diff', '--no-textconv', '--binary', '--full-index', $Buggy, $Fixed)
    Copy-Item -LiteralPath $Diff.stdout -Destination (Join-Path $Provenance 'upstream-complete.diff')
    $SavedRoot = Join-Path $RepoRoot 'work\phase2\reproduction'
    foreach ($Name in @('official-regression.patch', 'upstream-fix.diff', 'official-parse.js')) {
        Require (Test-Path -LiteralPath (Join-Path $SavedRoot $Name) -PathType Leaf) "Missing preserved upstream bytes: $Name"
        Copy-Item -LiteralPath (Join-Path $SavedRoot $Name) -Destination (Join-Path $Provenance ("saved-" + $Name))
    }
    $Patch = Join-Path $Provenance 'saved-official-regression.patch'
    $Trees = @{}
    $OriginalInventories = @{}
    foreach ($Definition in @(@('buggy', $Buggy), @('fixed', $Fixed))) {
        $Role = $Definition[0]; $Commit = $Definition[1]
        $Tree = Join-Path $RunRoot ("source-" + $Role)
        $Trees[$Role] = $Tree
        $null = Invoke-Recorded "$Role-local-clone" $Git @('-c', 'core.autocrlf=false', 'clone', '--no-hardlinks', '--no-checkout', $ObjectRepo, $Tree)
        Require (-not (Test-Path -LiteralPath (Join-Path $Tree '.git\objects\info\alternates'))) 'Independent clone unexpectedly uses alternate object storage'
        $null = Invoke-Recorded "$Role-clone-commit-exists" $Git @('-C', $Tree, 'cat-file', '-e', "$Commit^{commit}")
        $null = Invoke-Recorded "$Role-clone-tree-exists" $Git @('-C', $Tree, 'cat-file', '-e', "$Commit^{tree}")
        $CloneTreeSha = Command-Text (Invoke-Recorded "$Role-clone-tree-before-checkout" $Git @('-C', $Tree, 'rev-parse', "$Commit^{tree}"))
        $null = Invoke-Recorded "$Role-checkout" $Git @('-C', $Tree, '-c', 'core.autocrlf=false', '-c', 'core.hooksPath=NUL', 'checkout', '--detach', $Commit)
        $ActualHead = Command-Text (Invoke-Recorded "$Role-exact-head" $Git @('-C', $Tree, 'rev-parse', 'HEAD'))
        Require ($ActualHead -ceq $Commit) 'Checked-out HEAD differs from approved full SHA'
        $Detached = Invoke-Recorded "$Role-detached-head" $Git @('-C', $Tree, 'symbolic-ref', '--quiet', 'HEAD') -AllowFailure
        Require ($Detached.exitCode -eq 1 -and -not $Detached.clientTimedOut -and $null -eq $Detached.launchError) 'Expected detached HEAD status was not observed'
        $null = Invoke-Recorded "$Role-clean-source" $Git @('-C', $Tree, 'diff', '--exit-code', $Commit, '--')
        $TreeSha = Command-Text (Invoke-Recorded "$Role-tree" $Git @('-C', $Tree, 'rev-parse', 'HEAD^{tree}'))
        Require ($TreeSha -ceq $CloneTreeSha) 'Checkout tree differs from pre-checkout verified tree'
        $Tracked = Invoke-Recorded "$Role-tracked-blobs" $Git @('-C', $Tree, 'ls-tree', '-r', '--full-tree', 'HEAD')
        Copy-Item -LiteralPath $Tracked.stdout -Destination (Join-Path $Provenance "$Role-git-tree.txt")
        $TrackedPaths = @(); $ExpectedBlobs = @()
        foreach ($Line in [IO.File]::ReadAllLines($Tracked.stdout)) {
            Require ($Line -match '^(100644|100755) blob ([a-f0-9]{40})\t([^"\r\n]+)$') 'Unexpected upstream tree entry/file type'
            $ExpectedBlobs += $Matches[2]; $TrackedPaths += $Matches[3]
        }
        $Materialized = Invoke-Recorded "$Role-materialized-blobs" $Git (@('-C', $Tree, 'hash-object', '--no-filters', '--') + $TrackedPaths)
        $ActualBlobs = @([IO.File]::ReadAllLines($Materialized.stdout))
        Require (($ExpectedBlobs -join "`n") -ceq ($ActualBlobs -join "`n")) 'Materialized source bytes differ from authentic Git blobs'
        $OriginalInventories[$Role] = @(Inventory $Tree)
        Write-Json (Join-Path $Provenance "$Role-source.json") ([ordered]@{
            origin = $Upstream; commit = $Commit; gitTreeSha1 = $TreeSha
            files = $OriginalInventories[$Role]
        })
        foreach ($Name in @('package.json', 'index.js', 'LICENSE', 'Makefile', 'test\parse.js')) {
            Copy-Item -LiteralPath (Join-Path $Tree $Name) -Destination (Join-Path $Provenance ("$Role-" + $Name.Replace('\', '-')))
        }
        $Package = Get-Content -LiteralPath (Join-Path $Tree 'package.json') -Raw | ConvertFrom-Json
        Require ($Package.name -ceq 'qs' -and $Package.main -ceq 'index.js') 'Unexpected upstream package entrypoint'
        Require ($Package.devDependencies.lab -ceq '3.x.x') 'Pinned package no longer declares Lab 3.x.x'
        Require (@($Package.dependencies.PSObject.Properties).Count -eq 0) 'Unexpected upstream runtime dependencies'
        Require ((Get-Content -LiteralPath (Join-Path $Tree 'LICENSE') -Raw) -match 'Redistribution and use in source and binary forms') 'BSD license bytes missing'
        Require ((Get-Content -LiteralPath (Join-Path $Tree 'Makefile') -Raw) -match '(?m)^\s*@node node_modules/lab/bin/lab\s*$') 'Official Makefile command changed'
    }

    # Validate BOTH saved patches against real fetched bytes. The complete saved
    # diff must turn the parent tree into the exact fixed tree (including tests).
    $null = Invoke-Recorded 'complete-patch-check' $Git @('-C', $Trees.buggy, 'apply', '--check', (Join-Path $Provenance 'saved-upstream-fix.diff'))
    $null = Invoke-Recorded 'complete-patch-apply' $Git @('-C', $Trees.buggy, 'apply', (Join-Path $Provenance 'saved-upstream-fix.diff'))
    Same-Inventory @(Inventory $Trees.buggy) $OriginalInventories.fixed 'complete preserved diff versus fixed source'
    $null = Invoke-Recorded 'complete-patch-reverse' $Git @('-C', $Trees.buggy, 'apply', '--reverse', (Join-Path $Provenance 'saved-upstream-fix.diff'))
    Same-Inventory @(Inventory $Trees.buggy) $OriginalInventories.buggy 'parent source after reversing complete patch'
    $null = Invoke-Recorded 'test-patch-check' $Git @('-C', $Trees.buggy, 'apply', '--check', $Patch)
    $null = Invoke-Recorded 'test-patch-apply' $Git @('-C', $Trees.buggy, 'apply', $Patch)
    $Changed = Command-Text (Invoke-Recorded 'buggy-changed-paths' $Git @('-C', $Trees.buggy, 'diff', '--name-only', '--no-ext-diff'))
    Require ($Changed -ceq 'test/parse.js') 'Regression patch changed more than test/parse.js'
    $BuggyParse = Join-Path $Trees.buggy 'test\parse.js'
    $FixedParse = Join-Path $Trees.fixed 'test\parse.js'
    Require ((Hash-File $BuggyParse) -ceq (Hash-File $FixedParse)) 'Complete parse suite bytes differ between roles'
    Require ((Hash-File $FixedParse) -ceq (Hash-File (Join-Path $Provenance 'saved-official-parse.js'))) 'Saved complete official parse bytes do not match upstream'
    # Reversibility proves the existing parse controls retain their exact bytes.
    $null = Invoke-Recorded 'test-patch-reverse' $Git @('-C', $Trees.buggy, 'apply', '--reverse', $Patch)
    Same-Inventory @(Inventory $Trees.buggy) $OriginalInventories.buggy 'all original controls and production bytes'
    $null = Invoke-Recorded 'test-patch-freeze' $Git @('-C', $Trees.buggy, 'apply', $Patch)
    $OriginalControls = @($OriginalInventories.buggy | Where-Object { $_.path.StartsWith('test/') -and $_.path -cne 'test/parse.js' })
    Same-Inventory $OriginalControls @($OriginalInventories.fixed | Where-Object { $_.path.StartsWith('test/') -and $_.path -cne 'test/parse.js' }) 'other complete upstream test files'
    Write-Json (Join-Path $Provenance 'official-tests.json') ([ordered]@{
        parseSha256 = Hash-File $FixedParse; patchSha256 = Hash-File $Patch
        originalParseSha256 = ($OriginalInventories.buggy | Where-Object path -CEQ 'test/parse.js').sha256
        unchangedOtherTests = $OriginalControls; reversiblePatch = $true
        officialArgv = @('node', '--require', '/case/gate-b-lab-adaptation.cjs', 'node_modules/lab/bin/lab', '-r', 'tap')
        scope = 'Entire unfiltered upstream test directory, including complete fixed test/parse.js'
    })

    # HOST: install a separate pinned dependency closure. A registry or install
    # failure aborts here with raw npm logs, rather than substituting a runner.
    $Bundle = Join-Path $RunRoot 'lab-bundle'
    $NpmLogs = Join-Path $RunRoot 'npm-logs'
    $NpmCache = Join-Path $RunRoot 'npm-cache'
    New-Item -ItemType Directory -Path $Bundle, $NpmLogs, $NpmCache | Out-Null
    $UserConfig = Join-Path $RunRoot 'npm-user-empty.npmrc'
    $GlobalConfig = Join-Path $RunRoot 'npm-global-empty.npmrc'
    Write-Text $UserConfig ''; Write-Text $GlobalConfig ''
    $NpmBase = @($NpmCli, '--registry=https://registry.npmjs.org/', "--userconfig=$UserConfig", "--globalconfig=$GlobalConfig", '--loglevel=verbose', "--logs-dir=$NpmLogs", "--cache=$NpmCache")
    $MetadataRecord = Invoke-Recorded 'lab-registry-metadata' $Node ($NpmBase + @('view', "lab@$LabVersion", '--json')) -TimeoutSeconds 120
    Copy-Item -LiteralPath $MetadataRecord.stdout -Destination (Join-Path $Provenance 'lab-registry.json')
    $Metadata = Get-Content -LiteralPath $MetadataRecord.stdout -Raw | ConvertFrom-Json
    Require ($Metadata.name -ceq 'lab' -and $Metadata.version -ceq $LabVersion) 'Registry metadata did not resolve the concrete Lab 3.x pin'
    Require (-not [string]::IsNullOrWhiteSpace($Metadata.dist.integrity)) 'Lab registry integrity is missing'
    Write-Json (Join-Path $Bundle 'package.json') ([ordered]@{
        name = 'replaykit-gate-b-lab-bundle'; version = '1.0.0'; private = $true
        dependencies = [ordered]@{ lab = $LabVersion }
    })
    $null = Invoke-Recorded 'lab-lock' $Node ($NpmBase + @('install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact')) -WorkingDirectory $Bundle -TimeoutSeconds 180
    $null = Invoke-Recorded 'lab-ci' $Node ($NpmBase + @('ci', '--ignore-scripts', '--no-audit', '--no-fund')) -WorkingDirectory $Bundle -TimeoutSeconds 180
    $LockPath = Join-Path $Bundle 'package-lock.json'
    # npm v3 lockfiles use packages[""] for their root. Windows PowerShell 5.1
    # cannot materialize that key as a PSCustomObject. Run fixed, provenance-
    # copied Node code against JSON data and require its recorded exit 0.
    $LockValidation = Invoke-Recorded 'lab-lock-validate' $Node @($LockValidator, $LockPath, $LabVersion, $Metadata.dist.integrity)
    Copy-Item -LiteralPath $LockValidation.stdout -Destination (Join-Path $Provenance 'lab-lock-validation.json')
    Require (Test-Path -LiteralPath (Join-Path $Bundle 'node_modules\lab\bin\lab') -PathType Leaf) 'Official Lab executable missing after npm ci'
    $LabLeaks = Join-Path $Bundle 'node_modules\lab\lib\leaks.js'
    $LabTap = Join-Path $Bundle 'node_modules\lab\lib\reporters\tap.js'
    Require ((Hash-File $LabLeaks) -ceq 'b4455470cb519a1a5189f8024a8c7b7e620435e5cd87cf494e98260626d8bb32') 'Lab 3.0.0 leak detector differs from predeclared adaptation target'
    Require ((Hash-File $LabTap) -ceq 'dcd8b9d6f8399e0a4c1ca942739ff972fba807b05313a16d29b6fe7ff150a0fa') 'Lab 3.0.0 TAP reporter differs from predeclared per-test contract'
    Copy-Item -LiteralPath $LockPath -Destination (Join-Path $Provenance 'lab-package-lock.json')
    Write-Json (Join-Path $Provenance 'lab-bundle-files.json') @(Inventory $Bundle)

    # Freeze the same reviewed probe, exact-eight Lab adaptation, and TAP
    # verifier before either role executes. No Lab -l switch is used.
    foreach ($Name in @('gate-b-probe.cjs', 'gate-b-lab-adaptation.cjs', 'verify-gate-b-tap.mjs')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $Name) -Destination (Join-Path $Provenance $Name)
    }
    $TapVerifier = Join-Path $Provenance 'verify-gate-b-tap.mjs'
    Write-Json (Join-Path $Provenance 'node22-adaptation.json') ([ordered]@{
        mode = 'exact-eight-unchanged-node-globals'; image = $ImageDigest; labVersion = $LabVersion
        allowed = @('queueMicrotask', 'structuredClone', 'atob', 'btoa', 'performance', 'fetch', 'navigator', 'crypto')
        labLeaksSha256 = Hash-File $LabLeaks; labTapSha256 = Hash-File $LabTap
        preloadSha256 = Hash-File (Join-Path $Provenance 'gate-b-lab-adaptation.cjs')
        probeSha256 = Hash-File (Join-Path $Provenance 'gate-b-probe.cjs')
        tapVerifierSha256 = Hash-File $TapVerifier
        officialArgv = @('node', '--require', '/case/gate-b-lab-adaptation.cjs', 'node_modules/lab/bin/lab', '-r', 'tap')
        expected = [ordered]@{ plan = 56; buggyPass = 55; buggyFail = @(40); fixedPass = 56; fixedFail = @(); skips = 0; todo = 0 }
    })
    $Supervisor = @'
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const root = '/tmp/gate-b-evidence';
fs.mkdirSync(root, { recursive: true });
function exportBytes(name, bytes, append) {
    process.stdout.write(JSON.stringify({ event: 'gate-b-artifact', path: name,
        append, base64: bytes.toString('base64') }) + '\n');
}
const write = (name, value) => {
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    fs.writeFileSync(path.join(root, name), bytes);
    exportBytes(name, bytes, false);
};
function inventory(dir, relative = '') {
    return fs.readdirSync(dir).sort().flatMap(name => {
        const absolute = path.join(dir, name);
        const rel = relative ? relative + '/' + name : name;
        const stat = fs.lstatSync(absolute);
        if (stat.isSymbolicLink()) {
            // npm's .bin links are not used; record their identity explicitly.
            return [{ path: rel, link: fs.readlinkSync(absolute) }];
        }
        if (stat.isDirectory()) return inventory(absolute, rel);
        if (!stat.isFile()) throw new Error('Unexpected input file type: ' + rel);
        const bytes = fs.readFileSync(absolute);
        return [{ path: rel, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }];
    });
}
// Supplemental child timer only. The independent native timeout is PID 1 and
// kills the container's process group even if this event loop stalls or exits.
const supervisorDeadlineOrigin = { utc: new Date().toISOString(), monotonicNs: process.hrtime.bigint().toString() };
const deadline = Date.now() + 28000;
async function run(name, args) {
    const out = fs.openSync(path.join(root, name + '.stdout'), 'w');
    const err = fs.openSync(path.join(root, name + '.stderr'), 'w');
    const record = { argv: [process.execPath, ...args], startedAt: new Date().toISOString(),
        exitCode: null, signal: null, timedOut: false, launchError: null,
        supplementalDeadlineOrigin: supervisorDeadlineOrigin, supplementalTimeoutMs: 28000, killRequest: null };
    exportBytes(name + '.stdout', Buffer.alloc(0), false);
    exportBytes(name + '.stderr', Buffer.alloc(0), false);
    try {
        await new Promise(resolve => {
            const child = spawn(process.execPath, args, { cwd: '/case', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
            child.stdout.on('data', bytes => { fs.writeSync(out, bytes); exportBytes(name + '.stdout', bytes, true); });
            child.stderr.on('data', bytes => { fs.writeSync(err, bytes); exportBytes(name + '.stderr', bytes, true); });
            const timer = setTimeout(() => {
                record.timedOut = true;
                record.killRequest = { requestedAt: new Date().toISOString(), signal: 'SIGKILL', pid: child.pid,
                    accepted: child.kill('SIGKILL') };
            }, Math.max(1, deadline - Date.now()));
            child.on('error', error => { record.launchError = { name: error.name, message: error.message, stack: error.stack }; });
            child.on('close', (code, signal) => { clearTimeout(timer); record.exitCode = code; record.signal = signal; resolve(); });
        });
    } finally {
        fs.closeSync(out); fs.closeSync(err);
        record.finishedAt = new Date().toISOString();
        write(name + '.json', record);
    }
    return record;
}
(async () => {
    write('runtime.json', { argv: process.argv, node: process.version, versions: process.versions,
        platform: process.platform, arch: process.arch, uid: process.getuid(), gid: process.getgid(),
        cwd: process.cwd(), environment: process.env, supplementalDeadlineOrigin: supervisorDeadlineOrigin,
        nativeWatchdog: { pid: 1, executable: fs.readlinkSync('/proc/1/exe'),
            argv: fs.readFileSync('/proc/1/cmdline', 'utf8').split('\0').filter(Boolean),
            executableSha256: crypto.createHash('sha256').update(fs.readFileSync('/usr/bin/timeout')).digest('hex'),
            timeoutSeconds: 29, signal: 'SIGKILL', independentOfDockerAttach: true }, deadlineMs: 28000 });
    write('inputs-before.json', inventory('/case'));
    const official = await run('official', ['--require', '/case/gate-b-lab-adaptation.cjs', 'node_modules/lab/bin/lab', '-r', 'tap']);
    if (!official.timedOut && Date.now() < deadline) await run('probe', ['gate-b-probe.cjs']);
    write('inputs-after.json', inventory('/case'));
    write('completed.json', { finishedAt: new Date().toISOString() });
})().catch(error => {
    write('supervisor-error.json', { name: error.name, message: error.message, stack: error.stack });
    process.stderr.write(String(error.stack) + '\n');
    process.exitCode = 2;
});
'@
    Write-Text (Join-Path $Provenance 'gate-b-supervisor.cjs') ($Supervisor + "`n")

    # Freeze payloads before the first container. npm .bin command shims are not
    # needed by the official direct-node invocation; exclude that directory.
    $Payloads = @{}
    foreach ($Role in @('buggy', 'fixed')) {
        $Payload = Join-Path $RunRoot ("payload-" + $Role)
        New-Item -ItemType Directory -Path $Payload | Out-Null
        foreach ($File in @(Inventory $Trees[$Role])) {
            $Destination = Join-Path $Payload $File.path
            New-Item -ItemType Directory -Path (Split-Path $Destination -Parent) -Force | Out-Null
            Copy-Item -LiteralPath (Join-Path $Trees[$Role] $File.path) -Destination $Destination
        }
        Copy-Item -LiteralPath (Join-Path $Bundle 'node_modules') -Destination $Payload -Recurse
        $Bin = Join-Path $Payload 'node_modules\.bin'
        if (Test-Path -LiteralPath $Bin) {
            # Only this run's private payload command shims; no shared resources.
            $ResolvedBin = [IO.Path]::GetFullPath($Bin)
            Require ($ResolvedBin.StartsWith($Payload + '\', [StringComparison]::OrdinalIgnoreCase)) 'Unsafe private .bin path'
            Remove-Item -LiteralPath $ResolvedBin -Recurse -Force
        }
        foreach ($Name in @('gate-b-probe.cjs', 'gate-b-lab-adaptation.cjs', 'gate-b-supervisor.cjs')) {
            Copy-Item -LiteralPath (Join-Path $Provenance $Name) -Destination (Join-Path $Payload $Name)
        }
        $Files = @(Inventory $Payload)
        Write-Json (Join-Path $Provenance "$Role-payload.json") $Files
        $Payloads[$Role] = [pscustomobject]@{ path = $Payload; files = $Files }
    }

    # OFFLINE EXECUTION: an already present immutable image is required. This
    # runbook deliberately does not pull/build/alter images or existing resources.
    $null = Invoke-Recorded 'docker-version' $Docker @('version', '--format', '{{json .}}')
    $null = Invoke-Recorded 'docker-info' $Docker @('info', '--format', '{{json .}}')
    $null = Invoke-Recorded 'containers-before' $Docker @('ps', '-a', '--no-trunc', '--format', '{{json .}}')
    $ImageRecord = Invoke-Recorded 'image-inspect' $Docker @('image', 'inspect', $ImageDigest)
    $Image = @(Get-Content -LiteralPath $ImageRecord.stdout -Raw | ConvertFrom-Json)[0]
    Require (@($Image.RepoDigests) -contains $ImageDigest) 'Inspected image does not have the pinned repository digest'
    foreach ($Role in @('buggy', 'fixed')) {
        [Console]::Error.WriteLine("Gate B offline execution: $Role (native 29-second watchdog; measured 30-second lifetime policy)")
        $Name = 'replaykit-gate-b-' + $RunToken + '-' + $Role
        $VolumeName = $Name + '-case'
        # A fresh explicit writable volume makes docker cp valid even though the
        # container root is read-only. No host directory is mounted. The same
        # private volume stays mounted during execution and is hash-checked.
        $VolumeAbsent = Invoke-Recorded "$Role-volume-must-be-new" $Docker @('volume', 'inspect', $VolumeName) -AllowFailure
        Require ($VolumeAbsent.exitCode -ne 0 -and [IO.File]::ReadAllText($VolumeAbsent.stderr) -match 'no such volume') 'Cannot establish a fresh private staging volume name'
        $Volume = [pscustomobject]@{ role = $Role; name = $VolumeName; cleaned = $false }
        $Volumes.Add($Volume)
        $null = Invoke-Recorded "$Role-volume-create" $Docker @('volume', 'create', '--driver', 'local', '--label', "replaykit.gate-b.token=$RunToken", '--label', "replaykit.gate-b.role=$Role", $VolumeName)
        $null = Inspect-OwnedVolume $Volume 'created'
        $CidFile = Join-Path $RunRoot ("$Role-container.cid")
        $CreateArgs = @('create', '--pull=never', '--name', $Name, '--cidfile', $CidFile,
            '--label', "replaykit.gate-b.token=$RunToken", '--label', "replaykit.gate-b.role=$Role",
            '--network', 'none', '--user', '1000:1000', '--read-only', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges', '--cpus', '1', '--memory', '256m', '--memory-swap', '256m',
            '--pids-limit', '64', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=32m,mode=1777',
            '--mount', "type=volume,source=$VolumeName,target=/case,volume-nocopy",
            '--workdir', '/case', '--env', 'HOME=/tmp', '--env', 'TMPDIR=/tmp', '--env', 'NODE_OPTIONS=',
            '--env', 'NODE_PATH=', '--entrypoint', '/usr/bin/timeout', $ImageDigest,
            '--verbose', '--signal=KILL', '29s', 'node', '/case/gate-b-supervisor.cjs')
        $Created = Invoke-Recorded "$Role-create" $Docker $CreateArgs -AllowFailure
        # --cidfile also recovers ownership if a create client exits abnormally.
        if (-not (Test-Path -LiteralPath $CidFile -PathType Leaf)) {
            $RecoveryInspect = Invoke-Recorded "$Role-recover-create-by-exact-name" $Docker @('container', 'inspect', $Name) -AllowFailure
            if ($RecoveryInspect.exitCode -eq 0) {
                $RecoveredContainer = @(Get-Content -LiteralPath $RecoveryInspect.stdout -Raw | ConvertFrom-Json)[0]
                Require ($RecoveredContainer.Name -ceq ('/' + $Name) -and $RecoveredContainer.Config.Labels.'replaykit.gate-b.token' -ceq $RunToken) 'Recovered container ownership mismatch'
                Write-Text $CidFile $RecoveredContainer.Id
            }
        }
        Require (Test-Path -LiteralPath $CidFile -PathType Leaf) "Docker create did not record an exact container ID: $Role"
        $Id = [IO.File]::ReadAllText($CidFile).Trim()
        Require ($Id -match '^[a-f0-9]{64}$') 'Docker cidfile is not a full container ID'
        $Container = [pscustomobject]@{ role = $Role; id = $Id; name = $Name; cleaned = $false }
        $Containers.Add($Container)
        Require ($Created.exitCode -eq 0 -and -not $Created.clientTimedOut) "Docker create failed for $Role"
        # Inspect the writable destination BEFORE copying, so an unexpected mount
        # never receives host source. Inspect again after copying and before start.
        $Before = Inspect-Owned $Container 'before'
        Require ($Before.Image -ceq $Image.Id) 'Container image ID differs from pinned inspected image'
        Require ($Before.Config.User -ceq '1000:1000' -and $Before.Config.WorkingDir -ceq '/case') 'Unexpected container user/workdir'
        Require ($Before.HostConfig.NetworkMode -ceq 'none' -and $Before.HostConfig.ReadonlyRootfs) 'Container network/root policy mismatch'
        Require ($Before.HostConfig.NanoCpus -eq 1000000000 -and $Before.HostConfig.Memory -eq 268435456 -and $Before.HostConfig.PidsLimit -eq 64) 'Container resource policy mismatch'
        Require (@($Before.HostConfig.CapDrop) -contains 'ALL') 'Container capability drop missing'
        Require ((@($Before.HostConfig.SecurityOpt) -join ',') -match 'no-new-privileges') 'Container privilege policy missing'
        Require (@($Before.HostConfig.Binds | Where-Object { $null -ne $_ -and $_ -cne '' }).Count -eq 0) 'Unexpected container bind mount'
        $ConfiguredMounts = @($Before.HostConfig.Mounts)
        Require ($ConfiguredMounts.Count -eq 1 -and $ConfiguredMounts[0].Type -ceq 'volume' -and $ConfiguredMounts[0].Source -ceq $VolumeName -and $ConfiguredMounts[0].Target -ceq '/case' -and $ConfiguredMounts[0].VolumeOptions.NoCopy -eq $true) 'Configured private staging mount mismatch'
        $CaseMount = @($Before.Mounts | Where-Object { $_.Type -ceq 'volume' -and $_.Destination -ceq '/case' })
        Require ($CaseMount.Count -eq 1 -and $CaseMount[0].Name -ceq $VolumeName -and $CaseMount[0].RW -and $CaseMount[0].Driver -ceq 'local') 'Private writable staging mount mismatch'
        Require (@($Before.Mounts | Where-Object { -not (($_.Type -ceq 'volume' -and $_.Destination -ceq '/case' -and $_.Name -ceq $VolumeName) -or ($_.Type -ceq 'tmpfs' -and $_.Destination -ceq '/tmp')) }).Count -eq 0) 'Unexpected container volume/mount'
        $ConfiguredTmpfs = @($Before.HostConfig.Tmpfs.PSObject.Properties)
        Require ($ConfiguredTmpfs.Count -eq 1 -and $ConfiguredTmpfs[0].Name -ceq '/tmp' -and $Before.HostConfig.Tmpfs.'/tmp' -match 'size=32m' -and $Before.HostConfig.Tmpfs.'/tmp' -match 'noexec') 'Private bounded tmpfs missing'
        Require (@($Before.Config.Entrypoint).Count -eq 1 -and $Before.Config.Entrypoint[0] -ceq '/usr/bin/timeout' -and (@($Before.Config.Cmd) -join '|') -ceq '--verbose|--signal=KILL|29s|node|/case/gate-b-supervisor.cjs') 'Independent native watchdog command mismatch'
        $null = Invoke-Recorded "$Role-copy-inputs" $Docker @('cp', ($Payloads[$Role].path + '\.'), ($Id + ':/case'))
        $null = Inspect-OwnedVolume $Volume 'staged'
        $null = Inspect-Owned $Container 'staged-before-start'
        $Execution = Invoke-Recorded "$Role-start-attach" $Docker @('start', '--attach', $Id) -TimeoutSeconds 40 -AllowFailure
        if ($Execution.clientTimedOut) {
            $null = Invoke-Recorded "$Role-timeout-kill" $Docker @('kill', '--signal', 'KILL', $Id) -TimeoutSeconds 15 -AllowFailure
        }
        $After = Inspect-Owned $Container 'after'
        if ($After.State.Running) {
            $null = Invoke-Recorded "$Role-unexpected-running-kill" $Docker @('kill', '--signal', 'KILL', $Id) -TimeoutSeconds 15 -AllowFailure
            $After = Inspect-Owned $Container 'after-kill'
        }
        $null = Invoke-Recorded "$Role-docker-logs" $Docker @('logs', '--timestamps', $Id) -AllowFailure
        $Evidence = Join-Path $RunRoot ("evidence-" + $Role)
        $MalformedFrames = Recover-Evidence $Execution.stdout $Evidence
        $LifetimeMs = ((Docker-Time $After.State.FinishedAt) - (Docker-Time $After.State.StartedAt)).TotalMilliseconds
        $NativeKillDiagnostic = [IO.File]::ReadAllText($Execution.stderr) -match 'timeout: sending signal KILL'
        $RecoveryKillRequests = @($Commands | Where-Object { $_.argv.Count -eq 5 -and $_.argv[1] -ceq 'kill' -and $_.argv[4] -ceq $Id })
        $DeadlineEvidence = [ordered]@{
            mechanism = '/usr/bin/timeout --verbose --signal=KILL 29s (PID 1; process group signal)'
            independentOfAttachAndNodeEventLoop = $true; configuredWatchdogSeconds = 29
            maximumAllowedContainerLifetimeSeconds = 30; dockerClientTransportTimeoutSeconds = 40
            origin = 'Docker State.StartedAt is the conservative measured lifetime origin; native timeout begins when PID 1 starts'
            originUtc = $After.State.StartedAt; confirmedFinishedAtUtc = $After.State.FinishedAt
            observedContainerLifetimeMs = $LifetimeMs; confirmedTerminalState = (-not $After.State.Running -and $After.State.Status -ceq 'exited')
            nativeKillRequestDiagnosticObserved = $NativeKillDiagnostic
            nativeKillRequestRawStderr = $Execution.stderr
            nativeKillResultExitCode = $After.State.ExitCode
            nativeDeadlineKillConfirmed = ($NativeKillDiagnostic -and -not $After.State.Running -and $After.State.ExitCode -eq 137)
            recoveryKillRequests = $RecoveryKillRequests
            measuredLifetimePolicySatisfied = ($LifetimeMs -ge 0 -and $LifetimeMs -le 30000 -and -not $After.State.Running)
            limitation = 'No hard real-time scheduling guarantee is claimed. A missing watchdog, unconfirmed terminal state, or measured lifetime over 30 seconds blocks collection.'
        }
        Write-Json (Join-Path $Evidence 'deadline.json') $DeadlineEvidence
        $RoleRecord = [ordered]@{ role = $Role; containerId = $Id; imageId = $After.Image
            state = $After.State; attachTransportTimedOut = $Execution.clientTimedOut; deadline = $DeadlineEvidence
            stagingVolume = $VolumeName; writableStagingMount = '/case'; readOnlyRoot = $After.HostConfig.ReadonlyRootfs
            attachExitCode = $Execution.exitCode; evidenceDirectory = $Evidence
            sourceManifest = "provenance/$Role-source.json"; payloadManifest = "provenance/$Role-payload.json"
            official = $null; officialPerTest = $null; probe = $null; observedProbeEvents = @(); checks = [ordered]@{} }
        $Roles.Add([pscustomobject] $RoleRecord)
        Write-Json (Join-Path $Evidence 'docker-state.json') $After.State
        Require ($DeadlineEvidence.confirmedTerminalState -and $DeadlineEvidence.measuredLifetimePolicySatisfied) "Container 30-second lifetime/terminal-state policy not proven: $Role"
        Require (-not $Execution.clientTimedOut -and -not $After.State.Running -and -not $After.State.OOMKilled -and $After.State.ExitCode -eq 0) "Container did not complete cleanly: $Role"
        Require ($MalformedFrames -eq 0) "Incomplete/corrupt raw evidence transport: $Role"
        foreach ($Required in @('completed.json', 'inputs-before.json', 'inputs-after.json', 'runtime.json', 'official.json', 'official.stdout', 'official.stderr', 'probe.json', 'probe.stdout', 'probe.stderr')) {
            Require (Test-Path -LiteralPath (Join-Path $Evidence $Required) -PathType Leaf) "Missing $Role evidence: $Required"
        }
        foreach ($Stage in @('before', 'after')) {
            $Observed = @(Get-Content -LiteralPath (Join-Path $Evidence "inputs-$Stage.json") -Raw | ConvertFrom-Json)
            Same-Inventory $Payloads[$Role].files $Observed "$Role container input bytes $Stage execution"
        }
        $Runtime = Get-Content -LiteralPath (Join-Path $Evidence 'runtime.json') -Raw | ConvertFrom-Json
        Require ($Runtime.uid -eq 1000 -and $Runtime.gid -eq 1000) 'Observed child runtime identity is not nonroot'
        Require ($Runtime.nativeWatchdog.pid -eq 1 -and $Runtime.nativeWatchdog.executable -ceq '/usr/bin/timeout' -and (@($Runtime.nativeWatchdog.argv) -join '|') -ceq '/usr/bin/timeout|--verbose|--signal=KILL|29s|node|/case/gate-b-supervisor.cjs') 'Observed native PID 1 watchdog identity mismatch'
        $RoleResult = $Roles[$Roles.Count - 1]
        $RoleResult.official = Get-Content -LiteralPath (Join-Path $Evidence 'official.json') -Raw | ConvertFrom-Json
        $RoleResult.probe = Get-Content -LiteralPath (Join-Path $Evidence 'probe.json') -Raw | ConvertFrom-Json
        Require ((@($RoleResult.official.argv) -join '|') -ceq '/usr/local/bin/node|--require|/case/gate-b-lab-adaptation.cjs|node_modules/lab/bin/lab|-r|tap') "Official Lab adaptation/runner argv mismatch: $Role"
        $TapCheck = Invoke-Recorded "$Role-official-tap-validate" $Node @($TapVerifier, $Role, (Join-Path $Evidence 'official.stdout'), (Join-Path $Evidence 'official.stderr'))
        Copy-Item -LiteralPath $TapCheck.stdout -Destination (Join-Path $Evidence 'official-per-test.json')
        $RoleResult.officialPerTest = Get-Content -LiteralPath (Join-Path $Evidence 'official-per-test.json') -Raw | ConvertFrom-Json
        foreach ($Child in @($RoleResult.official, $RoleResult.probe)) {
            Require (-not $Child.timedOut -and $null -eq $Child.signal -and $null -eq $Child.launchError) "Child timeout/signal/spawn failure: $Role"
        }
        $Events = @([IO.File]::ReadAllLines((Join-Path $Evidence 'probe.stdout')) | Where-Object { $_.Length -gt 0 } | ForEach-Object { $_ | ConvertFrom-Json })
        $RoleResult.observedProbeEvents = $Events
        $Module = @($Events | Where-Object event -CEQ 'module')
        $Control = @($Events | Where-Object event -CEQ 'control')
        Require ($Module.Count -eq 1 -and $Module[0].path -ceq '/case/index.js') 'Probe did not load actual qs entrypoint'
        Require ($Control.Count -eq 1 -and $Control[0].passed) 'Unaffected direct-probe control failed'
        if ($Role -ceq 'buggy') {
            $Errors = @($Events | Where-Object event -CEQ 'issue33-error')
            Require (@($Events | Where-Object event -CEQ 'issue33-output').Count -eq 0 -and @($Events | Where-Object event -CEQ 'issue33-assertion').Count -eq 0) 'Buggy probe unexpectedly returned a passing issue33 output'
            Require ($RoleResult.official.exitCode -eq 1 -and $RoleResult.probe.exitCode -eq 1) 'Buggy official/probe exits did not show expected failing execution'
            Require ($Errors.Count -eq 1 -and $Errors[0].type -ceq 'TypeError' -and $Errors[0].message -ceq 'source.hasOwnProperty is not a function') 'Native issue33 library error identity missing'
            $Frames = @($Errors[0].stack -split "`n" | Where-Object { $_ -match '^\s+at .*?/case/' })
            Require ($Frames.Count -gt 0 -and $Frames[0] -match '/case/lib/utils\.js:47:\d+\)') 'Actual top qs identity frame is not the pinned clone failure'
            $RoleResult.checks.nativeTopApplicationFrame = $Frames[0]
            $ProbeStderrRaw = [IO.File]::ReadAllText((Join-Path $Evidence 'probe.stderr'))
            Require ($ProbeStderrRaw.StartsWith('TypeError: source.hasOwnProperty is not a function') -and $ProbeStderrRaw -match 'at exports\.clone \(/case/lib/utils\.js:47:20\)') 'Raw buggy probe stderr lacks native qs TypeError and production top frame'
            $OfficialRaw = [IO.File]::ReadAllText((Join-Path $Evidence 'official.stdout')) + [IO.File]::ReadAllText((Join-Path $Evidence 'official.stderr'))
            Require ($OfficialRaw.Contains('parses plain objects correctly') -and $OfficialRaw.Contains('TypeError') -and $OfficialRaw -match '/case/lib/utils\.js:47:') 'Official suite lacks the regression/native production-stack evidence; supplementary probe cannot replace it'
        } else {
            Require ($RoleResult.official.exitCode -eq 0 -and $RoleResult.probe.exitCode -eq 0) 'Fixed official suite or probe failed'
            Require (@($Events | Where-Object event -CEQ 'issue33-error').Count -eq 0 -and @($Events | Where-Object event -CEQ 'issue33-output').Count -eq 1) 'Fixed probe returned unexpected error or output count'
            $Assertions = @($Events | Where-Object event -CEQ 'issue33-assertion')
            Require ($Assertions.Count -eq 1 -and $Assertions[0].passed) 'Fixed real output assertion missing'
        }
        $RoleResult.checks.inputHashesBeforeAndAfterMatch = $true
        $RoleResult.checks.actualEntrypointLoaded = $Module[0].path
        $RoleResult.checks.directControlPassed = $Control[0].passed
        # Inspect and remove this exact owned container before starting next role.
        $null = Inspect-Owned $Container 'before-remove'
        $null = Invoke-Recorded "$Role-remove" $Docker @('rm', $Id)
        $Absent = Invoke-Recorded "$Role-confirm-removed" $Docker @('container', 'inspect', $Id) -AllowFailure
        Require ($Absent.exitCode -ne 0 -and [IO.File]::ReadAllText($Absent.stderr) -match 'No such (object|container)') "Container removal not confirmed: $Id"
        $Container.cleaned = $true
        $null = Inspect-OwnedVolume $Volume 'before-remove'
        $null = Invoke-Recorded "$Role-volume-remove" $Docker @('volume', 'rm', $VolumeName)
        $VolumeAbsent = Invoke-Recorded "$Role-volume-confirm-removed" $Docker @('volume', 'inspect', $VolumeName) -AllowFailure
        Require ($VolumeAbsent.exitCode -ne 0 -and [IO.File]::ReadAllText($VolumeAbsent.stderr) -match 'no such volume') 'Private staging volume removal not confirmed'
        $Volume.cleaned = $true
    }
    Require ($Roles.Count -eq 2 -and $Roles[0].role -ceq 'buggy' -and $Roles[1].role -ceq 'fixed') 'Sequential buggy/fixed role pair incomplete'
    Require ($Roles[0].officialPerTest.testIdentitySha256 -ceq $Roles[1].officialPerTest.testIdentitySha256) 'Buggy/fixed official per-test identities differ'
    $CollectionComplete = $true
    $Missing.Add('Independent review of the full official raw suite output, individual unchanged controls, and absence of unrelated failures/skips is still required.')
    $Missing.Add('This pair is Gate B preflight evidence only; no external runner, independent evaluator decision, alternate/decoy matrix or 10-run determinism evidence was produced.')
} catch {
    $Missing.Add($_.Exception.Message)
    Write-Text (Join-Path $RunRoot 'collection-error.txt') ($_ | Out-String)
    [Console]::Error.WriteLine("Gate B collection stopped: $($_.Exception.Message)")
} finally {
    # Never enumerate-and-delete resources. Only full IDs obtained from this
    # run's cidfiles, checked against this run's random ownership label, qualify.
    foreach ($Container in $Containers) {
        if ($Container.cleaned) { continue }
        try {
            $State = Inspect-Owned $Container 'cleanup'
            if ($State.State.Running) {
                $null = Invoke-Recorded "$($Container.role)-cleanup-kill" $Docker @('kill', '--signal', 'KILL', $Container.id) -TimeoutSeconds 15
            }
            $null = Inspect-Owned $Container 'cleanup-final-state'
            $null = Invoke-Recorded "$($Container.role)-cleanup-logs" $Docker @('logs', '--timestamps', $Container.id) -AllowFailure
            $Transport = @($Commands | Where-Object { $_.argv.Count -eq 4 -and $_.argv[1] -ceq 'start' -and $_.argv[3] -ceq $Container.id })
            if ($Transport.Count -gt 0) {
                $Recovery = Join-Path $RunRoot ("recovered-evidence-" + $Container.role)
                $null = Recover-Evidence $Transport[0].stdout $Recovery
            }
            $null = Invoke-Recorded "$($Container.role)-cleanup-remove" $Docker @('rm', $Container.id)
            $Absent = Invoke-Recorded "$($Container.role)-cleanup-confirm" $Docker @('container', 'inspect', $Container.id) -AllowFailure
            Require ($Absent.exitCode -ne 0 -and [IO.File]::ReadAllText($Absent.stderr) -match 'No such (object|container)') 'Cleanup removal not confirmed'
            $Container.cleaned = $true
        } catch {
            $Missing.Add("Cleanup unconfirmed for exact owned container $($Container.id): $($_.Exception.Message)")
            $CollectionComplete = $false
        }
    }
    # Private staging storage is removed only by its exact random name and
    # ownership label, after container cleanup. Never force-remove an in-use
    # volume, and never prune or enumerate other Docker storage for deletion.
    foreach ($Volume in $Volumes) {
        if ($Volume.cleaned) { continue }
        try {
            $null = Inspect-OwnedVolume $Volume 'cleanup'
            $null = Invoke-Recorded "$($Volume.role)-volume-cleanup-remove" $Docker @('volume', 'rm', $Volume.name)
            $AbsentVolume = Invoke-Recorded "$($Volume.role)-volume-cleanup-confirm" $Docker @('volume', 'inspect', $Volume.name) -AllowFailure
            Require ($AbsentVolume.exitCode -ne 0 -and [IO.File]::ReadAllText($AbsentVolume.stderr) -match 'no such volume') 'Private staging volume cleanup not confirmed'
            $Volume.cleaned = $true
        } catch {
            $Missing.Add("Cleanup unconfirmed for exact owned volume $($Volume.name): $($_.Exception.Message)")
            $CollectionComplete = $false
        }
    }
    if ($Docker) {
        try { $null = Invoke-Recorded 'containers-after' $Docker @('ps', '-a', '--no-trunc', '--format', '{{json .}}') } catch { $Missing.Add($_.Exception.Message); $CollectionComplete = $false }
    }
    $Status = 'BLOCKED'
    if ($Roles.Count -gt 0) { $Status = 'PARTIAL' }
    $SummaryPath = Join-Path $RunRoot 'GATE_B_SUMMARY.md'
    $SummaryLines = @(
        '# Gate B collection summary', '',
        "Run ID: $RunId", "Status: $Status", "Evidence collection completed: $CollectionComplete",
        'Gate B accepted: false (independent raw-evidence review required)',
        "Pinned Node image: $ImageDigest",
        'Lab adaptation: exact eight unchanged Node 22 globals; no -l flag',
        "Runbook SHA-256: $(Hash-File $MyInvocation.MyCommand.Path)", ''
    )
    foreach ($RoleResult in $Roles) {
        $OfficialExit = if ($null -ne $RoleResult.official) { $RoleResult.official.exitCode } else { 'not recorded' }
        $ProbeExit = if ($null -ne $RoleResult.probe) { $RoleResult.probe.exitCode } else { 'not recorded' }
        $SummaryLines += "Role $($RoleResult.role): container exit $($RoleResult.state.ExitCode); official child exit $OfficialExit; probe child exit $ProbeExit"
        if ($null -ne $RoleResult.officialPerTest) {
            $SummaryLines += "  TAP: $($RoleResult.officialPerTest.counts.pass) pass, $($RoleResult.officialPerTest.counts.fail) fail, $($RoleResult.officialPerTest.counts.skipped) skipped, $($RoleResult.officialPerTest.counts.todo) TODO; identity SHA-256 $($RoleResult.officialPerTest.testIdentitySha256)"
        }
    }
    $SummaryLines += ''
    $SummaryLines += 'Missing evidence or review requirements:'
    if ($Missing.Count -eq 0) { $SummaryLines += '- None recorded' }
    else { foreach ($Reason in $Missing) { $SummaryLines += "- $Reason" } }
    $SummaryLines += ''
    $BuggyEvidence = Join-Path $RunRoot 'evidence-buggy'
    foreach ($StreamName in @('probe.stdout', 'probe.stderr')) {
        $StreamPath = Join-Path $BuggyEvidence $StreamName
        $SummaryLines += "Buggy $StreamName (raw evidence at $StreamPath):"
        $SummaryLines += '```text'
        if (Test-Path -LiteralPath $StreamPath -PathType Leaf) { $SummaryLines += [IO.File]::ReadAllText($StreamPath).TrimEnd() }
        else { $SummaryLines += '[not collected]' }
        $SummaryLines += '```'
        $SummaryLines += ''
    }
    Write-Text $SummaryPath (($SummaryLines -join "`n") + "`n")
    # Hash raw output and evidence only after cleanup has completed its logging.
    $Artifacts = @()
    foreach ($Directory in @($Logs, $Provenance) + @(Get-ChildItem -LiteralPath $RunRoot -Directory | Where-Object Name -Match '^(evidence-|recovered-evidence-|npm-logs$)' | ForEach-Object FullName)) {
        foreach ($File in @(Get-ChildItem -LiteralPath $Directory -File -Recurse -Force)) {
            $Artifacts += [pscustomobject]@{ path = $File.FullName.Substring($RunRoot.Length + 1).Replace('\', '/'); bytes = $File.Length; sha256 = Hash-File $File.FullName }
        }
    }
    $SummaryFile = Get-Item -LiteralPath $SummaryPath
    $Artifacts += [pscustomobject]@{ path = 'GATE_B_SUMMARY.md'; bytes = $SummaryFile.Length; sha256 = Hash-File $SummaryPath }
    Write-Json (Join-Path $RunRoot 'artifact-sha256.json') $Artifacts
    Write-Json (Join-Path $RunRoot 'report.json') ([ordered]@{
        schemaVersion = 1; runId = $RunId; status = $Status
        evidenceCollectionCompleted = $CollectionComplete; gateBAccepted = $false
        startedAt = $StartedAt; finishedAt = [DateTime]::UtcNow.ToString('o')
        repository = $Upstream; buggyCommit = $Buggy; fixedCommit = $Fixed
        image = $ImageDigest; labVersion = $LabVersion
        roleExecutions = @($Roles.ToArray()); ownedContainers = @($Containers.ToArray()); ownedVolumes = @($Volumes.ToArray())
        missingEvidence = @($Missing.ToArray()); commands = @($Commands.ToArray())
        artifactManifest = 'artifact-sha256.json'; summaryFile = 'GATE_B_SUMMARY.md'; summarySha256 = Hash-File $SummaryPath
        reviewNote = 'No VERIFIED/PASS verdict is synthesized. Read original raw official stdout/stderr separately from supplementary probe evidence.'
    })
    [Console]::Out.Write([IO.File]::ReadAllText($SummaryPath))
}
if (-not $CollectionComplete) { exit 1 }
exit 0
