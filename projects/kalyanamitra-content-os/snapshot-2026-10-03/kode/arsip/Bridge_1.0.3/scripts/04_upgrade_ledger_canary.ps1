$ErrorActionPreference = "Stop"

$sourceRoot = Split-Path $PSScriptRoot -Parent
$targetRoot = Join-Path $env:USERPROFILE ".openclaw\extensions\kalyanamitra-content-os"

$sourcePackage = (Get-Content -LiteralPath (Join-Path $sourceRoot "package.json") -Raw) | ConvertFrom-Json
if ($sourcePackage.version -ne "1.0.2") { throw "Script ini hanya untuk bridge versi 1.0.2." }
if (-not (Test-Path -LiteralPath $targetRoot)) { throw "Bridge Kalyanamitra aktif tidak ditemukan." }

$targetManifest = (Get-Content -LiteralPath (Join-Path $targetRoot "openclaw.plugin.json") -Raw) | ConvertFrom-Json
if ($targetManifest.id -ne "kalyanamitra-content-os") { throw "Target bukan bridge Kalyanamitra." }

$backupRoot = Join-Path $env:USERPROFILE (
    ".openclaw\backups\kalyanamitra-content-os-before-ledger-" +
    (Get-Date -Format "yyyyMMdd-HHmmss")
)
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$runtimeFiles = @(
    "package.json",
    "openclaw.plugin.json",
    "index.js",
    "guardrails.js",
    "ledger.js",
    "README.md"
)

foreach ($fileName in $runtimeFiles) {
    $existingPath = Join-Path $targetRoot $fileName
    if (Test-Path -LiteralPath $existingPath) {
        Copy-Item -LiteralPath $existingPath -Destination (Join-Path $backupRoot $fileName)
    }
}

Copy-Item `
    -LiteralPath (Join-Path $env:USERPROFILE ".openclaw\openclaw.json") `
    -Destination (Join-Path $backupRoot "openclaw.json")

foreach ($fileName in $runtimeFiles) {
    $sourcePath = Join-Path $sourceRoot $fileName
    if (-not (Test-Path -LiteralPath $sourcePath)) { throw "File paket hilang: $fileName" }
    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $targetRoot $fileName) -Force
}

npm.cmd `
    --prefix $targetRoot `
    install `
    --no-save `
    --package-lock=false `
    --ignore-scripts `
    --no-audit `
    --no-fund `
    --legacy-peer-deps `
    typebox@1.1.38
if ($LASTEXITCODE -ne 0) { throw "Dependensi bridge gagal diverifikasi. Backup: $backupRoot" }

openclaw.cmd config validate
if ($LASTEXITCODE -ne 0) { throw "Konfigurasi tidak valid. Backup: $backupRoot" }

openclaw.cmd gateway restart
Start-Sleep -Seconds 5

$inspection = (
    openclaw.cmd plugins inspect kalyanamitra-content-os --runtime --json |
    Out-String
) | ConvertFrom-Json

$registeredTools = @(
    $inspection.tools |
        Select-Object -ExpandProperty names
)

[pscustomobject]@{
    version          = $sourcePackage.version
    diagnosticsEmpty = @($inspection.diagnostics).Count -eq 0
    createRegistered = $registeredTools -contains "kalyanamitra_content_draft_create"
    getRegistered    = $registeredTools -contains "kalyanamitra_content_draft_get"
    ledgerModule     = Test-Path -LiteralPath (Join-Path $targetRoot "ledger.js")
} | Format-List

openclaw.cmd channels status --channel telegram --probe --json

Write-Host "`nUPGRADE LEDGER CANARY SELESAI." -ForegroundColor Green
Write-Host "Backup bridge sebelumnya: $backupRoot" -ForegroundColor DarkGray
Write-Host "Jangan jalankan workflow tahap 03 sebelum canary v1.0.2 lulus." -ForegroundColor Yellow
