param(
    [string]$PayloadPath = (Join-Path $PSScriptRoot 'Ruang_Kalyanamitra_Repliz_450_Utas_3150_Post_MANUAL_PUBLISH.json'),
    [string]$JournalPath = (Join-Path $PSScriptRoot 'Ruang_Kalyanamitra_450_upload_state.json'),
    [ValidateSet('DryRun', 'Upload')]
    [string]$Mode = 'DryRun',
    [switch]$ResetCredential
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$apiBase = 'https://api.repliz.com/public'
$threadsAccountId = '6a8d2c7862caae1e0405397a'
$threadsUsername = 'ruangkalyanamitra'
$wibOffset = [TimeSpan]::FromHours(7)
$credentialFolder = Join-Path $env:LOCALAPPDATA 'Kalyanamitra450'
$credentialPath = Join-Path $credentialFolder 'repliz_credentials.xml'

function ConvertFrom-SecureValue([Security.SecureString]$Value) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Get-ReplizHeaders {
    if ($ResetCredential -and (Test-Path -LiteralPath $credentialPath)) {
        Remove-Item -LiteralPath $credentialPath -Force
    }
    if (-not (Test-Path -LiteralPath $credentialPath -PathType Leaf)) {
        [IO.Directory]::CreateDirectory($credentialFolder) | Out-Null
        $access = Read-Host 'Repliz Access Key'
        $secret = Read-Host 'Repliz Secret Key' -AsSecureString
        if ([string]::IsNullOrWhiteSpace($access)) { throw 'Repliz Access Key kosong.' }
        [pscustomobject]@{
            access = ConvertTo-SecureString $access -AsPlainText -Force
            secret = $secret
        } | Export-Clixml -LiteralPath $credentialPath -Force
        Write-Host 'Kredensial Repliz disimpan terenkripsi untuk pengguna Windows ini.'
    }
    $saved = Import-Clixml -LiteralPath $credentialPath
    $accessPlain = ConvertFrom-SecureValue $saved.access
    $secretPlain = ConvertFrom-SecureValue $saved.secret
    try {
        $raw = [Text.Encoding]::UTF8.GetBytes($accessPlain + ':' + $secretPlain)
        return @{ Authorization = 'Basic ' + [Convert]::ToBase64String($raw) }
    } finally {
        $accessPlain = $null
        $secretPlain = $null
    }
}

function Get-ContentSignature($Body) {
    if ($null -eq $Body -or [string]::IsNullOrWhiteSpace([string]$Body.description)) { return $null }
    $parts = New-Object System.Collections.ArrayList
    [void]$parts.Add([string]$Body.description)
    foreach ($reply in @($Body.replies)) {
        if ($null -ne $reply) { [void]$parts.Add([string]$reply.description) }
    }
    $raw = ConvertTo-Json -InputObject @($parts.ToArray()) -Compress -Depth 20
    $hasher = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($raw)
        return ([BitConverter]::ToString($hasher.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally { $hasher.Dispose() }
}

function Get-ScheduleId($Schedule) {
    if (-not [string]::IsNullOrWhiteSpace([string]$Schedule.scheduleId)) { return [string]$Schedule.scheduleId }
    if (-not [string]::IsNullOrWhiteSpace([string]$Schedule.id)) { return [string]$Schedule.id }
    return [string]$Schedule._id
}

function Get-AllThreadsSchedules($Headers) {
    $all = New-Object System.Collections.ArrayList
    for ($page = 1; $page -le 1000; $page++) {
        $uri = "$apiBase/schedule?page=$page&limit=100&accountIds%5B%5D=$threadsAccountId"
        $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $Headers -TimeoutSec 30
        if ($null -eq $response.docs -or $null -eq $response.hasNextPage) {
            throw 'Daftar jadwal Repliz tidak lengkap. Tidak ada POST agar tidak membuat duplikat.'
        }
        foreach ($schedule in @($response.docs)) {
            if ([string]$schedule.accountId -eq $threadsAccountId) { [void]$all.Add($schedule) }
        }
        if ($response.hasNextPage -eq $false) { return $all.ToArray() }
    }
    throw 'Batas 1000 halaman jadwal Repliz tercapai. Tidak ada POST.'
}

function Find-ExactRemoteSchedules($Headers, $Schedules, $ExpectedBody) {
    $expectedSignature = Get-ContentSignature $ExpectedBody
    $expectedOpener = [string]$ExpectedBody.description
    $matches = New-Object System.Collections.ArrayList
    foreach ($candidate in @($Schedules | Where-Object { [string]$_.description -ceq $expectedOpener })) {
        $candidateBody = $candidate
        if (@($candidate.replies).Count -eq 0) {
            $candidateId = Get-ScheduleId $candidate
            if ([string]::IsNullOrWhiteSpace($candidateId)) { throw 'Schedule dengan opener identik tidak mempunyai ID.' }
            $candidateBody = Invoke-RestMethod -Method Get -Uri "$apiBase/schedule/$candidateId" -Headers $Headers -TimeoutSec 30
        }
        if ((Get-ContentSignature $candidateBody) -eq $expectedSignature) { [void]$matches.Add($candidateBody) }
    }
    return $matches.ToArray()
}

function Save-State($Map, [string]$PayloadHash) {
    $state = [ordered]@{
        schema = 'kalyanamitra-repliz-upload-state-v2'
        accountId = $threadsAccountId
        payloadSha256 = $PayloadHash
        updatedAtUtc = [DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        entries = @($Map.Values | Sort-Object editorial_id)
    }
    $temporary = "$JournalPath.new"
    $json = $state | ConvertTo-Json -Depth 30
    [IO.File]::WriteAllText($temporary, $json, [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $JournalPath) {
        $backup = "$JournalPath.backup.$([Guid]::NewGuid().ToString('N'))"
        [IO.File]::Replace([IO.Path]::GetFullPath($temporary), [IO.Path]::GetFullPath($JournalPath), [IO.Path]::GetFullPath($backup))
        if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue }
    } else {
        [IO.File]::Move($temporary, $JournalPath)
    }
}

function Confirm-CreatedSchedule($Headers, [string]$ScheduleId, [string]$ExpectedSignature) {
    for ($attempt = 1; $attempt -le 6; $attempt++) {
        try {
            $remote = Invoke-RestMethod -Method Get -Uri "$apiBase/schedule/$ScheduleId" -Headers $Headers -TimeoutSec 30
            if ([string]$remote.accountId -ne $threadsAccountId) { throw 'Account ID hasil POST tidak cocok.' }
            if ((Get-ContentSignature $remote) -ne $ExpectedSignature) { throw 'Isi hasil POST tidak cocok.' }
            return $remote
        } catch {
            if ($attempt -eq 6) { throw }
            Start-Sleep -Seconds 2
        }
    }
}

if (-not (Test-Path -LiteralPath $PayloadPath -PathType Leaf)) { throw "Payload tidak ditemukan: $PayloadPath" }
$package = Get-Content -LiteralPath $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
$items = @($package.items)
$payloadHash = (Get-FileHash -LiteralPath $PayloadPath -Algorithm SHA256).Hash.ToLowerInvariant()

if ($items.Count -ne 450) { throw "Payload harus memuat tepat 450 utas; ditemukan $($items.Count)." }
if ([string]$package.account.accountId -ne $threadsAccountId) { throw 'Account ID paket bukan Threads Ruang Kalyanamitra.' }
if (@($items.editorial_id | Sort-Object -Unique).Count -ne 450) { throw 'Editorial ID tidak unik.' }
foreach ($item in $items) {
    if ([string]$item.body.accountId -ne $threadsAccountId) { throw "Account ID salah pada $($item.editorial_id)." }
    if ($item.body.additionalInfo.isDraft -ne $false) { throw "isDraft bukan false pada $($item.editorial_id)." }
    if (@($item.body.replies).Count -ne 6) { throw "Jumlah balasan bukan 6 pada $($item.editorial_id)." }
    if ((Get-ContentSignature $item.body) -eq $null) { throw "Isi kosong pada $($item.editorial_id)." }
}

$lockPath = "$JournalPath.lock"
try { $lock = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None') }
catch { throw 'Proses lain sedang memakai jurnal unggahan ini. Jangan jalankan dua kali bersamaan.' }

try {
    $headers = Get-ReplizHeaders
    $account = Invoke-RestMethod -Method Get -Uri "$apiBase/account/$threadsAccountId" -Headers $headers -TimeoutSec 30
    if ((@([string]$account.id, [string]$account._id) -notcontains $threadsAccountId) -or
        [string]$account.type -ne 'threads' -or
        ([string]$account.username).TrimStart('@').ToLowerInvariant() -ne $threadsUsername -or
        $account.isConnected -ne $true) {
        throw 'Akun Repliz bukan Threads @ruangkalyanamitra yang terhubung. Tidak ada POST.'
    }

    $resultMap = @{}
    if (Test-Path -LiteralPath $JournalPath -PathType Leaf) {
        $previous = Get-Content -LiteralPath $JournalPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ([string]$previous.payloadSha256 -ne $payloadHash) { throw 'Payload berubah sejak unggahan terakhir. Gunakan paket yang sama.' }
        if ([string]$previous.accountId -ne $threadsAccountId) { throw 'Account ID jurnal tidak cocok.' }
        foreach ($record in @($previous.entries)) { $resultMap[[string]$record.editorial_id] = $record }
    }

    Write-Host 'Membaca seluruh jadwal Threads untuk preflight duplikat dan benturan waktu...'
    $remoteSchedules = @(Get-AllThreadsSchedules $headers)
    $occupiedMinutes = @{}
    foreach ($schedule in $remoteSchedules) {
        if (-not [string]::IsNullOrWhiteSpace([string]$schedule.scheduleAt)) {
            $minute = [DateTimeOffset]::Parse([string]$schedule.scheduleAt).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm')
            $occupiedMinutes[$minute] = $true
        }
    }

    $weekdayNames = @('Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu')
    $profiles = $package.schedule_profile.profiles_wib
    if ($null -eq $profiles) { throw 'schedule_profile.profiles_wib tidak tersedia.' }
    $minimumUtc = [DateTimeOffset]::UtcNow.AddMinutes(20)
    $todayWib = [DateTimeOffset]::UtcNow.ToOffset($wibOffset).Date
    $candidateSlots = New-Object System.Collections.ArrayList
    for ($day = 0; $day -lt 180; $day++) {
        $date = $todayWib.AddDays($day)
        $weekday = $weekdayNames[[int]$date.DayOfWeek]
        foreach ($time in @($profiles.$weekday)) {
            $iso = $date.ToString('yyyy-MM-dd') + 'T' + [string]$time + ':00+07:00'
            $slot = [DateTimeOffset]::Parse($iso, [Globalization.CultureInfo]::InvariantCulture)
            if ($slot.ToUniversalTime() -gt $minimumUtc) { [void]$candidateSlots.Add($slot) }
        }
    }
    if ($candidateSlots.Count -lt 450) { throw 'Profil jadwal tidak menyediakan cukup slot 180 hari.' }

    $lastPlacedUtc = [DateTimeOffset]::MinValue
    $wouldUpload = 0
    $alreadyExists = 0
    $verifiedJournal = 0
    $previewRows = New-Object System.Collections.ArrayList

    foreach ($item in $items) {
        $editorialId = [string]$item.editorial_id
        $signature = Get-ContentSignature $item.body
        $exactRemote = @(Find-ExactRemoteSchedules $headers $remoteSchedules $item.body)
        if ($exactRemote.Count -gt 1) { throw "Lebih dari satu jadwal identik ditemukan untuk $editorialId. Periksa Repliz secara manual." }
        if ($exactRemote.Count -eq 1) {
            $remote = $exactRemote[0]
            $remoteId = Get-ScheduleId $remote
            if ([string]::IsNullOrWhiteSpace($remoteId)) { throw "Jadwal identik $editorialId tidak mempunyai ID." }
            if ([string]$remote.status -eq 'error') { throw "Jadwal identik $editorialId berstatus error. Tidak dikirim ulang." }
            if (-not [string]::IsNullOrWhiteSpace([string]$remote.scheduleAt)) {
                $remoteUtc = [DateTimeOffset]::Parse([string]$remote.scheduleAt).ToUniversalTime()
                if ($remoteUtc -gt $lastPlacedUtc) { $lastPlacedUtc = $remoteUtc }
            }
            if ($Mode -eq 'Upload') {
                $resultMap[$editorialId] = [ordered]@{
                    editorial_id = $editorialId
                    scheduleId = $remoteId
                    status = [string]$remote.status
                    postId = [string]$remote.postId
                    scheduleAt = [string]$remote.scheduleAt
                    signature = $signature
                    source = 'remote-exact-match'
                }
                Save-State $resultMap $payloadHash
            }
            $alreadyExists++
            continue
        }

        if ($resultMap.ContainsKey($editorialId)) {
            $savedId = [string]$resultMap[$editorialId].scheduleId
            if ([string]::IsNullOrWhiteSpace($savedId)) { throw "Jurnal $editorialId tidak mempunyai scheduleId." }
            $remote = Invoke-RestMethod -Method Get -Uri "$apiBase/schedule/$savedId" -Headers $headers -TimeoutSec 30
            if ([string]$remote.accountId -ne $threadsAccountId -or (Get-ContentSignature $remote) -ne $signature) {
                throw "Jurnal $editorialId tidak sesuai dengan Repliz. Berhenti tanpa mengirim ulang."
            }
            if (-not [string]::IsNullOrWhiteSpace([string]$remote.scheduleAt)) {
                $remoteUtc = [DateTimeOffset]::Parse([string]$remote.scheduleAt).ToUniversalTime()
                if ($remoteUtc -gt $lastPlacedUtc) { $lastPlacedUtc = $remoteUtc }
            }
            $verifiedJournal++
            continue
        }

        $desiredUtc = [DateTimeOffset]::Parse([string]$item.schedule_wib).ToUniversalTime()
        $lowerBound = $desiredUtc
        if ($minimumUtc -gt $lowerBound) { $lowerBound = $minimumUtc }
        if ($lastPlacedUtc -gt $lowerBound) { $lowerBound = $lastPlacedUtc.AddSeconds(1) }
        $chosen = $null
        foreach ($candidate in $candidateSlots) {
            $candidateUtc = $candidate.ToUniversalTime()
            if ($candidateUtc -lt $lowerBound) { continue }
            $minuteKey = $candidateUtc.ToString('yyyy-MM-ddTHH:mm')
            if (-not $occupiedMinutes.ContainsKey($minuteKey)) { $chosen = $candidate; break }
        }
        if ($null -eq $chosen) { throw "Tidak ada slot kosong untuk $editorialId. Tidak ada jadwal yang dihapus atau ditimpa." }

        $chosenUtc = $chosen.ToUniversalTime()
        $minuteKey = $chosenUtc.ToString('yyyy-MM-ddTHH:mm')
        $body = $item.body | ConvertTo-Json -Depth 40 | ConvertFrom-Json
        $body.scheduleAt = $chosenUtc.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        [void]$previewRows.Add([pscustomobject]@{
            editorial_id = $editorialId
            original_wib = [string]$item.schedule_wib
            upload_wib = $chosen.ToString('yyyy-MM-dd HH:mm')
        })

        if ($Mode -eq 'Upload') {
            $payloadJson = $body | ConvertTo-Json -Depth 40 -Compress
            $createdId = $null
            try {
                $created = Invoke-RestMethod -Method Post -Uri "$apiBase/schedule" -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($payloadJson)) -TimeoutSec 60
                $createdId = [string]$created.scheduleId
            } catch {
                Write-Warning "Hasil POST $editorialId tidak pasti. Melakukan satu rekonsiliasi read-only."
                $allRefreshed = @(Get-AllThreadsSchedules $headers)
                $refreshed = @(Find-ExactRemoteSchedules $headers $allRefreshed $item.body)
                if ($refreshed.Count -eq 1) { $createdId = Get-ScheduleId $refreshed[0] }
                elseif ($refreshed.Count -gt 1) { throw "POST $editorialId menghasilkan beberapa salinan. Berhenti untuk pemeriksaan manual." }
                else { throw "POST $editorialId tidak dapat direkonsiliasi. Jangan retry buta. Detail: $($_.Exception.Message)" }
            }
            if ([string]::IsNullOrWhiteSpace($createdId)) {
                $allRefreshed = @(Get-AllThreadsSchedules $headers)
                $refreshed = @(Find-ExactRemoteSchedules $headers $allRefreshed $item.body)
                if ($refreshed.Count -eq 1) { $createdId = Get-ScheduleId $refreshed[0] }
                else { throw "Respons POST $editorialId tidak mempunyai scheduleId dan hasil remote tidak tunggal." }
            }
            $confirmed = Confirm-CreatedSchedule $headers $createdId $signature
            $resultMap[$editorialId] = [ordered]@{
                editorial_id = $editorialId
                scheduleId = $createdId
                status = [string]$confirmed.status
                postId = [string]$confirmed.postId
                scheduleAt = [string]$confirmed.scheduleAt
                signature = $signature
                source = 'created-and-verified'
            }
            Save-State $resultMap $payloadHash
            if ($wouldUpload -eq 0 -or (($wouldUpload + 1) % 30) -eq 0) {
                Write-Host "Diterima dan diverifikasi: $editorialId; scheduleId: $createdId; WIB: $($chosen.ToString('dd-MM-yyyy HH:mm'))"
            }
        }

        $occupiedMinutes[$minuteKey] = $true
        $lastPlacedUtc = $chosenUtc
        $wouldUpload++
    }

    if ($Mode -eq 'DryRun') {
        $previewPath = Join-Path (Split-Path -Parent $JournalPath) 'Ruang_Kalyanamitra_450_DryRun_Preview.csv'
        $previewRows.ToArray() | Export-Csv -LiteralPath $previewPath -NoTypeInformation -Encoding UTF8
        Write-Host "Dry-run selesai. Akan dibuat: $wouldUpload; sudah ada remote: $alreadyExists; terverifikasi dari jurnal: $verifiedJournal."
        Write-Host "Pratinjau slot: $previewPath"
        Write-Host 'Tidak ada POST, update, atau delete yang dilakukan.'
    } else {
        $receiptPath = Join-Path (Split-Path -Parent $JournalPath) 'Ruang_Kalyanamitra_450_upload_receipt.json'
        $receipt = [ordered]@{
            schema = 'kalyanamitra-repliz-upload-receipt-v2'
            generatedAtUtc = [DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
            accountId = $threadsAccountId
            username = $threadsUsername
            payloadSha256 = $payloadHash
            totalPayloadItems = 450
            newlyCreated = $wouldUpload
            alreadyExisted = $alreadyExists
            verifiedFromJournal = $verifiedJournal
            journalEntryCount = $resultMap.Count
            destructiveActions = 0
        } | ConvertTo-Json -Depth 20
        [IO.File]::WriteAllText($receiptPath, $receipt, [Text.UTF8Encoding]::new($false))
        Write-Host "Upload selesai: $wouldUpload baru, $alreadyExists sudah ada, $verifiedJournal terverifikasi dari jurnal."
        Write-Host "Jurnal: $JournalPath"
        Write-Host "Receipt: $receiptPath"
        Write-Host 'Tidak ada schedule yang dihapus atau diubah.'
    }
} finally {
    if ($null -ne $lock) { $lock.Dispose() }
    try { Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue } catch {}
}
