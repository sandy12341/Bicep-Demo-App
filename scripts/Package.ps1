param([string]$Destination = 'artifacts')
. (Join-Path $PSScriptRoot 'Common.ps1')
$destinationPath = Join-Path $script:ProjectRoot $Destination
$stage = Join-Path $destinationPath 'package'
if (Test-Path -LiteralPath $stage) { throw 'Package staging already exists. Remove the explicitly named artifacts/package directory before packaging again.' }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $script:ProjectRoot 'dist') -Destination $stage -Recurse
Copy-Item -LiteralPath (Join-Path $script:ProjectRoot 'package.json'), (Join-Path $script:ProjectRoot 'package-lock.json') -Destination $stage
Push-Location $stage
try {
    & npm ci --omit=dev --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Production dependency installation failed.' }
} finally { Pop-Location }
$zip = Join-Path $destinationPath 'app.zip'
if (Test-Path -LiteralPath $zip) { throw 'Package app.zip already exists. Preserve it or remove that exact file before repackaging.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zip)
Write-Host "Package created: $zip"
