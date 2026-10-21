#requires -Version 5.1
<#
.SYNOPSIS
Local-only regression for SHA fetches into an otherwise unreferenced bare repo.
.DESCRIPTION
Creates two synthetic commits; no upstream/network/npm/Docker/runbook execution.
Every Git command records exact argv, stdout, stderr and exit code. Results and
logs stay in a new result directory. Isolated repos live in its private repos/
subdirectory and are retained; this test never recursively deletes a directory.
#>
[CmdletBinding()]
param([string] $ResultDirectory = '')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Token = [Guid]::NewGuid().ToString('N')
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ([string]::IsNullOrWhiteSpace($ResultDirectory)) {
    $ResultDirectory = Join-Path $RepoRoot ("work\phase2\git-fetch-bare-tests\" + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + $Token.Substring(0, 8))
}
$ResultDirectory = [IO.Path]::GetFullPath($ResultDirectory)
if (Test-Path -LiteralPath $ResultDirectory) { throw "Refusing existing result directory: $ResultDirectory" }
New-Item -ItemType Directory -Path $ResultDirectory | Out-Null
$TemporaryRoot = Join-Path $ResultDirectory 'repos'
if (Test-Path -LiteralPath $TemporaryRoot) { throw "Refusing existing temporary directory: $TemporaryRoot" }
New-Item -ItemType Directory -Path $TemporaryRoot | Out-Null
$Git = (Get-Command git.exe -ErrorAction Stop).Source
$Encoding = New-Object Text.UTF8Encoding($false)
$Records = New-Object 'System.Collections.Generic.List[object]'
$Sequence = 0
$Passed = $false
$Failure = $null
$Buggy = $null; $Fixed = $null
$PreFixCheckout = $null
$RoleResults = @()

function Assert-True([bool] $Condition, [string] $Message) {
    if (-not $Condition) { throw $Message }
}
function Quote-Argument([string] $Value) {
    if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
    $Builder = New-Object Text.StringBuilder
    [void] $Builder.Append('"'); $Slashes = 0
    foreach ($Character in $Value.ToCharArray()) {
        if ($Character -eq '\') { $Slashes++; continue }
        if ($Character -eq '"') { [void] $Builder.Append(('\' * (2 * $Slashes + 1))) }
        else { [void] $Builder.Append(('\' * $Slashes)) }
        [void] $Builder.Append($Character); $Slashes = 0
    }
    [void] $Builder.Append(('\' * (2 * $Slashes))); [void] $Builder.Append('"')
    return $Builder.ToString()
}
function Invoke-Git([string] $Name, [string[]] $Arguments, [switch] $AllowFailure) {
    $script:Sequence++
    $Prefix = Join-Path $ResultDirectory ('{0:D2}-{1}' -f $script:Sequence, $Name)
    $Process = New-Object Diagnostics.Process
    $Process.StartInfo.FileName = $Git
    $Process.StartInfo.Arguments = (($Arguments | ForEach-Object { Quote-Argument $_ }) -join ' ')
    $Process.StartInfo.WorkingDirectory = $TemporaryRoot
    $Process.StartInfo.UseShellExecute = $false
    $Process.StartInfo.CreateNoWindow = $true
    $Process.StartInfo.RedirectStandardOutput = $true
    $Process.StartInfo.RedirectStandardError = $true
    foreach ($Key in @('GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_COUNT', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_OBJECT_DIRECTORY')) {
        $Process.StartInfo.EnvironmentVariables.Remove($Key)
    }
    $Process.StartInfo.EnvironmentVariables['GIT_CONFIG_NOSYSTEM'] = '1'
    $Process.StartInfo.EnvironmentVariables['GIT_CONFIG_GLOBAL'] = 'NUL'
    $Process.StartInfo.EnvironmentVariables['GIT_TERMINAL_PROMPT'] = '0'
    $Out = [IO.File]::Create($Prefix + '.stdout')
    $Err = [IO.File]::Create($Prefix + '.stderr')
    $Record = [ordered]@{ argv = @($Git) + @($Arguments); exitCode = $null
        stdout = $Prefix + '.stdout'; stderr = $Prefix + '.stderr'; timedOut = $false; launchError = $null }
    try {
        [void] $Process.Start()
        $CopyOut = $Process.StandardOutput.BaseStream.CopyToAsync($Out)
        $CopyErr = $Process.StandardError.BaseStream.CopyToAsync($Err)
        if (-not $Process.WaitForExit(30000)) { $Record.timedOut = $true; $Process.Kill() }
        $Process.WaitForExit()
        [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($CopyOut, $CopyErr))
        $Record.exitCode = $Process.ExitCode
    } catch { $Record.launchError = $_.ToString() }
    finally {
        $Out.Dispose(); $Err.Dispose(); $Process.Dispose()
        [IO.File]::WriteAllText(($Prefix + '.json'), (($Record | ConvertTo-Json -Depth 10) + "`n"), $Encoding)
        $Records.Add([pscustomobject] $Record)
    }
    Assert-True (-not $Record.timedOut -and $null -eq $Record.launchError) "Git launch/timeout failure: $Name"
    if (-not $AllowFailure) { Assert-True ($Record.exitCode -eq 0) "Git command failed: $Name (exit $($Record.exitCode)); see $Prefix.*" }
    return [pscustomobject] $Record
}
function Read-Output($Record) { return [IO.File]::ReadAllText($Record.stdout).Trim() }

try {
    $Seed = Join-Path $TemporaryRoot 'seed'
    $Bare = Join-Path $TemporaryRoot 'bare.git'
    $null = Invoke-Git 'version' @('--version')
    $null = Invoke-Git 'seed-init' @('init', '--initial-branch=seed', $Seed)
    [IO.File]::WriteAllText((Join-Path $Seed 'fixture.txt'), "local synthetic buggy fixture`n", $Encoding)
    $null = Invoke-Git 'seed-add-buggy' @('-C', $Seed, 'add', 'fixture.txt')
    $null = Invoke-Git 'seed-commit-buggy' @('-C', $Seed, '-c', 'user.name=Gate B local regression', '-c', 'user.email=gate-b-local@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=NUL', 'commit', '-m', 'synthetic buggy commit')
    $Buggy = Read-Output (Invoke-Git 'seed-buggy-sha' @('-C', $Seed, 'rev-parse', 'HEAD'))
    [IO.File]::WriteAllText((Join-Path $Seed 'fixture.txt'), "local synthetic fixed fixture`n", $Encoding)
    $null = Invoke-Git 'seed-add-fixed' @('-C', $Seed, 'add', 'fixture.txt')
    $null = Invoke-Git 'seed-commit-fixed' @('-C', $Seed, '-c', 'user.name=Gate B local regression', '-c', 'user.email=gate-b-local@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=NUL', 'commit', '-m', 'synthetic fixed commit')
    $Fixed = Read-Output (Invoke-Git 'seed-fixed-sha' @('-C', $Seed, 'rev-parse', 'HEAD'))
    $null = Invoke-Git 'bare-init' @('init', '--bare', $Bare)
    foreach ($Commit in @($Buggy, $Fixed)) {
        $null = Invoke-Git ('bare-fetch-' + $Commit.Substring(0, 8)) @('--git-dir', $Bare, 'fetch', '--no-tags', '--depth=2', $Seed, $Commit)
        $null = Invoke-Git ('bare-present-' + $Commit.Substring(0, 8)) @('--git-dir', $Bare, 'cat-file', '-e', "$Commit^{commit}")
        $null = Invoke-Git ('bare-tree-present-' + $Commit.Substring(0, 8)) @('--git-dir', $Bare, 'cat-file', '-e', "$Commit^{tree}")
    }
    $NoRefs = Invoke-Git 'bare-has-no-refs' @('--git-dir', $Bare, 'show-ref') -AllowFailure
    Assert-True ($NoRefs.exitCode -eq 1 -and (Read-Output $NoRefs) -ceq '') 'Expected bare repo to have objects but no persistent refs'
    $FetchHead = Read-Output (Invoke-Git 'fetch-head-is-fixed' @('--git-dir', $Bare, 'rev-parse', 'FETCH_HEAD'))
    Assert-True ($FetchHead -ceq $Fixed) 'FETCH_HEAD must name only the last fetched commit'
    $Broken = Join-Path $TemporaryRoot 'pre-fix-clone'
    $EmptyClone = Invoke-Git 'pre-fix-empty-clone' @('clone', '--no-hardlinks', '--no-checkout', $Bare, $Broken)
    Assert-True ([IO.File]::ReadAllText($EmptyClone.stderr) -match 'cloned an empty repository') 'Pre-fix clone did not report the expected empty repository'
    $PreFixCheckout = Invoke-Git 'pre-fix-checkout-fails' @('-C', $Broken, 'checkout', '--detach', $Buggy) -AllowFailure
    Assert-True ($PreFixCheckout.exitCode -ne 0) 'Pre-fix checkout unexpectedly succeeded; regression was not reproduced'
    foreach ($Definition in @(@('buggy', $Buggy), @('fixed', $Fixed))) {
        $Role = $Definition[0]; $Commit = $Definition[1]; $Ref = 'refs/heads/gateb-' + $Role
        $null = Invoke-Git "$Role-update-ref" @('--git-dir', $Bare, 'update-ref', $Ref, $Commit)
        $Shown = Read-Output (Invoke-Git "$Role-show-ref" @('--git-dir', $Bare, 'show-ref', '--verify', $Ref))
        Assert-True ($Shown -ceq ($Commit + ' ' + $Ref)) 'Named ref does not point to approved synthetic commit'
    }
    foreach ($Definition in @(@('buggy', $Buggy), @('fixed', $Fixed))) {
        $Role = $Definition[0]; $Commit = $Definition[1]
        $Clone = Join-Path $TemporaryRoot ("fixed-clone-" + $Role)
        $null = Invoke-Git "$Role-independent-clone" @('clone', '--no-hardlinks', '--no-checkout', $Bare, $Clone)
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $Clone '.git\objects\info\alternates'))) 'Clone unexpectedly shares alternate storage'
        $null = Invoke-Git "$Role-commit-exists" @('-C', $Clone, 'cat-file', '-e', "$Commit^{commit}")
        $null = Invoke-Git "$Role-tree-exists" @('-C', $Clone, 'cat-file', '-e', "$Commit^{tree}")
        $Tree = Read-Output (Invoke-Git "$Role-tree-before-checkout" @('-C', $Clone, 'rev-parse', "$Commit^{tree}"))
        $null = Invoke-Git "$Role-detached-checkout" @('-C', $Clone, '-c', 'core.hooksPath=NUL', 'checkout', '--detach', $Commit)
        $Head = Read-Output (Invoke-Git "$Role-exact-head" @('-C', $Clone, 'rev-parse', 'HEAD'))
        Assert-True ($Head -ceq $Commit) 'Detached checkout has wrong HEAD'
        $Detached = Invoke-Git "$Role-detached-status" @('-C', $Clone, 'symbolic-ref', '--quiet', 'HEAD') -AllowFailure
        Assert-True ($Detached.exitCode -eq 1) 'Clone HEAD is not detached'
        $RoleResults += [pscustomobject]@{ role = $Role; expectedCommit = $Commit; head = $Head; tree = $Tree; detachedStatusExit = $Detached.exitCode; alternateStorage = $false }
    }
    $Passed = $true
} catch { $Failure = $_.ToString() }
finally {
    $Result = [ordered]@{ test = 'bare SHA fetch requires persistent refs for independent local clones'
        passed = $Passed; powershellVersion = $PSVersionTable.PSVersion.ToString()
        temporaryRoot = $TemporaryRoot; temporaryReposRetained = $true
        syntheticBuggyCommit = $Buggy; syntheticFixedCommit = $Fixed
        preFixCheckout = $PreFixCheckout; roles = $RoleResults; failure = $Failure; commands = @($Records.ToArray()) }
    [IO.File]::WriteAllText((Join-Path $ResultDirectory 'result.json'), (($Result | ConvertTo-Json -Depth 15) + "`n"), $Encoding)
    Write-Host "Local Git regression passed=$Passed; result: $(Join-Path $ResultDirectory 'result.json')"
}
if (-not $Passed) { exit 1 }
exit 0
