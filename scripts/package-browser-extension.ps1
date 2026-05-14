$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repo "chrome-extension"
$dist = Join-Path $repo "dist"
$zip = Join-Path $dist "select-to-note-browser-extension.zip"

New-Item -ItemType Directory -Force -Path $dist | Out-Null
if (Test-Path $zip) {
  Remove-Item -Force $zip
}

Compress-Archive -Path (Join-Path $source "*") -DestinationPath $zip
Write-Output "Created $zip"
