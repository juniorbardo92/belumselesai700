$ErrorActionPreference = "Stop"

Write-Host "`n=== VALIDASI KONFIGURASI ===" -ForegroundColor Cyan
openclaw.cmd config validate

Write-Host "`n=== PLUGIN SUMBER ===" -ForegroundColor Cyan
openclaw.cmd plugins inspect umkm-content-registry --runtime --json

Write-Host "`n=== AGENT DAN BINDING ===" -ForegroundColor Cyan
openclaw.cmd agents list --bindings --json

$agents = (openclaw.cmd config get agents --json | Out-String) | ConvertFrom-Json
$kalyanamitra = $agents.list | Where-Object { $_.id -eq "kalyanamitra" } | Select-Object -First 1
if ($null -eq $kalyanamitra) { throw "Agent kalyanamitra tidak ditemukan." }

$baseUrlRaw = openclaw.cmd config get "plugins.entries.umkm-content-registry.config.baseUrl" --json | Out-String
$baseUrl = ($baseUrlRaw | ConvertFrom-Json).TrimEnd("/")
if ($baseUrl -notmatch '^https://') { throw "baseUrl registry aktif tidak valid." }

$envFile = Join-Path $env:USERPROFILE ".openclaw\.env"
$tokenConfigured = $false
if (Test-Path -LiteralPath $envFile) {
    $tokenConfigured = $null -ne (Select-String -LiteralPath $envFile -Pattern '^\s*UMKM_CONTENT_OS_TOKEN\s*=' | Select-Object -First 1)
}

[pscustomobject]@{
    agentId = $kalyanamitra.id
    workspace = $kalyanamitra.workspace
    currentTools = $kalyanamitra.tools.allow
    registryBaseUrlHttps = $true
    tokenEnvironmentConfigured = $tokenConfigured
    bridgeAlreadyInstalled = Test-Path "$env:USERPROFILE\.openclaw\extensions\kalyanamitra-content-os"
} | ConvertTo-Json -Depth 20

Write-Host "`nPREFLIGHT READ-ONLY SELESAI. Tidak ada konfigurasi yang diubah." -ForegroundColor Green
