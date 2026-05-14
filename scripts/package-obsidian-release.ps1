$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "dist\obsidian-release"

npm run build

if (Test-Path $out) {
  Remove-Item -LiteralPath $out -Recurse -Force
}

New-Item -ItemType Directory -Path $out | Out-Null
Copy-Item -LiteralPath (Join-Path $root "obsidian-plugin\main.js") -Destination $out
Copy-Item -LiteralPath (Join-Path $root "obsidian-plugin\manifest.json") -Destination $out
Copy-Item -LiteralPath (Join-Path $root "obsidian-plugin\styles.css") -Destination $out

Write-Host "Obsidian release assets written to $out"
