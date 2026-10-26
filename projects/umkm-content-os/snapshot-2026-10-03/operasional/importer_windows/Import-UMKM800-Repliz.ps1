param(
    [ValidateSet('Validate','DryRun','Upload')][string]$Mode = 'Validate',
    [string]$PayloadPath = (Join-Path $PSScriptRoot 'UMKM_Repliz_Manual_800_Utas_7200_Post.json'),
    [string]$MediaMapPath = (Join-Path $PSScriptRoot 'UMKM_160_Media_URLs.json'),
    [string]$StartDate = '2026-10-13',
    [string]$EndDate = '2026-12-31',
    [string]$JournalPath = (Join-Path $PSScriptRoot 'UMKM_800_upload_state.json')
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$base = 'https://api.repliz.com/public'
$accountId = '6a8e2fc362caae1e04063419'
$handle = 'umkmnaikkelas.id'
$minTime = [DateTimeOffset]::UtcNow.AddMinutes(20)

function Reveal([Security.SecureString]$value) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
function Get-Headers {
    $access = $null; $secret = $null
    $oldPath = Join-Path $env:LOCALAPPDATA 'UMKMContentOS\repliz-credential.json'
    $monitorPath = Join-Path $env:LOCALAPPDATA 'UMKM800Hermes\credentials.xml'
    $ownPath = Join-Path $env:LOCALAPPDATA 'UMKM800Importer\credentials.xml'
    if ((Test-Path -LiteralPath $oldPath -PathType Leaf)) {
        $saved = Get-Content -LiteralPath $oldPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ([string]$saved.schema -ne 'umkm-content-os-repliz-credential-v1') { throw 'Format kredensial UMKM Content OS tidak dikenal.' }
        $access = Reveal (ConvertTo-SecureString -String ([string]$saved.protected_access_key))
        $secret = Reveal (ConvertTo-SecureString -String ([string]$saved.protected_secret_key))
    } elseif (Test-Path -LiteralPath $monitorPath -PathType Leaf) {
        $saved = Import-Clixml -LiteralPath $monitorPath
        $access = Reveal $saved.key; $secret = Reveal $saved.secret
    } elseif (Test-Path -LiteralPath $ownPath -PathType Leaf) {
        $saved = Import-Clixml -LiteralPath $ownPath
        $access = Reveal $saved.key; $secret = Reveal $saved.secret
    } else {
        $access = (Read-Host 'Repliz Public API Access Key UMKM').Trim()
        $secureSecret = Read-Host 'Repliz Public API Secret Key UMKM' -AsSecureString
        $secret = Reveal $secureSecret
        if ([string]::IsNullOrWhiteSpace($access) -or [string]::IsNullOrWhiteSpace($secret)) { throw 'Kredensial Repliz kosong.' }
        [IO.Directory]::CreateDirectory((Split-Path $ownPath -Parent)) | Out-Null
        [pscustomobject]@{key=(ConvertTo-SecureString $access -AsPlainText -Force); secret=$secureSecret} |
            Export-Clixml -LiteralPath $ownPath -Force
    }
    if ([string]::IsNullOrWhiteSpace($access) -or [string]::IsNullOrWhiteSpace($secret)) { throw 'Kredensial Repliz kosong.' }
    $basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($access + ':' + $secret))
    $access=$null; $secret=$null
    return @{Authorization='Basic ' + $basic}
}
function Get-Id($x) {
    if ($x.scheduleId) { return [string]$x.scheduleId }
    if ($x.id) { return [string]$x.id }
    return [string]$x._id
}
function Get-Schedules($headers) {
    $all = New-Object System.Collections.ArrayList
    for ($page=1; $page -le 1000; $page++) {
        $uri = "$base/schedule?page=$page&limit=100&accountIds%5B%5D=$accountId"
        $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers -TimeoutSec 35
        if ($null -eq $response.docs -or $null -eq $response.hasNextPage) { throw 'Daftar Repliz tidak lengkap; berhenti sebelum POST.' }
        foreach ($schedule in @($response.docs)) {
            if ([string]$schedule.accountId -eq $accountId) { [void]$all.Add($schedule) }
        }
        if ($response.hasNextPage -eq $false) { return $all.ToArray() }
    }
    throw 'Batas halaman Repliz tercapai; berhenti sebelum POST.'
}
function Get-Detail($schedule,$headers) {
    if (@($schedule.replies).Count -gt 0) { return $schedule }
    $id = Get-Id $schedule
    if ([string]::IsNullOrWhiteSpace($id)) { throw 'Jadwal tanpa ID tidak bisa diverifikasi.' }
    return Invoke-RestMethod -Method Get -Uri "$base/schedule/$id" -Headers $headers -TimeoutSec 35
}
function Same-Chain($remote,$chain) {
    if ([string]$remote.accountId -ne $accountId -or [string]$remote.description -cne [string]$chain[0].content) { return $false }
    $replies = @($remote.replies)
    if ($replies.Count -ne ($chain.Count - 1)) { return $false }
    for ($i=0; $i -lt $replies.Count; $i++) {
        if ([string]$replies[$i].description -cne [string]$chain[$i+1].content) { return $false }
    }
    return $true
}
function Save-State($state,$hash) {
    $document = [ordered]@{schema='umkm800-repliz-upload-v1'; accountId=$accountId; payloadSha256=$hash; entries=$state}
    $temp = "$JournalPath.new"
    [IO.File]::WriteAllText($temp, ($document | ConvertTo-Json -Depth 15), [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $JournalPath) {
        $backup = "$JournalPath.backup"
        [IO.File]::Replace([IO.Path]::GetFullPath($temp),[IO.Path]::GetFullPath($JournalPath),[IO.Path]::GetFullPath($backup))
        Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    } else { [IO.File]::Move($temp,$JournalPath) }
}
function New-Body($chain,$mediaUrl,$when) {
    $opener=$chain[0]
    $medias=@()
    if ($mediaUrl) {
        $medias=@([ordered]@{alt=[string]$opener.topic_tag; customThumbnail=$false; type='image'; thumbnail=$mediaUrl; url=$mediaUrl})
    }
    $replies=@(foreach ($record in ($chain | Select-Object -Skip 1)) {
        [ordered]@{title=''; description=[string]$record.content; topic=[string]$record.topic_tag; type='text'; medias=@()}
    })
    return [ordered]@{
        title=[string]$opener.content; description=[string]$opener.content; topic=[string]$opener.topic_tag
        type=$(if ($mediaUrl) {'image'} else {'text'}); medias=$medias
        meta=[ordered]@{title=''; description=''; url=''}
        additionalInfo=[ordered]@{isAiGenerated=$true; isDraft=$false; isAutoAddMusic=$false; isShareToFeed=$false
            collaborators=@(); music=[ordered]@{id='';artist='';name='';thumbnail='';volume=[ordered]@{video=50;music=100}}
            products=@();tags=@();mentions=@();targetCountries=@()}
        replies=$replies; accountId=$accountId; scheduleAt=$when.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    }
}

if (-not (Test-Path -LiteralPath $PayloadPath -PathType Leaf)) { throw "Payload UMKM tidak ditemukan: $PayloadPath" }
if ($StartDate -notmatch '^\d{4}-\d{2}-\d{2}$' -or $EndDate -notmatch '^\d{4}-\d{2}-\d{2}$' -or $StartDate -gt $EndDate) { throw 'Rentang tanggal salah.' }
$hash=(Get-FileHash -LiteralPath $PayloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
$payload=Get-Content -LiteralPath $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
$records=@($payload.records)
if ($records.Count -ne 7200) { throw 'Payload harus tepat 7.200 post.' }
if ([string]$payload.account.repliz_account_id -ne $accountId -or [string]$payload.account.handle -ne $handle) { throw 'Payload bukan Threads UMKM Naik Kelas.' }
$map=@{}
if (Test-Path -LiteralPath $MediaMapPath -PathType Leaf) {
    $mapped=Get-Content -LiteralPath $MediaMapPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($p in $mapped.PSObject.Properties) { $map[$p.Name]=[string]$p.Value }
}
$grouped=@($records | Group-Object thread_id)
if ($grouped.Count -ne 800) { throw 'Payload harus tepat 800 utas.' }
$selection=New-Object System.Collections.ArrayList
$missing=New-Object System.Collections.ArrayList
$known=@{}
foreach ($group in $grouped) {
    $chain=@($group.Group | Sort-Object sequence)
    $id=[string]$group.Name
    if ($chain.Count -lt 8 -or $chain.Count -gt 10 -or [int]$chain[0].sequence -ne 1 -or [string]$chain[0].record_type -ne 'PEMBUKA') { throw "Struktur utas salah: $id" }
    for ($i=0; $i -lt $chain.Count; $i++) {
        if ([int]$chain[$i].sequence -ne ($i+1) -or [string]$chain[$i].account_id -ne $accountId -or [string]::IsNullOrWhiteSpace([string]$chain[$i].content)) { throw "Urutan/akun/isi salah: $id" }
        if ($i -gt 0 -and ([string]$chain[$i].record_type -ne 'BALASAN' -or [int]$chain[$i].parent_seq -ne 1 -or $chain[$i].media_url)) { throw "Balasan salah: $id" }
    }
    $when=[DateTimeOffset]::Parse([string]$chain[0].scheduled_at,[Globalization.CultureInfo]::InvariantCulture)
    $date=$when.ToString('yyyy-MM-dd')
    if ($date -ne [string]$chain[0].date -or $when.Offset.TotalHours -ne 7) { throw "Waktu/offset salah: $id" }
    foreach ($record in $chain) { if ([string]$record.scheduled_at -cne [string]$chain[0].scheduled_at) { throw "Jadwal balasan berbeda: $id" } }
    $mediaUrl=[string]$chain[0].media_url
    if ($chain[0].media_local_path) {
        $image=Join-Path $PSScriptRoot ([string]$chain[0].media_local_path)
        if (-not (Test-Path -LiteralPath $image -PathType Leaf)) { throw "Visual hilang: $image" }
        if ($map.ContainsKey($id)) { $mediaUrl=$map[$id] }
        if ([string]::IsNullOrWhiteSpace($mediaUrl)) { [void]$missing.Add($id) }
        elseif ($mediaUrl -notmatch '^https://[^\s/]+/\S+') { throw "URL media tidak valid: $id" }
    } elseif ($mediaUrl -or ($map.ContainsKey($id) -and $map[$id])) { throw "Media tidak ditandai pada payload: $id" }
    if ($date -ge $StartDate -and $date -le $EndDate) { [void]$selection.Add([pscustomobject]@{Id=$id;Chain=$chain;When=$when;MediaUrl=$mediaUrl}) }
    if ($known.ContainsKey($when.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm'))) { throw "Slot payload duplikat: $id" }
    $known[$when.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm')]=$true
}
$selected=@($selection | Sort-Object When)
if ($selected.Count -eq 0) { throw 'Tidak ada utas pada rentang tanggal ini.' }
$missingSelected=@($selected | Where-Object { $_.Chain[0].media_local_path -and -not $_.MediaUrl })
Write-Host "UMKM: 800 utas / 7.200 post; dipilih $($selected.Count) utas ($StartDate s.d. $EndDate)."
Write-Host "URL media kosong: $($missing.Count) dari 160 visual; dalam pilihan: $($missingSelected.Count)."
if ($Mode -eq 'Validate') { Write-Host 'Validasi lokal selesai. Tidak ada akses Repliz atau perubahan jadwal.'; exit 0 }
if ($missingSelected.Count) { throw 'Lengkapi URL publik PNG pada UMKM_160_Media_URLs.json untuk tanggal yang dipilih sebelum DryRun/Upload. Tidak ada POST.' }
if ($Mode -eq 'Upload' -and @($selected | Where-Object { $_.When.ToUniversalTime() -le $minTime }).Count) { throw 'Ada slot yang sudah lewat atau kurang dari 20 menit; jangan menggeser jadwal diam-diam.' }
$lockPath="$JournalPath.lock"
try { $lock=[IO.File]::Open($lockPath,'OpenOrCreate','ReadWrite','None') }
catch { throw 'Importer UMKM lain sedang berjalan.' }
try {
    $headers=Get-Headers
    $account=Invoke-RestMethod -Method Get -Uri "$base/account/$accountId" -Headers $headers -TimeoutSec 35
    if ((@([string]$account.id,[string]$account._id) -notcontains $accountId) -or [string]$account.type -ne 'threads' -or ([string]$account.username).TrimStart('@').ToLowerInvariant() -ne $handle -or $account.isConnected -ne $true) { throw 'Akun Repliz bukan Threads @umkmnaikkelas.id yang terhubung.' }
    $remote=@(Get-Schedules $headers)
    $state=@{}
    if (Test-Path -LiteralPath $JournalPath -PathType Leaf) {
        $old=Get-Content -LiteralPath $JournalPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ([string]$old.payloadSha256 -ne $hash -or [string]$old.accountId -ne $accountId) { throw 'Jurnal memakai payload/akun berbeda.' }
        foreach ($p in $old.entries.PSObject.Properties) { $state[$p.Name]=$p.Value }
    }
    $plan=New-Object System.Collections.ArrayList
    foreach ($item in $selected) {
        $matches=@($remote | Where-Object { [string]$_.description -ceq [string]$item.Chain[0].content })
        if ($matches.Count -gt 1) { throw "Pembuka remote ganda: $($item.Id)" }
        $status='CREATE'; $scheduleId=''
        if ($matches.Count -eq 1) {
            $detail=Get-Detail $matches[0] $headers
            if (-not (Same-Chain $detail $item.Chain)) { throw "Pembuka remote ada tetapi balasan tidak cocok: $($item.Id)" }
            if (-not $detail.scheduleAt -or [Math]::Abs(([DateTimeOffset]::Parse([string]$detail.scheduleAt).ToUniversalTime()-$item.When.ToUniversalTime()).TotalSeconds) -ge 60) { throw "Jadwal remote berbeda dari payload: $($item.Id)" }
            if ($item.MediaUrl -and (@($detail.medias).Count -ne 1 -or [string]$detail.medias[0].url -cne $item.MediaUrl)) { throw "Media remote berbeda dari payload: $($item.Id)" }
            if (-not $item.MediaUrl -and @($detail.medias).Count -gt 0) { throw "Media remote di luar payload: $($item.Id)" }
            $scheduleId=Get-Id $detail
            if ([string]::IsNullOrWhiteSpace($scheduleId)) { throw "ID remote tidak ada: $($item.Id)" }
            $status='EXISTS'
        } elseif ($state.ContainsKey($item.Id)) { throw "Jurnal mencatat $($item.Id) tetapi tidak ditemukan remote. Berhenti agar tidak duplikat." }
        if ($status -eq 'CREATE') {
            foreach ($r in $remote) {
                if (-not $r.scheduleAt) { continue }
                $rtime=[DateTimeOffset]::Parse([string]$r.scheduleAt)
                if ([Math]::Abs(($rtime.ToUniversalTime()-$item.When.ToUniversalTime()).TotalSeconds) -lt 60) { throw "Slot remote berbenturan: $($item.Id)" }
            }
        }
        [void]$plan.Add([pscustomobject]@{thread_id=$item.Id; scheduled_at=[string]$item.Chain[0].scheduled_at; action=$status; scheduleId=$scheduleId; media_url=$item.MediaUrl})
    }
    $preview=Join-Path $PSScriptRoot 'UMKM_800_Preview.csv'
    $plan.ToArray() | Export-Csv -LiteralPath $preview -NoTypeInformation -Encoding UTF8
    $toCreate=@($plan | Where-Object { $_.action -eq 'CREATE' }).Count
    Write-Host "Preflight Repliz selesai: $toCreate perlu unggah; $($selected.Count-$toCreate) sudah ada. Preview: $preview"
    if ($Mode -eq 'DryRun') { Write-Host 'DryRun selesai. Tidak ada POST, update, atau delete.'; exit 0 }
    foreach ($item in $selected) {
        $entry=@($plan | Where-Object { $_.thread_id -eq $item.Id })[0]
        if ($entry.action -eq 'EXISTS') { $state[$item.Id]=[ordered]@{scheduleId=$entry.scheduleId;status='EXISTS'}; Save-State $state $hash; continue }
        if ($item.MediaUrl) {
            try { $head=Invoke-WebRequest -Method Head -Uri $item.MediaUrl -UseBasicParsing -TimeoutSec 25 }
            catch { throw "PNG tidak dapat diakses: $($item.Id). Tidak ada POST untuk utas ini." }
            if ([string]$head.Headers['Content-Type'] -notmatch '^image/png') { throw "URL bukan image/png: $($item.Id)" }
        }
        $body=New-Body $item.Chain $item.MediaUrl $item.When
        $json=$body | ConvertTo-Json -Depth 35 -Compress
        $createdId=''
        try {
            $created=Invoke-RestMethod -Method Post -Uri "$base/schedule" -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 60
            $createdId=Get-Id $created
        } catch {
            $refreshed=@(Get-Schedules $headers | Where-Object { [string]$_.description -ceq [string]$item.Chain[0].content })
            if ($refreshed.Count -eq 1 -and (Same-Chain (Get-Detail $refreshed[0] $headers) $item.Chain)) { $createdId=Get-Id $refreshed[0] }
            else { throw "Respons POST $($item.Id) tidak pasti. Jangan jalankan ulang sampai remote diperiksa." }
        }
        if (-not $createdId) {
            $refreshed=@(Get-Schedules $headers | Where-Object { [string]$_.description -ceq [string]$item.Chain[0].content })
            if ($refreshed.Count -eq 1 -and (Same-Chain (Get-Detail $refreshed[0] $headers) $item.Chain)) { $createdId=Get-Id $refreshed[0] }
            else { throw "POST $($item.Id) tidak memberikan ID; hentikan tanpa retry." }
        }
        $confirmed=Invoke-RestMethod -Method Get -Uri "$base/schedule/$createdId" -Headers $headers -TimeoutSec 35
        if (-not (Same-Chain $confirmed $item.Chain)) { throw "Hasil remote $($item.Id) tidak sesuai. Hentikan tanpa retry." }
        $state[$item.Id]=[ordered]@{scheduleId=$createdId;status='CREATED_VERIFIED'}
        Save-State $state $hash
        Write-Host "Diterima: $($item.Id); scheduleId: $createdId"
    }
    Write-Host "Selesai: $toCreate baru, $($selected.Count-$toCreate) sudah ada. Tidak ada penghapusan atau perubahan jadwal remote."
} finally {
    if ($null -ne $lock) { $lock.Dispose() }
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
}
