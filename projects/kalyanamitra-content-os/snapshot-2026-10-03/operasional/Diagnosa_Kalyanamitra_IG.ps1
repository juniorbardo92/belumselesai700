param([string]$EditorialId = 'rk-20260922-02')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$taskName = 'Kalyanamitra IG Carousel Setelah Threads'
$threadAccount = '6a8d2c7862caae1e0405397a'
$igAccount = '6a8d2c6762caae1e04053962'
$api = 'https://api.repliz.com/public'

function Print-Schedule([string]$label, $record) {
    if ($null -eq $record) { Write-Host "$label`: tidak tercatat"; return }
    $recordId = if ($record.scheduleId) { $record.scheduleId } elseif ($record.id) { $record.id } else { $record._id }
    Write-Host ("{0}: scheduleId={1}; status={2}; postIdAda={3}; jadwalUTC={4}" -f
        $label, [string]$recordId, [string]$record.status,
        (-not [string]::IsNullOrWhiteSpace([string]$record.postId)), [string]$record.scheduleAt)
}

try {
    $task = Get-ScheduledTask -TaskName $taskName
    $info = $task | Get-ScheduledTaskInfo
    Write-Host ("Tugas Windows: state={0}; lastRun={1}; nextRun={2}; lastResult={3}" -f
        $task.State, $info.LastRunTime, $info.NextRunTime, $info.LastTaskResult)
    $arguments = [string]@($task.Actions)[0].Arguments
    $scriptMatch = [regex]::Match($arguments, '-File\s+"([^"]+)"', 'IgnoreCase')
    if (-not $scriptMatch.Success) { throw 'Lokasi skrip pemantau tidak terbaca dari tugas Windows.' }
    $monitorPath = $scriptMatch.Groups[1].Value
    $folder = Split-Path -Path $monitorPath -Parent
    Write-Host "Skrip pemantau: $monitorPath"
    if (-not (Test-Path -LiteralPath $monitorPath -PathType Leaf)) {
        throw 'Skrip pemantau sudah tidak berada di lokasi tugas Windows.'
    }
} catch {
    Write-Host ('Tugas Windows tidak dapat diperiksa: ' + $_.Exception.Message)
    return
}

$payloadPath = Join-Path $folder 'Ruang_Kalyanamitra_Repliz_450_Utas_3150_Post_MANUAL_PUBLISH.json'
$threadJournalPath = Join-Path $folder 'Ruang_Kalyanamitra_450_upload_state.json'
$igJournalPath = Join-Path $folder 'Ruang_Kalyanamitra_450_ig_state.json'
foreach ($p in @($payloadPath, $threadJournalPath, $igJournalPath)) {
    if (Test-Path -LiteralPath $p -PathType Leaf) {
        Write-Host ("Berkas {0}: ada; diperbarui {1}" -f (Split-Path -Leaf $p), (Get-Item -LiteralPath $p).LastWriteTime)
    } else { Write-Host ("Berkas {0}: tidak ada" -f (Split-Path -Leaf $p)) }
}
if (-not (Test-Path -LiteralPath $payloadPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $threadJournalPath -PathType Leaf)) { return }

