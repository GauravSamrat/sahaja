[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$node = Get-Command node -ErrorAction SilentlyContinue
$version = if ($node) { & $node.Source --version }
if ($version -notmatch '^v(\d+)\.\d+\.\d+' -or [int]$Matches[1] -lt 22) {
    throw 'Node.js 22 or newer is required for the Windows launcher and tests. Install it for your user, then run setup again.'
}
if (-not $CheckOnly) {
    & (Join-Path $PSScriptRoot 'run.ps1')
}
