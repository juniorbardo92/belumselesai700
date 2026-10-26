param(
    [string]$PackageFolder = (Join-Path $env:USERPROFILE 'Downloads\UMKM800_Manual'),
    [int]$Limit = 0
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$account = '4e9350b4532477f1fb91ee27c5b40b49'
$bucket = 'umkm-content-media'
$publicBase = 'https://media.umkmnaikkelas.id/umkm/threads-800/visuals'
$payloadPath = Join-Path $PackageFolder 'UMKM_Repliz_Manual_800_Utas_7200_Post.json'
$mapPath = Join-Path $PackageFolder 'UMKM_160_Media_URLs.json'

function Assert-PublicPNG([string]$url, [string]$expectedHash) {
    $temp = Join-Path ([IO.Path]::GetTempPath()) ('umkm800-' + [guid]::NewGuid().ToString('N') + '.png')
    try {
        try { $head = Invoke-WebRequest -UseBasicParsing -Method Head -Uri $url -TimeoutSec 35 }
        catch {
            if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) { return $false }
            throw "URL publik gagal dibaca: $url ($($_.Exception.Message))"
        }
        if ([string]$head.Headers['Content-Type'] -notmatch '^image/png') {
            throw "URL publik bukan PNG: $url"
        }
        Invoke-WebRequest -UseBasicParsing -Method Get -Uri $url -OutFile $temp -TimeoutSec 60 | Out-Null
        $actual = (Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $expectedHash) { throw "Objek berbeda, tidak ditimpa: $url" }
        return $true
    } finally {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
    }
}

function Save-Map($map, $ids) {
    $ordered = [ordered]@{}
    foreach ($id in $ids) { $ordered[$id] = [string]$map[$id] }
    $temp = "$mapPath.new"
    [IO.File]::WriteAllText($temp, ($ordered | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $mapPath) {
        $backup = "$mapPath.backup"
        [IO.File]::Replace([IO.Path]::GetFullPath($temp), [IO.Path]::GetFullPath($mapPath), [IO.Path]::GetFullPath($backup))
        Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    } else { [IO.File]::Move($temp, $mapPath) }
}

if ($Limit -lt 0) { throw '-Limit tidak boleh negatif.' }
if (-not (Test-Path -LiteralPath $payloadPath -PathType Leaf) -or -not (Test-Path -LiteralPath $mapPath -PathType Leaf)) {
    throw "Paket UMKM 800 tidak lengkap: $PackageFolder"
}
$payload = Get-Content -LiteralPath $payloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (@($payload.records).Count -ne 7200 -or [string]$payload.account.repliz_account_id -ne '6a8e2fc362caae1e04063419') {
    throw 'Payload bukan sumber final 800 utas UMKM.'
}
$visuals = @($payload.records | Where-Object { [int]$_.sequence -eq 1 -and $_.media_local_path } | Sort-Object thread_id)
if ($visuals.Count -ne 160 -or @($visuals | Group-Object thread_id).Count -ne 160) { throw 'Visual harus 160 utas unik.' }
$saved = Get-Content -LiteralPath $mapPath -Raw -Encoding UTF8 | ConvertFrom-Json
$map = @{}
foreach ($item in $saved.PSObject.Properties) { $map[$item.Name] = [string]$item.Value }
$ids = @($visuals | ForEach-Object { [string]$_.thread_id })
if ($map.Count -ne 160 -or @($ids | Where-Object { -not $map.ContainsKey($_) }).Count) { throw 'Peta URL bukan 160 ID visual yang benar.' }
foreach ($v in $visuals) {
    $name = [string]$v.media_local_path
    if ($name -cne ('visuals/' + [string]$v.thread_id + '.png')) { throw "Nama visual tidak cocok: $name" }
    if (-not (Test-Path -LiteralPath (Join-Path $PackageFolder $name) -PathType Leaf)) { throw "PNG hilang: $name" }
    if ($map[$v.thread_id] -and $map[$v.thread_id] -cne "$publicBase/$($v.thread_id).png") {
        throw "Peta berisi URL di luar lokasi yang diharapkan: $($v.thread_id)"
    }
}
Write-Host "UMKM: 160 PNG; URL terisi: $(@($ids | Where-Object { $map[$_] }).Count); kosong: $(@($ids | Where-Object { -not $map[$_] }).Count)."

$wrangler = Get-Command 'wrangler.cmd' -ErrorAction SilentlyContinue
$prefix = @()
if (-not $wrangler) {
    $wrangler = Get-Command 'npx.cmd' -ErrorAction SilentlyContinue
    if (-not $wrangler) { throw 'Wrangler atau npx tidak ditemukan. Pasang Node.js/Wrangler sebelum melanjutkan.' }
    $prefix = @('--yes', 'wrangler@latest')
}
$exe = $wrangler.Source
Write-Host "Wrangler: $exe"

function Invoke-Wrangler([string[]]$Arguments) {
    $originalPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 treats stderr from native commands as a PowerShell error.
        $ErrorActionPreference = 'Continue'
        $lines = & $exe @prefix @Arguments 2>&1
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $originalPreference }
    return [pscustomobject]@{ Code = $code; Output = (($lines | Out-String).Trim()) }
}

