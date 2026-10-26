param(
    [ValidateSet('Validate','CheckAuth','Upload')][string]$Mode = 'Validate',
    [string]$PackageFolder = $PSScriptRoot,
    [int]$Limit = 0,
    [switch]$RenewCloudflareToken
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$account = '4e9350b4532477f1fb91ee27c5b40b49'
$bucket = 'umkm-content-media'
$apiBase = "https://api.cloudflare.com/client/v4/accounts/$account/r2/buckets/$bucket/objects"
$publicBase = 'https://media.umkmnaikkelas.id'
$payloadPath = Join-Path $PackageFolder 'UMKM_Repliz_Manual_800_Utas_7200_Post.json'
$mapPath = Join-Path $PackageFolder 'UMKM_160_Media_URLs.json'
$ownTokenPath = Join-Path $env:LOCALAPPDATA 'UMKM800Importer\cloudflare.xml'

function Reveal([Security.SecureString]$value) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
function Get-Status($exception) {
    if ($exception.Response -and $exception.Response.StatusCode) { return [int]$exception.Response.StatusCode }
    return 0
}
function Get-ApiFailure($exception) {
    $status = Get-Status $exception
    if ($status -eq 0) {
        if ($exception -is [Net.WebException]) { return "tanpa HTTP; status jaringan: $($exception.Status)" }
        return "tanpa HTTP; tipe kesalahan: $($exception.GetType().Name)"
    }
    $codes = @()
    try {
        $stream = $exception.Response.GetResponseStream()
        if ($null -ne $stream) {
            $reader = [IO.StreamReader]::new($stream)
            try {
                $body = $reader.ReadToEnd() | ConvertFrom-Json
                $codes = @($body.errors | ForEach-Object { [string]$_.code } | Where-Object { $_ -match '^\d+$' })
            } finally { $reader.Dispose() }
        }
    } catch { }
    if ($codes.Count) { return "HTTP $status; kode Cloudflare: $($codes -join ',')" }
    return "HTTP $status; kode Cloudflare tidak tersedia"
}
function Check-PublicObject([string]$url,[string]$expectedHash) {
    $temp = Join-Path ([IO.Path]::GetTempPath()) ('umkm800-' + [Guid]::NewGuid().ToString('N') + '.png')
    try {
        try { $response = Invoke-WebRequest -UseBasicParsing -Method Head -Uri $url -TimeoutSec 35 }
        catch {
            if ((Get-Status $_.Exception) -eq 404) { return 'MISSING' }
            throw "Gagal membaca URL publik ${url}: $($_.Exception.Message)"
        }
        $type = [string]$response.Headers['Content-Type']
        if ($type -notmatch '^image/png') { throw "Konten URL bukan image/png: $url ($type)" }
        Invoke-WebRequest -UseBasicParsing -Method Get -Uri $url -OutFile $temp -TimeoutSec 60 | Out-Null
        $actual = (Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $expectedHash) { throw "Objek sudah ada tetapi isi berbeda; tidak ditimpa: $url" }
        return 'EXACT'
    } finally {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
    }
}
function Save-Map($map,$keys) {
    $ordered = [ordered]@{}
    foreach ($key in $keys) { $ordered[$key] = [string]$map[$key] }
    $temp = "$mapPath.new"
    [IO.File]::WriteAllText($temp, ($ordered | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $mapPath) {
        $backup = "$mapPath.backup"
        [IO.File]::Replace([IO.Path]::GetFullPath($temp),[IO.Path]::GetFullPath($mapPath),[IO.Path]::GetFullPath($backup))
        Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    } else { [IO.File]::Move($temp,$mapPath) }
}

if (-not (Test-Path -LiteralPath $payloadPath -PathType Leaf)) { throw "Payload UMKM tidak ditemukan: $payloadPath" }
if (-not (Test-Path -LiteralPath $mapPath -PathType Leaf)) { throw "Peta media tidak ditemukan: $mapPath" }
$payload = Get-Content -LiteralPath $payloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (@($payload.records).Count -ne 7200 -or [string]$payload.account.repliz_account_id -ne '6a8e2fc362caae1e04063419') { throw 'Sumber bukan 800 utas UMKM final.' }
$visuals = @($payload.records | Where-Object { [int]$_.sequence -eq 1 -and $_.media_local_path } | Sort-Object thread_id)
if ($visuals.Count -ne 160 -or @($visuals | Group-Object thread_id).Count -ne 160) { throw 'Visual sumber tidak tepat 160 utas unik.' }
$saved = Get-Content -LiteralPath $mapPath -Raw -Encoding UTF8 | ConvertFrom-Json
$map = @{}
foreach ($entry in $saved.PSObject.Properties) { $map[$entry.Name] = [string]$entry.Value }
$ids = @($visuals | ForEach-Object { [string]$_.thread_id })
if ($map.Count -ne 160 -or @($ids | Where-Object { -not $map.ContainsKey($_) }).Count) { throw 'Peta media tidak berisi tepat 160 ID visual sumber.' }
foreach ($v in $visuals) {
    $name = [string]$v.media_local_path
    if ($name -cne ('visuals/' + [string]$v.thread_id + '.png')) { throw "Nama visual berbeda dari ID: $($v.thread_id)" }
    $file = Join-Path $PackageFolder $name
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "PNG tidak ditemukan: $file" }
    if ($map[$v.thread_id] -and $map[$v.thread_id] -notmatch '^https://[^\s/]+/\S+') { throw "URL peta tidak valid: $($v.thread_id)" }
}
$blank = @($ids | Where-Object { -not $map[$_] }).Count
Write-Host "Visual UMKM: 160 PNG; URL terisi: $(160-$blank); masih kosong: $blank."
if ($Mode -eq 'Validate') { Write-Host 'Validasi media lokal selesai; tidak ada unggahan.'; exit 0 }
if ($Limit -lt 0) { throw '-Limit tidak boleh negatif.' }

$lockPath = "$mapPath.lock"
try { $lock = [IO.File]::Open($lockPath,'OpenOrCreate','ReadWrite','None') }
catch { throw 'Proses media UMKM lain sedang berjalan.' }
try {
    $tokenSecure = $null; $newToken = $false
    $tokenSource = 'new_prompt'
    if (-not $RenewCloudflareToken -and (Test-Path -LiteralPath $ownTokenPath -PathType Leaf)) {
        $tokenSecure = (Import-Clixml -LiteralPath $ownTokenPath).cloudflare
        $tokenSource = 'umkm_saved'
    }
    if ($null -eq $tokenSecure) {
        $tokenSecure = Read-Host 'Cloudflare API Token untuk bucket umkm-content-media' -AsSecureString
        $newToken = $true
    }
    $token = (Reveal $tokenSecure).Trim()
    if ([string]::IsNullOrWhiteSpace($token)) { throw 'Cloudflare API Token kosong.' }
    $headers = @{Authorization=('Bearer ' + $token)}
    $token = $null
    if ($newToken) {
        [IO.Directory]::CreateDirectory((Split-Path $ownTokenPath -Parent)) | Out-Null
        [pscustomobject]@{cloudflare=$tokenSecure} | Export-Clixml -LiteralPath $ownTokenPath -Force
        Write-Host 'Token disimpan terenkripsi untuk akun Windows ini; akses belum terverifikasi.'
    }
    $verify = 'unknown'
    $verifyFailures = New-Object 'System.Collections.Generic.List[string]'
    foreach ($verifyUrl in @("https://api.cloudflare.com/client/v4/accounts/$account/tokens/verify",'https://api.cloudflare.com/client/v4/user/tokens/verify')) {
        try {
            $response = Invoke-RestMethod -Method Get -Uri $verifyUrl -Headers $headers -TimeoutSec 25
            if ($response.success -eq $true -and [string]$response.result.status -eq 'active') { $verify = 'active'; break }
            if ($response.result.status) { $verify = [string]$response.result.status }
            [void]$verifyFailures.Add("HTTP 200; status token: $verify")
        } catch { [void]$verifyFailures.Add((Get-ApiFailure $_.Exception)) }
    }
    try {
        $bucketCheck = Invoke-RestMethod -Method Get -Uri "${apiBase}?per_page=1&prefix=umkm%2Fthreads-800%2Fvisuals%2F" -Headers $headers -TimeoutSec 30
        if ($bucketCheck.success -ne $true) { throw 'Daftar objek tidak mengonfirmasi akses.' }
    } catch {
        $bucketFailure = Get-ApiFailure $_.Exception
        $verifyDetail = if ($verifyFailures.Count) { $verifyFailures -join ' | ' } else { 'tanpa kegagalan' }
        throw "Akses Cloudflare REST bucket $bucket gagal sebelum PUT: $bucketFailure. Verifikasi token: $verify ($verifyDetail). Sumber: $tokenSource. Token tetap terenkripsi untuk diagnosis ulang; gunakan -RenewCloudflareToken hanya jika perlu mengganti nilainya."
    }
    Write-Host "Akses REST bucket tersedia; sumber token: $tokenSource; status verifikasi: $verify."
    if ($Mode -eq 'CheckAuth') { Write-Host 'CheckAuth selesai. Tidak ada unggahan atau perubahan peta.'; exit 0 }
    $processed = 0; $uploaded = 0; $existing = 0
    foreach ($v in $visuals) {
        $id = [string]$v.thread_id
        $file = Join-Path $PackageFolder ([string]$v.media_local_path)
        $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
        $key = "umkm/threads-800/visuals/$id.png"
        $url = "$publicBase/$key"
        if ($map[$id]) {
            $mappedState = Check-PublicObject -url $map[$id] -expectedHash $hash
            if ($mappedState -ne 'EXACT') { throw "URL peta tidak tersedia untuk $id; tidak ditimpa." }
            $existing++
            continue
        }
        $state = Check-PublicObject -url $url -expectedHash $hash
        if ($state -eq 'MISSING') {
            try { $result = Invoke-RestMethod -Method Put -Uri "$apiBase/$key" -Headers $headers -InFile $file -ContentType 'image/png' -TimeoutSec 90 }
            catch { throw "PUT $id ditolak atau hasilnya tidak pasti. Periksa akses REST Cloudflare dan objek $url sebelum menjalankan ulang. Tidak ada Repliz POST. Detail: $($_.Exception.Message)" }
            if ($result.success -ne $true -or [string]$result.result.key -cne $key) { throw "R2 tidak mengonfirmasi unggahan $id." }
            $verified = $false
            for ($attempt=0; $attempt -lt 5; $attempt++) {
                if ((Check-PublicObject -url $url -expectedHash $hash) -eq 'EXACT') { $verified = $true; break }
                Start-Sleep -Seconds 2
            }
            if (-not $verified) { throw "PNG $id belum dapat diverifikasi melalui URL publik." }
            $uploaded++
        } else { $existing++ }
        $map[$id] = $url
        Save-Map $map $ids
        $processed++
        Write-Host "Terverifikasi: $id; $processed/160 baru dipetakan."
        if ($Limit -gt 0 -and $processed -ge $Limit) { break }
    }
    Write-Host "Selesai. Objek baru diunggah: $uploaded; identik sudah ada: $existing; URL peta kosong: $(@($ids | Where-Object { -not $map[$_] }).Count)."
    Write-Host "Peta media: $mapPath"
} finally {
    if ($null -ne $lock) { $lock.Dispose() }
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
}
