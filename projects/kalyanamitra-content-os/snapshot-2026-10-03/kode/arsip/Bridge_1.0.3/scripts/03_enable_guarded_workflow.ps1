param(
    [Parameter(Mandatory = $true)]
    [string]$AllowedInstagramAccountId,
    [Parameter(Mandatory = $true)]
    [string]$AllowedThreadsAccountId,
    [Parameter(Mandatory = $true)]
    [string]$AllowedReplizUsername
)

$ErrorActionPreference = "Stop"

$instagramId = $AllowedInstagramAccountId.Trim()
$threadsId = $AllowedThreadsAccountId.Trim()
$username = $AllowedReplizUsername.Trim().TrimStart("@")

if ($instagramId -notmatch '^[A-Za-z0-9_-]{6,128}$') {
    throw "AllowedInstagramAccountId tidak valid."
}
if ($threadsId -notmatch '^[A-Za-z0-9_-]{6,128}$') {
    throw "AllowedThreadsAccountId tidak valid."
}
if ($instagramId -eq $threadsId) {
    throw "Account ID Instagram dan Threads tidak boleh sama."
}
if ($username -notmatch '^[A-Za-z0-9._-]{1,100}$') {
    throw "Username Repliz tidak valid."
}

$configPath = Join-Path $env:USERPROFILE ".openclaw\openclaw.json"
$backupDir = Join-Path $env:USERPROFILE ".openclaw\backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backupPath = Join-Path $backupDir (
    "openclaw-before-kalyanamitra-workflow-v103-" +
    (Get-Date -Format "yyyyMMdd-HHmmss") +
    ".json"
)
Copy-Item -LiteralPath $configPath -Destination $backupPath

try {
    $agents = (openclaw.cmd config get agents --json | Out-String) | ConvertFrom-Json
    $kIndex = -1
    for ($i = 0; $i -lt $agents.list.Count; $i++) {
        if ($agents.list[$i].id -eq "kalyanamitra") {
            $kIndex = $i
            break
        }
    }
    if ($kIndex -lt 0) { throw "Agent kalyanamitra tidak ditemukan." }

    $packagePath = Join-Path $env:USERPROFILE ".openclaw\extensions\kalyanamitra-content-os\package.json"
    $package = (Get-Content -LiteralPath $packagePath -Raw) | ConvertFrom-Json
    if ($package.version -ne "1.0.3") {
        throw "Tahap 03 memerlukan bridge Kalyanamitra versi 1.0.3."
    }

    openclaw.cmd config set `
        "plugins.entries.kalyanamitra-content-os.config.allowedReplizInstagramAccountId" `
        $instagramId
    if ($LASTEXITCODE -ne 0) { throw "Gagal mengunci account ID Instagram." }

    openclaw.cmd config set `
        "plugins.entries.kalyanamitra-content-os.config.allowedReplizThreadsAccountId" `
        $threadsId
    if ($LASTEXITCODE -ne 0) { throw "Gagal mengunci account ID Threads." }

    openclaw.cmd config set `
        "plugins.entries.kalyanamitra-content-os.config.allowedReplizUsername" `
        $username
    if ($LASTEXITCODE -ne 0) { throw "Gagal mengunci username Repliz." }

    $workflowTools = @(
        "kalyanamitra_content_repliz_account",
        "kalyanamitra_content_workflow"
    )
    $current = @($agents.list[$kIndex].tools.allow)
    $nextIndex = $current.Count
    foreach ($toolName in $workflowTools) {
        if ($current -notcontains $toolName) {
            openclaw.cmd config set "agents.list.$kIndex.tools.allow.$nextIndex" $toolName
            if ($LASTEXITCODE -ne 0) { throw "Gagal membuka tool $toolName." }
            $nextIndex++
        }
    }

    openclaw.cmd config validate
    if ($LASTEXITCODE -ne 0) { throw "Konfigurasi tahap 03 tidak valid." }

    openclaw.cmd gateway restart
    if ($LASTEXITCODE -ne 0) { throw "Gateway gagal direstart setelah tahap 03." }
    Start-Sleep -Seconds 5

    $inspection = (
        openclaw.cmd plugins inspect kalyanamitra-content-os --runtime --json |
        Out-String
    ) | ConvertFrom-Json

    $registeredTools = @(
        $inspection.tools | Select-Object -ExpandProperty names
    )

    $agentsAfter = (openclaw.cmd config get agents --json | Out-String) | ConvertFrom-Json
    $allowAfter = @($agentsAfter.list[$kIndex].tools.allow)

    $checks = [ordered]@{
        bridgeVersion103        = ($package.version -eq "1.0.3")
        diagnosticsEmpty        = (@($inspection.diagnostics).Count -eq 0)
        replizAccountRegistered = ($registeredTools -contains "kalyanamitra_content_repliz_account")
        workflowRegistered      = ($registeredTools -contains "kalyanamitra_content_workflow")
        replizAccountAllowed    = ($allowAfter -contains "kalyanamitra_content_repliz_account")
        workflowAllowed         = ($allowAfter -contains "kalyanamitra_content_workflow")
        instagramLocked         = ($instagramId -eq "6a8d2c6762caae1e04053962")
        threadsLocked           = ($threadsId -eq "6a8d2c7862caae1e0405397a")
        usernameLocked          = ($username -eq "ruangkalyanamitra")
    }
    $checks["ALL_PASSED"] = -not ($checks.Values -contains $false)
    [pscustomobject]$checks | Format-List

    if ($checks["ALL_PASSED"] -ne $true) {
        throw "Verifikasi tahap 03 tidak lulus."
    }

    openclaw.cmd channels status --channel telegram --probe --json

    Write-Host "`nWORKFLOW TERJAGA AKTIF UNTUK INSTAGRAM + THREADS." -ForegroundColor Green
    Write-Host "Mode tetap draft-only; tidak ada tool publish, reply, engagement, atau auto-retry." -ForegroundColor Cyan
    Write-Host "Backup konfigurasi: $backupPath" -ForegroundColor DarkGray
}
catch {
    Copy-Item -LiteralPath $backupPath -Destination $configPath -Force
    openclaw.cmd gateway restart | Out-Null
    throw "Tahap 03 dibatalkan dan konfigurasi dipulihkan. Backup: $backupPath. Error: $($_.Exception.Message)"
}
