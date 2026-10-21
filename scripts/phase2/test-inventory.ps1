#requires -Version 5.1
<#
Local regression against the preserved 356-file qs Gate B manifests. Extracts
the production Same-Inventory function; it never starts the Gate B runbook.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$Run = Join-Path $RepoRoot 'work\phase2\gate-b-runs\qs33-gateb-local-04'
$Paths = [ordered]@{
    prepared = Join-Path $Run 'provenance\buggy-payload.json'
    before = Join-Path $Run 'evidence-buggy\inputs-before.json'
    after = Join-Path $Run 'evidence-buggy\inputs-after.json'
}
$ExpectedHashes = @{
    prepared = 'ef25318c1afff4ea7061ddac9511dff227bf450bf6cf01bfacd96e7db0214b6d'
    before = 'e6fe407f0189e5efb0460c1945ab11a64baa7c3c9e7cb74f8770f62d0d7f84e3'
    after = 'e6fe407f0189e5efb0460c1945ab11a64baa7c3c9e7cb74f8770f62d0d7f84e3'
}
foreach ($Key in $Paths.Keys) {
    if (-not (Test-Path -LiteralPath $Paths[$Key] -PathType Leaf)) { throw "Saved local-04 $Key manifest is missing" }
    $Hash = (Get-FileHash -LiteralPath $Paths[$Key] -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($Hash -cne $ExpectedHashes[$Key]) { throw "Saved local-04 $Key manifest hash changed" }
}

function Require([bool] $Condition, [string] $Message) { if (-not $Condition) { throw $Message } }
$Tokens = $null; $Errors = $null
$Ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'run-gate-b.ps1'), [ref]$Tokens, [ref]$Errors)
if ($Errors.Count -ne 0) { throw 'Runbook parse error' }
$Definitions = @($Ast.FindAll({ param($Node) $Node -is [Management.Automation.Language.FunctionDefinitionAst] -and $Node.Name -eq 'Same-Inventory' }, $true))
if ($Definitions.Count -ne 1) { throw 'Expected one production Same-Inventory function' }
. ([ScriptBlock]::Create($Definitions[0].Extent.Text))

$Prepared = @(Get-Content -LiteralPath $Paths.prepared -Raw | ConvertFrom-Json)
$Before = @(Get-Content -LiteralPath $Paths.before -Raw | ConvertFrom-Json)
$After = @(Get-Content -LiteralPath $Paths.after -Raw | ConvertFrom-Json)
# Recreate the live call: prepared Inventory output is flat, while Windows
# PowerShell 5.1 wraps the observed ConvertFrom-Json array inside @(...).
if ($Prepared.Count -eq 1 -and $Prepared[0] -is [array]) { $Prepared = $Prepared[0] }
if ($Prepared.Count -ne 356) { throw 'Prepared manifest is not 356 flat entries' }
Same-Inventory $Prepared $Before 'saved local-04 before'
Same-Inventory $Prepared $After 'saved local-04 after'

$BeforeFlat = $Before
if ($BeforeFlat.Count -eq 1 -and $BeforeFlat[0] -is [array]) { $BeforeFlat = $BeforeFlat[0] }
if ($BeforeFlat.Count -ne 356) { throw 'Observed manifest is not 356 entries' }
function Copy-Entries($Items) {
    foreach ($Entry in $Items) { [pscustomobject]@{ path = $Entry.path; bytes = $Entry.bytes; sha256 = $Entry.sha256 } }
}
function Expect-Rejection($Left, $Right, [string] $Name) {
    try { Same-Inventory $Left $Right $Name }
    catch {
        if ($_.Exception.Message -notmatch '^Inventory (mismatch|invalid|duplicate)') { throw }
        return
    }
    throw "Expected inventory rejection: $Name"
}

$ChangedHash = @(Copy-Entries $BeforeFlat); $ChangedHash[0].sha256 = '0' * 64
Expect-Rejection $Prepared $ChangedHash 'changed hash'
$ChangedSize = @(Copy-Entries $BeforeFlat); $ChangedSize[0].bytes = [int64]$ChangedSize[0].bytes + 1
Expect-Rejection $Prepared $ChangedSize 'changed size'
$Missing = @(Copy-Entries $BeforeFlat | Select-Object -Skip 1)
Expect-Rejection $Prepared $Missing 'missing file'
$Extra = @(Copy-Entries $BeforeFlat) + @([pscustomobject]@{ path = '__extra__'; bytes = [int64]1; sha256 = '0' * 64 })
Expect-Rejection $Prepared $Extra 'extra file'
$ChangedCase = @(Copy-Entries $BeforeFlat); $ChangedCase[0].path = '.GITIGNORE'
Expect-Rejection $Prepared $ChangedCase 'case-changed path'
$DuplicateLeft = @(Copy-Entries $Prepared) + @($Prepared[0])
$DuplicateRight = @(Copy-Entries $BeforeFlat) + @($BeforeFlat[0])
Expect-Rejection $DuplicateLeft $DuplicateRight 'duplicate path on both sides'

Write-Output 'Gate B inventory regression: PASS (saved 356-file before/after; hash, size, missing, extra, case, duplicate rejections)'
