#requires -Version 5.1
<#
Exercise the actual Gate B bind assertion without starting the runbook or Docker.
The source line is extracted so this test fails if the production assertion
regresses to counting @($null) as one bind.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Runbook = Join-Path $PSScriptRoot 'run-gate-b.ps1'
$SourceLines = @(Get-Content -LiteralPath $Runbook)
$Lines = @($SourceLines | Where-Object { $_ -match "^\s*Require .+'Unexpected container bind mount'\s*$" })
if ($Lines.Count -ne 1) { throw 'Expected one production bind assertion' }
$Check = [ScriptBlock]::Create($Lines[0])

function Require([bool] $Condition, [string] $Message) {
    if (-not $Condition) { throw $Message }
}

if (@($null).Count -ne 1) { throw 'The PowerShell null-array regression condition was not reproduced' }
$Cases = @(
    [pscustomobject]@{ name = 'null'; binds = $null; expected = $true },
    [pscustomobject]@{ name = 'empty array'; binds = @(); expected = $true },
    [pscustomobject]@{ name = 'empty string'; binds = ''; expected = $true },
    [pscustomobject]@{ name = 'null and empty entries'; binds = @($null, ''); expected = $true },
    [pscustomobject]@{ name = 'unauthorized bind'; binds = @('C:\host:/case'); expected = $false },
    [pscustomobject]@{ name = 'mixed unauthorized bind'; binds = @('', 'C:\host:/tmp'); expected = $false },
    [pscustomobject]@{ name = 'whitespace bind'; binds = ' '; expected = $false }
)
foreach ($Case in $Cases) {
    $Before = [pscustomobject]@{ HostConfig = [pscustomobject]@{ Binds = $Case.binds } }
    $Accepted = $false
    try { & $Check; $Accepted = $true }
    catch {
        if ($_.Exception.Message -cne 'Unexpected container bind mount') { throw }
    }
    if ($Accepted -ne $Case.expected) { throw "Bind assertion gave wrong result for $($Case.name)" }
}

# Exercise the additional configured-mount and tmpfs guards from their actual
# source lines. A named volume must be the only configured mount; /tmp must be
# the only configured tmpfs. These checks must fail before any Docker copy/start.
function Source-Line([string] $Pattern) {
    $Found = @($SourceLines | Where-Object { $_ -match $Pattern })
    if ($Found.Count -ne 1) { throw "Expected one source assertion for $Pattern" }
    return $Found[0]
}
$IsolationLines = @(
    (Source-Line '^\s*\$ConfiguredMounts = '),
    (Source-Line "^\s*Require .+'Configured private staging mount mismatch'\s*$"),
    (Source-Line '^\s*\$ConfiguredTmpfs = '),
    (Source-Line "^\s*Require .+'Private bounded tmpfs missing'\s*$")
)
$IsolationCheck = [ScriptBlock]::Create(($IsolationLines -join [Environment]::NewLine))
$VolumeName = 'gate-b-test-case'
$ApprovedMount = [pscustomobject]@{ Type = 'volume'; Source = $VolumeName; Target = '/case'; VolumeOptions = [pscustomobject]@{ NoCopy = $true } }
$Before = [pscustomobject]@{ HostConfig = [pscustomobject]@{ Mounts = @($ApprovedMount); Tmpfs = [pscustomobject]@{ '/tmp' = 'rw,noexec,size=32m' } } }
& $IsolationCheck
$Before.HostConfig.Mounts = @($ApprovedMount, [pscustomobject]@{ Type = 'bind'; Source = 'C:\host'; Target = '/extra' })
try { & $IsolationCheck; throw 'Extra configured mount was accepted' }
catch { if ($_.Exception.Message -cne 'Configured private staging mount mismatch') { throw } }
$Before.HostConfig.Mounts = @($ApprovedMount)
$ApprovedMount.VolumeOptions.NoCopy = $false
try { & $IsolationCheck; throw 'NoCopy=false was accepted' }
catch { if ($_.Exception.Message -cne 'Configured private staging mount mismatch') { throw } }
$ApprovedMount.VolumeOptions.NoCopy = $true
$Before.HostConfig.Tmpfs = [pscustomobject]@{ '/tmp' = 'rw,noexec,size=32m'; '/extra' = 'rw,size=1m' }
try { & $IsolationCheck; throw 'Extra tmpfs was accepted' }
catch { if ($_.Exception.Message -cne 'Private bounded tmpfs missing') { throw } }

$VolumeCheck = [ScriptBlock]::Create((Source-Line "^\s*Require .+'Volume ownership mismatch'\s*$"))
$RunToken = 'gate-b-test-token'
$Volume = [pscustomobject]@{ name = $VolumeName; role = 'buggy' }
$Data = [pscustomobject]@{ Name = $VolumeName; Labels = [pscustomobject]@{ 'replaykit.gate-b.token' = $RunToken; 'replaykit.gate-b.role' = 'buggy' } }
& $VolumeCheck
$Data.Labels.'replaykit.gate-b.role' = 'fixed'
try { & $VolumeCheck; throw 'Wrong volume role label was accepted' }
catch { if ($_.Exception.Message -cne 'Volume ownership mismatch') { throw } }

Write-Output 'Gate B Docker isolation regression: PASS (binds, exact volume, NoCopy, sole tmpfs, ownership labels)'
