[CmdletBinding()]
param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'setup.ps1') -CheckOnly
$launchArgs = @()
if (-not $NoBrowser) { $launchArgs += '--open' }
& node (Join-Path $PSScriptRoot 'server.js') @launchArgs
if ($LASTEXITCODE -ne 0) { throw "SAHAJA server exited with code $LASTEXITCODE." }