$package = Get-Content -LiteralPath $payloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
$item = @($package.items | Where-Object { [string]$_.editorial_id -eq $EditorialId })
if ($item.Count -ne 1) { Write-Host "Editorial ID $EditorialId tidak ditemukan tepat sekali dalam payload."; return }
$caption = [string]$item[0].body.description
$hash = (Get-FileHash -LiteralPath $payloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
$threadJournal = Get-Content -LiteralPath $threadJournalPath -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host ('Hash payload cocok jurnal Threads: ' + ([string]$threadJournal.payloadSha256 -eq $hash))
$localThread = @($threadJournal.entries | Where-Object { [string]$_.editorial_id -eq $EditorialId })
if ($localThread.Count -ne 1) { Write-Host "Jurnal Threads tidak memiliki tepat satu entri $EditorialId."; return }
Print-Schedule 'Jurnal Threads (snapshot saat unggah)' $localThread[0]

if (Test-Path -LiteralPath $igJournalPath -PathType Leaf) {
    $igJournal = Get-Content -LiteralPath $igJournalPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Write-Host ('Hash payload cocok jurnal IG: ' + ([string]$igJournal.payloadSha256 -eq $hash))
    $localIg = @($igJournal.entries | Where-Object { [string]$_.editorial_id -eq $EditorialId })
    if ($localIg.Count -gt 0) { Print-Schedule 'Jurnal IG' $localIg[0] }
    else { Write-Host 'Jurnal IG: item belum tercatat' }
} else { Write-Host 'Jurnal IG: belum ada' }

$authPath = Join-Path (Join-Path $env:LOCALAPPDATA 'Kalyanamitra450') 'autopublish_credentials.xml'
if (-not (Test-Path -LiteralPath $authPath -PathType Leaf)) {
    Write-Host 'Kredensial terenkripsi untuk pemantau tidak ditemukan; pemeriksaan Repliz dilewati.'
    return
}
try {
    $credentials = Import-Clixml -LiteralPath $authPath
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credentials.secret)
    try {
        $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        $accessPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credentials.access)
        try {
            $access = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($accessPointer)
            $authorization = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($access + ':' + $secret))
        } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($accessPointer) }
    } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $access = $null; $secret = $null
    $headers = @{ Authorization = $authorization }
    $thread = Invoke-RestMethod -Method Get -Uri "$api/schedule/$($localThread[0].scheduleId)" -Headers $headers
    if ([string]$thread.accountId -ne $threadAccount -or [string]$thread.description -cne $caption) {
        Write-Host 'Repliz Threads: akun atau teks tidak cocok dengan payload. Pemantau akan berhenti.'
        return
    }
    Print-Schedule 'Repliz Threads saat ini' $thread

    $igMatches = @()
    for ($page = 1; $page -le 1000; $page++) {
        $uri = "$api/schedule?page=$page&limit=100&accountIds%5B%5D=$igAccount"
        $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
        if ($null -eq $response.docs -or $null -eq $response.hasNextPage) {
            Write-Host 'Daftar Repliz IG tidak lengkap; status IG belum dapat dipastikan.'
            return
        }
        $igMatches += @($response.docs | Where-Object {
            [string]$_.accountId -eq $igAccount -and [string]$_.description -ceq $caption -and $_.type -eq 'album'
        })
        if ($response.hasNextPage -eq $false) { break }
    }
    if ($igMatches.Count -eq 0) { Write-Host 'Repliz IG: belum ada carousel dengan teks pembuka yang sama.' }
    else { foreach ($ig in $igMatches) { Print-Schedule 'Repliz IG saat ini' $ig } }
} catch {
    $statusCode = if ($null -ne $_.Exception.Response) { [string][int]$_.Exception.Response.StatusCode } else { 'tidak tersedia' }
    Write-Host ("Pemeriksaan Repliz gagal; HTTP={0}; jenis={1}. Kredensial tidak ditampilkan." -f
        $statusCode, $_.Exception.GetType().Name)
} finally { $authorization = $null; $headers = $null }

try {
    $media = "https://media.umkmnaikkelas.id/kalyanamitra/auto-carousel/$EditorialId/slide-01.jpg"
    $head = Invoke-WebRequest -UseBasicParsing -Method Head -Uri $media -TimeoutSec 15
    Write-Host ("Media slide pertama: HTTP={0}; contentType={1}" -f
        [int]$head.StatusCode, [string]$head.Headers['Content-Type'])
} catch {
    $statusCode = if ($null -ne $_.Exception.Response) { [string][int]$_.Exception.Response.StatusCode } else { 'tidak tersedia' }
    Write-Host "Media slide pertama belum terbaca; HTTP=$statusCode"
}

Write-Host 'Pemeriksaan selesai. Skrip ini hanya membaca; tidak membuat jadwal atau mengunggah konten.'
