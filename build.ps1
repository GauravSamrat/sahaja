[CmdletBinding()]
param([string]$Output = (Join-Path (Split-Path $PSScriptRoot -Parent) 'SAHAJA-v1.0.0-Final.zip'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$files = @(
    'index.html', 'style.css', 'app.js', 'model.js', 'repository.js', 'server.js',
    'manifest.json', 'sw.js', 'icon-192.png', 'icon-512.png',
    'test.js', 'browser-test.js', 'sample-ai-plan.json', 'AI_FORMAT.md',
    'README.md', 'INSTALL.md', 'ARCHITECTURE.md', 'USER_GUIDE.md', 'TEST_REPORT.md',
    'CHANGELOG.md', 'LICENSE', 'setup.ps1', 'run.ps1', 'test.ps1', 'build.ps1'
)
foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $file) -PathType Leaf)) {
        throw "Release file is missing: $file"
    }
}
$destination = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Output)
$staged = $destination + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
$prior = $staged + '.previous'
$verification = Join-Path ([IO.Path]::GetTempPath()) ('sahaja-verify-' + [Guid]::NewGuid().ToString('N'))
try {
    $zip = [IO.Compression.ZipFile]::Open($staged, 'Create')
    try {
        foreach ($file in $files) {
            [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip, (Join-Path $PSScriptRoot $file), $file, 'Optimal')
        }
    } finally { $zip.Dispose() }
    [IO.Compression.ZipFile]::ExtractToDirectory($staged, $verification)
    foreach ($file in $files) {
        $original = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file)).Hash
        $extracted = (Get-FileHash -LiteralPath (Join-Path $verification $file)).Hash
        if ($original -ne $extracted) { throw "Archive verification failed: $file" }
    }
    if ([IO.File]::Exists($destination)) {
        [IO.File]::Replace($staged, $destination, $prior)
    } else {
        [IO.File]::Move($staged, $destination)
    }
    Write-Output "Verified $($files.Count) files by extraction and SHA-256."
    Get-FileHash -LiteralPath $destination
} finally {
    if ([IO.File]::Exists($staged)) { [IO.File]::Delete($staged) }
    if ([IO.File]::Exists($prior)) { [IO.File]::Delete($prior) }
    foreach ($file in $files) {
        $extracted = Join-Path $verification $file
        if ([IO.File]::Exists($extracted)) { [IO.File]::Delete($extracted) }
    }
    if ([IO.Directory]::Exists($verification)) { [IO.Directory]::Delete($verification) }
}