$lockPath = "$mapPath.lock"
try { $lock = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None') }
catch { throw 'Proses media UMKM lain sedang berjalan.' }
$environmentNames = @('CLOUDFLARE_API_TOKEN', 'CF_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CF_API_KEY', 'CLOUDFLARE_EMAIL', 'CF_EMAIL', 'CLOUDFLARE_AUTH_USE_KEYRING', 'CLOUDFLARE_ACCOUNT_ID')
$previous = @{}
try {
    foreach ($name in $environmentNames) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    [Environment]::SetEnvironmentVariable('CLOUDFLARE_ACCOUNT_ID', $account, 'Process')
    $whoami = Invoke-Wrangler -Arguments @('whoami', '--account', $account, '--json')
    if ($whoami.Code -ne 0) {
        Write-Host 'Login Cloudflare melalui browser sekali; Wrangler akan menggunakan keyring Windows.'
        $originalPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & $exe @prefix login --device --use-keyring
            $loginCode = $LASTEXITCODE
        } finally { $ErrorActionPreference = $originalPreference }
        if ($loginCode -ne 0) { throw 'Login Wrangler gagal; belum ada unggahan.' }
        $whoami = Invoke-Wrangler -Arguments @('whoami', '--account', $account, '--json')
        if ($whoami.Code -ne 0) { throw 'Akun Cloudflare tujuan tidak tersedia pada login Wrangler; belum ada unggahan.' }
    }
    $bucketInfo = Invoke-Wrangler -Arguments @('r2', 'bucket', 'info', $bucket, '--json')
    if ($bucketInfo.Code -ne 0) {
        throw "Akses ke bucket UMKM belum tersedia; belum ada unggahan. $($bucketInfo.Output)"
    }
    Write-Host "Akses ke bucket $bucket tersedia. Memeriksa 160 PNG."
    $processed = 0; $uploaded = 0; $existing = 0
    foreach ($v in $visuals) {
        $id = [string]$v.thread_id
        $file = Join-Path $PackageFolder ([string]$v.media_local_path)
        $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
        $url = "$publicBase/$id.png"
        $seen = Assert-PublicPNG -url $url -expectedHash $hash
        if ($map[$id]) {
            if (-not $seen) { throw "URL yang sudah dipetakan tidak tersedia: $id" }
            $existing++
            continue
        }
        if (-not $seen) {
            $target = "$bucket/umkm/threads-800/visuals/$id.png"
            $put = Invoke-Wrangler -Arguments @('r2', 'object', 'put', $target, '--file', $file, '--content-type', 'image/png', '--remote')
            if ($put.Code -ne 0) { throw "Wrangler gagal mengunggah ${id}: $($put.Output)" }
            $confirmed = $false
            for ($attempt = 0; $attempt -lt 5; $attempt++) {
                Start-Sleep -Seconds 2
                if (Assert-PublicPNG -url $url -expectedHash $hash) { $confirmed = $true; break }
            }
            if (-not $confirmed) { throw "Objek $id belum dapat diverifikasi lewat URL publik. Coba lanjutkan nanti; jangan timpa manual." }
            $uploaded++
        } else { $existing++ }
        $map[$id] = $url
        Save-Map $map $ids
        $processed++
        Write-Host "Terverifikasi: $id; $processed URL baru dipetakan."
        if ($Limit -gt 0 -and $processed -ge $Limit) { break }
    }
    Write-Host "Selesai. Baru diunggah: $uploaded; identik sudah ada: $existing; URL kosong: $(@($ids | Where-Object { -not $map[$_] }).Count)."
    Write-Host 'Tidak ada impor Repliz atau perubahan jadwal.'
} finally {
    foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    if ($null -ne $lock) { $lock.Dispose() }
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
}
