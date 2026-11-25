[CmdletBinding()]
param([switch]$Browser)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'setup.ps1') -CheckOnly
& node --test (Join-Path $PSScriptRoot 'test.js')
if ($LASTEXITCODE -ne 0) { throw 'Unit tests failed.' }
if ($Browser) {
    & node (Join-Path $PSScriptRoot 'browser-test.js')
    if ($LASTEXITCODE -ne 0) { throw 'Browser tests failed.' }
}
