$ErrorActionPreference = "Stop"

$pluginRoot = Split-Path $PSScriptRoot -Parent
$manifestPath = Join-Path $pluginRoot "openclaw.plugin.json"
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Jalankan script dari paket plugin lengkap." }

$targetPath = Join-Path $env:USERPROFILE ".openclaw\extensions\kalyanamitra-content-os"
if (Test-Path -LiteralPath $targetPath) {
    throw "Bridge sudah terpasang. Script berhenti agar tidak menimpa instalasi yang ada."
}

openclaw.cmd config validate
$baseUrlRaw = openclaw.cmd config get "plugins.entries.umkm-content-registry.config.baseUrl" --json | Out-String
$baseUrl = ($baseUrlRaw | ConvertFrom-Json).TrimEnd("/")
if ($baseUrl -notmatch '^https://') { throw "baseUrl registry aktif tidak valid." }

$agents = (openclaw.cmd config get agents --json | Out-String) | ConvertFrom-Json
$kIndex = -1
for ($i = 0; $i -lt $agents.list.Count; $i++) {
    if ($agents.list[$i].id -eq "kalyanamitra") { $kIndex = $i; break }
}
if ($kIndex -lt 0) { throw "Agent kalyanamitra tidak ditemukan." }

$backupDir = Join-Path $env:USERPROFILE ".openclaw\backups"
New-Item -ItemType Directory -Force $backupDir | Out-Null
$backupPath = Join-Path $backupDir ("openclaw-before-kalyanamitra-bridge-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")
Copy-Item -LiteralPath (Join-Path $env:USERPROFILE ".openclaw\openclaw.json") -Destination $backupPath

openclaw.cmd plugins install $pluginRoot
if (-not (Test-Path -LiteralPath $targetPath)) { throw "Instalasi bridge gagal sebelum folder target dibuat." }

npm.cmd `
    --prefix $targetPath `
    install `
    --no-save `
    --package-lock=false `
    --ignore-scripts `
    --no-audit `
    --no-fund `
    --legacy-peer-deps `
    typebox@1.1.38
if ($LASTEXITCODE -ne 0) { throw "Dependensi typebox bridge gagal dipasang." }

openclaw.cmd config set "plugins.entries.kalyanamitra-content-os.config.baseUrl" $baseUrl
openclaw.cmd config set "plugins.entries.kalyanamitra-content-os.config.tokenEnvName" UMKM_CONTENT_OS_TOKEN
openclaw.cmd plugins enable kalyanamitra-content-os

$canaryTools = @(
    "kalyanamitra_content_draft_create",
    "kalyanamitra_content_draft_get"
)
$current = @($agents.list[$kIndex].tools.allow)
$nextIndex = $current.Count
foreach ($toolName in $canaryTools) {
    if ($current -notcontains $toolName) {
        openclaw.cmd config set "agents.list.$kIndex.tools.allow.$nextIndex" $toolName
        $nextIndex++
    }
}

openclaw.cmd config validate
if ($LASTEXITCODE -ne 0) {
    openclaw.cmd plugins disable kalyanamitra-content-os
    throw "Konfigurasi tidak valid. Bridge dinonaktifkan; backup: $backupPath"
}

openclaw.cmd gateway restart
Start-Sleep -Seconds 5
openclaw.cmd plugins inspect kalyanamitra-content-os --runtime --json
openclaw.cmd channels status --channel telegram --probe --json

Write-Host "`nCANARY TERPASANG. Hanya create/get Kalyanamitra yang dibuka." -ForegroundColor Green
Write-Host "Backup konfigurasi: $backupPath" -ForegroundColor DarkGray
Write-Host "Jangan jalankan 03_enable_guarded_workflow.ps1 sebelum canary dinyatakan lulus." -ForegroundColor Yellow
