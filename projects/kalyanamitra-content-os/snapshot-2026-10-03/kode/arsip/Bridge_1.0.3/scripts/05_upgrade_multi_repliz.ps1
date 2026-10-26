$ErrorActionPreference = "Stop"

$sourceRoot = Split-Path $PSScriptRoot -Parent
$targetRoot = Join-Path $env:USERPROFILE ".openclaw\extensions\kalyanamitra-content-os"
$configPath = Join-Path $env:USERPROFILE ".openclaw\openclaw.json"
$ledgerPath = Join-Path $env:USERPROFILE ".openclaw\plugin-state\kalyanamitra-content-os\ledger.ndjson"

$sourcePackage = (
    Get-Content -LiteralPath (Join-Path $sourceRoot "package.json") -Raw
) | ConvertFrom-Json
if ($sourcePackage.version -ne "1.0.3") {
    throw "Script ini hanya untuk bridge versi 1.0.3."
}
if (-not (Test-Path -LiteralPath $targetRoot)) {
    throw "Bridge Kalyanamitra aktif tidak ditemukan."
}

$targetPackage = (
    Get-Content -LiteralPath (Join-Path $targetRoot "package.json") -Raw
) | ConvertFrom-Json
if ($targetPackage.version -ne "1.0.2") {
    throw "Upgrade aman hanya menerima target aktif versi 1.0.2. Versi ditemukan: $($targetPackage.version)"
}

$targetManifest = (
    Get-Content -LiteralPath (Join-Path $targetRoot "openclaw.plugin.json") -Raw
) | ConvertFrom-Json
if ($targetManifest.id -ne "kalyanamitra-content-os") {
    throw "Target bukan bridge Kalyanamitra."
}

$ledgerHashBefore = $null
if (Test-Path -LiteralPath $ledgerPath) {
    $ledgerHashBefore = (Get-FileHash -LiteralPath $ledgerPath -Algorithm SHA256).Hash
}

$backupRoot = Join-Path $env:USERPROFILE (
    ".openclaw\backups\kalyanamitra-content-os-before-multi-repliz-" +
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
Copy-Item -LiteralPath $configPath -Destination (Join-Path $backupRoot "openclaw.json")

try {
    foreach ($fileName in $runtimeFiles) {
        $sourcePath = Join-Path $sourceRoot $fileName
        if (-not (Test-Path -LiteralPath $sourcePath)) {
            throw "File paket hilang: $fileName"
        }
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
    if ($LASTEXITCODE -ne 0) {
        throw "Dependensi bridge gagal diverifikasi."
    }

    openclaw.cmd config validate
    if ($LASTEXITCODE -ne 0) {
        throw "Konfigurasi tidak valid setelah upgrade runtime."
    }

    openclaw.cmd gateway restart
    if ($LASTEXITCODE -ne 0) {
        throw "Gateway gagal direstart setelah upgrade runtime."
    }
    Start-Sleep -Seconds 5

    $inspection = (
        openclaw.cmd plugins inspect kalyanamitra-content-os --runtime --json |
        Out-String
    ) | ConvertFrom-Json
    $registeredTools = @(
        $inspection.tools | Select-Object -ExpandProperty names
    )

    $agents = (openclaw.cmd config get agents --json | Out-String) | ConvertFrom-Json
    $agent = $agents.list | Where-Object id -eq "kalyanamitra" | Select-Object -First 1
    if ($null -eq $agent) { throw "Agent kalyanamitra tidak ditemukan setelah upgrade." }
    $allow = @($agent.tools.allow)

    $installedPackage = (
        Get-Content -LiteralPath (Join-Path $targetRoot "package.json") -Raw
    ) | ConvertFrom-Json

    $ledgerHashAfter = $null
    if (Test-Path -LiteralPath $ledgerPath) {
        $ledgerHashAfter = (Get-FileHash -LiteralPath $ledgerPath -Algorithm SHA256).Hash
    }

    $checks = [ordered]@{
        bridgeVersion103       = ($installedPackage.version -eq "1.0.3")
        diagnosticsEmpty       = (@($inspection.diagnostics).Count -eq 0)
        createRegistered       = ($registeredTools -contains "kalyanamitra_content_draft_create")
        getRegistered          = ($registeredTools -contains "kalyanamitra_content_draft_get")
        accountToolRegistered  = ($registeredTools -contains "kalyanamitra_content_repliz_account")
        workflowRegistered     = ($registeredTools -contains "kalyanamitra_content_workflow")
        phase03StillBlocked    = (
            $allow -notcontains "kalyanamitra_content_repliz_account" -and
            $allow -notcontains "kalyanamitra_content_workflow"
        )
        ledgerPresent          = (-not [string]::IsNullOrWhiteSpace($ledgerHashBefore))
        ledgerUnchanged        = ($ledgerHashBefore -eq $ledgerHashAfter)
    }
    $checks["ALL_PASSED"] = -not ($checks.Values -contains $false)
    [pscustomobject]$checks | Format-List

    if ($checks["ALL_PASSED"] -ne $true) {
        throw "Verifikasi upgrade v1.0.3 tidak lulus."
    }

    openclaw.cmd channels status --channel telegram --probe --json

    Write-Host "`nUPGRADE MULTI-REPLIZ v1.0.3 SELESAI." -ForegroundColor Green
    Write-Host "Tahap 03 masih diblokir; workflow belum dibuka." -ForegroundColor Cyan
    Write-Host "Backup bridge sebelumnya: $backupRoot" -ForegroundColor DarkGray
}
catch {
    foreach ($fileName in $runtimeFiles) {
        $backupFile = Join-Path $backupRoot $fileName
        if (Test-Path -LiteralPath $backupFile) {
            Copy-Item -LiteralPath $backupFile -Destination (Join-Path $targetRoot $fileName) -Force
        }
    }
    Copy-Item -LiteralPath (Join-Path $backupRoot "openclaw.json") -Destination $configPath -Force
    openclaw.cmd gateway restart | Out-Null
    throw "Upgrade v1.0.3 dibatalkan dan bridge dipulihkan. Backup: $backupRoot. Error: $($_.Exception.Message)"
}
