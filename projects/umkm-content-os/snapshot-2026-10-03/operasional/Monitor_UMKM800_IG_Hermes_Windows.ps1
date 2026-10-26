param(
    [string]$PackageFolder = '',
    [string]$SourcePath = '',
    [string]$StatePath = '',
    [string]$OutputRoot = '',
    [switch]$Install,
    [switch]$ResetCredentials,
    [switch]$RetryFailed
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if (-not $PackageFolder) { $PackageFolder = Join-Path $env:USERPROFILE 'Downloads\UMKM800_Manual' }
if (-not $SourcePath) { $SourcePath = Join-Path $PackageFolder 'UMKM_Repliz_Manual_800_Utas_7200_Post.json' }
if (-not $StatePath) { $StatePath = Join-Path $PackageFolder 'UMKM_800_IG_Hermes_state.json' }
if (-not $OutputRoot) { $OutputRoot = Join-Path $PackageFolder 'instagram_rendered' }
$replizBase = 'https://api.repliz.com/public'
$threadsId = '6a8e2fc362caae1e04063419'
$instagramId = '6a8e2fac62caae1e04063415'
$username = 'umkmnaikkelas.id'
$credentialFolder = Join-Path $env:LOCALAPPDATA 'UMKM800Hermes'
$credentialPath = Join-Path $credentialFolder 'credentials.xml'
$taskName = 'UMKM 800 H+1 Threads ke Hermes'

function Reveal([Security.SecureString]$value) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-Headers {
    if ($ResetCredentials -and (Test-Path -LiteralPath $credentialPath)) { Remove-Item -LiteralPath $credentialPath -Force }
    if (-not (Test-Path -LiteralPath $credentialPath -PathType Leaf)) {
        [IO.Directory]::CreateDirectory($credentialFolder) | Out-Null
        $pilotCredentialPath = Join-Path $env:LOCALAPPDATA 'UMKMContentOS\repliz-credential.json'
        $importerCredentialPath = Join-Path $env:LOCALAPPDATA 'UMKM800Importer\credentials.xml'
        $keySecure = $null; $secret = $null
        if (Test-Path -LiteralPath $pilotCredentialPath -PathType Leaf) {
            $pilot = Get-Content -LiteralPath $pilotCredentialPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ([string]$pilot.schema -ne 'umkm-content-os-repliz-credential-v1') { throw 'Format kredensial Repliz UMKM Content OS tidak cocok.' }
            $keySecure = ConvertTo-SecureString -String ([string]$pilot.protected_access_key)
            $secret = ConvertTo-SecureString -String ([string]$pilot.protected_secret_key)
            Write-Host 'Memakai kredensial Repliz UMKM Content OS yang sudah tersimpan.'
        } elseif (Test-Path -LiteralPath $importerCredentialPath -PathType Leaf) {
            $importerCredential = Import-Clixml -LiteralPath $importerCredentialPath
            $keySecure = $importerCredential.key
            $secret = $importerCredential.secret
            Write-Host 'Memakai kredensial Repliz UMKM importer yang sudah tersimpan.'
        } else {
            $key = Read-Host 'Repliz Access Key UMKM'
            $secret = Read-Host 'Repliz Secret Key UMKM' -AsSecureString
            if ([string]::IsNullOrWhiteSpace($key)) { throw 'Repliz Access Key kosong.' }
            $keySecure = ConvertTo-SecureString $key -AsPlainText -Force
        }
        if ([string]::IsNullOrWhiteSpace((Reveal $keySecure)) -or [string]::IsNullOrWhiteSpace((Reveal $secret))) { throw 'Kredensial Repliz UMKM kosong.' }
        [pscustomobject]@{ key=$keySecure; secret=$secret } |
            Export-Clixml -LiteralPath $credentialPath -Force
        Write-Host 'Kredensial Repliz tersimpan terenkripsi untuk pengguna Windows ini.'
    }
    $saved = Import-Clixml -LiteralPath $credentialPath
    $keyPlain = Reveal $saved.key
    $secretPlain = Reveal $saved.secret
    $basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($keyPlain + ':' + $secretPlain))
    $headers = @{ repliz=@{Authorization='Basic ' + $basic} }
    $keyPlain=$null; $secretPlain=$null
    return $headers
}

function Get-ScheduleId($x) {
    if ($x.scheduleId) { return [string]$x.scheduleId }
    if ($x.id) { return [string]$x.id }
    return [string]$x._id
}

function Get-Schedules($headers) {
    $all = New-Object System.Collections.ArrayList
    for ($page=1; $page -le 1000; $page++) {
        $url = "$replizBase/schedule?page=$page&limit=100&accountIds%5B%5D=$threadsId"
        $response = Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 30
        if ($null -eq $response.docs -or $null -eq $response.hasNextPage) { throw 'Daftar Repliz tidak lengkap.' }
        foreach ($row in @($response.docs)) {
            if ([string]$row.accountId -eq $threadsId) { [void]$all.Add($row) }
        }
        if ($response.hasNextPage -eq $false) { return $all.ToArray() }
    }
    throw 'Batas halaman Repliz tercapai.'
}

function Verify-Source($source) {
    if ([string]$source.account.repliz_account_id -ne $threadsId) { throw 'Payload bukan milik Threads UMKM Naik Kelas.' }
    if ([string]$source.account.handle -ne $username) { throw 'Handle payload UMKM tidak cocok.' }
    $records = @($source.records)
    if ($records.Count -ne 7200) { throw "Payload final wajib berisi 7.200 post, ditemukan $($records.Count)." }
    $byThread = @{}
    $byOpener = @{}
    foreach ($record in $records) {
        if ([string]$record.account_id -ne $threadsId) { throw "Akun salah: $($record.thread_id)" }
        $id = [string]$record.thread_id
        if (-not $byThread.ContainsKey($id)) { $byThread[$id] = New-Object System.Collections.ArrayList }
        [void]$byThread[$id].Add($record)
    }
    if ($byThread.Count -ne 800) { throw "Payload final wajib berisi 800 utas, ditemukan $($byThread.Count)." }
    foreach ($id in @($byThread.Keys)) {
        $posts = @($byThread[$id].ToArray() | Sort-Object sequence)
        if ($posts.Count -lt 8 -or $posts.Count -gt 10) { throw "Jumlah post salah: $id" }
        for ($i=0; $i -lt $posts.Count; $i++) {
            if ([int]$posts[$i].sequence -ne ($i+1)) { throw "Urutan post salah: $id" }
        }
        if ([string]$posts[0].record_type -ne 'PEMBUKA') { throw "Pembuka hilang: $id" }
        $opener = [string]$posts[0].content
        if ($byOpener.ContainsKey($opener)) { throw "Pembuka tidak unik: $id" }
        $byOpener[$opener] = $id
    }
    return @{ byThread=$byThread; byOpener=$byOpener }
}

function Save-State($state) {
    $state.updatedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    $temporary = "$StatePath.new"
    [IO.File]::WriteAllText($temporary, ($state | ConvertTo-Json -Depth 40), [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $StatePath) {
        $backup = "$StatePath.backup.$([Guid]::NewGuid().ToString('N'))"
        [IO.File]::Replace([IO.Path]::GetFullPath($temporary), [IO.Path]::GetFullPath($StatePath), [IO.Path]::GetFullPath($backup))
        Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    } else { [IO.File]::Move($temporary, $StatePath) }
}

function Number([object]$value, [string]$metric) {
    $out = 0.0
    $raw = [Convert]::ToString($value, [Globalization.CultureInfo]::InvariantCulture)
    if (-not [double]::TryParse($raw, [Globalization.NumberStyles]::Any,
            [Globalization.CultureInfo]::InvariantCulture, [ref]$out) -or $out -lt 0) {
        throw "Metrik $metric kosong atau tidak valid."
    }
    return $out
}

function Get-Insights([string]$postId, $headers) {
    # Repliz Content API fetches Threads statistics from the connected platform.
    $url = "$replizBase/content/$([Uri]::EscapeDataString($postId))/statistic?accountId=$threadsId"
    $response = Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 30
    $values = @{}
    foreach ($metric in @('views','like','replies','repost','quotes','share')) {
        $property = $response.PSObject.Properties[$metric]
        if ($null -eq $property -or $null -eq $property.Value) { throw "Metrik $metric tidak tersedia untuk $postId." }
        $values[$metric] = Number $property.Value $metric
    }
    $interactions = $values.like + $values.replies + $values.repost + $values.quotes + $values.share
    $rate = $null
    if ($values.views -gt 0) { $rate = $interactions / $values.views }
    return [ordered]@{
        views=[int64]$values.views; likes=[int64]$values.like; replies=[int64]$values.replies
        reposts=[int64]$values.repost; quotes=[int64]$values.quotes; shares=[int64]$values.share
        interactions=[int64]$interactions; rate=$rate
    }
}

function Median([double[]]$values) {
    if ($values.Count -eq 0) { return $null }
    $sorted = @($values | Sort-Object)
    $m = [int][Math]::Floor($sorted.Count/2)
    if (($sorted.Count % 2) -eq 1) { return [double]$sorted[$m] }
    return ([double]$sorted[$m-1]+[double]$sorted[$m])/2.0
}

function Percentile90([double[]]$values) {
    if ($values.Count -lt 10) { return $null }
    $sorted = @($values | Sort-Object)
    return [double]$sorted[[int][Math]::Ceiling($sorted.Count*0.9)-1]
}

function Get-HermesExecutable {
    $native = Join-Path $env:LOCALAPPDATA 'hermes\bin\hermes.exe'
    if (Test-Path -LiteralPath $native -PathType Leaf) { return $native }
    $command = Get-Command 'hermes.exe' -CommandType Application -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        throw 'Hermes native Windows belum ditemukan. Pasang Hermes Agent resmi untuk Windows, lalu jalankan ulang InstallIG. Jadwal Threads tidak berubah.'
    }
    return $command.Source
}

function Check-Hermes {
    $command = Get-HermesExecutable
    $version = (& $command --version | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $version) { throw 'Hermes native Windows belum siap; jalankan hermes doctor pada PowerShell.' }
    return $version
}

function Check-Assets([string]$folder) {
    Add-Type -AssemblyName System.Drawing
    $assets = @(Get-ChildItem -LiteralPath $folder -File -Recurse | Where-Object {
        $_.BaseName -match '^slide-0[1-7]$' -and $_.Extension.ToLowerInvariant() -in @('.png','.jpg','.jpeg')
    } | Sort-Object Name)
    if ($assets.Count -ne 7 -or @($assets.BaseName | Sort-Object -Unique).Count -ne 7) {
        throw 'Hermes wajib menghasilkan slide-01 sampai slide-07, masing-masing satu file.'
    }
    foreach ($file in $assets) {
        $image = [Drawing.Image]::FromFile($file.FullName)
        try { if ($image.Width -ne 1080 -or $image.Height -ne 1350) { throw "Dimensi salah: $($file.Name)" } }
        finally { $image.Dispose() }
    }
    return $assets
}

function Render-Selected([string]$id, $posts, $metric, $state) {
    if ($state.renders.ContainsKey($id)) {
        $old = $state.renders[$id]
        if ($old.status -eq 'completed' -or $old.status -eq 'started') { return }
        if ($old.status -eq 'failed' -and -not $RetryFailed) { return }
    }
    [IO.Directory]::CreateDirectory($OutputRoot) | Out-Null
    $folder = Join-Path $OutputRoot $id
    [IO.Directory]::CreateDirectory($folder) | Out-Null
    if (@(Get-ChildItem -LiteralPath $folder -File -Recurse | Where-Object { $_.Extension.ToLowerInvariant() -in @('.png','.jpg','.jpeg') }).Count -gt 0) {
        throw "Folder $id berisi aset sebelumnya. Periksa dan pindahkan sebelum retry."
    }
    $jobPath = Join-Path $folder 'render-job.json'
    $promptPath = Join-Path $folder 'hermes-prompt.txt'
    $responsePath = Join-Path $folder 'hermes-response.txt'
    $messages = @($posts | Sort-Object sequence | ForEach-Object { [string]$_.content })
    $job = [ordered]@{
        schema='umkm-800-hermes-instagram-render-v1'; thread_id=$id
        brand='UMKM Naik Kelas'; targetInstagramAccountId=$instagramId
        sourcePosts=$messages; metrics=$metric
        outputDirectory=$folder
        visualReference=(Join-Path $PackageFolder 'UMKM_visual_reference.png')
        publish=$false; slides=7; width=1080; height=1350
    }
    [IO.File]::WriteAllText($jobPath, ($job | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))
    $jobWindows = $jobPath
    $prompt = @"
Baca pekerjaan UMKM Naik Kelas di $jobWindows lalu render tujuh slide Instagram ke $($job.outputDirectory).
Tulis slide-01 sampai slide-07 sebagai PNG/JPEG 1080x1350 dan manifest.json.
Sumber terdiri dari 8-10 post; padatkan ke tujuh slide dengan menjaga masalah, contoh, diagnosis,
langkah praktis, dan satu CTA akhir. Jangan menambah angka, klaim hasil, harga, atau sumber baru.
Gunakan identitas UMKM Naik Kelas, merah marun/krem/emas, footer umkmnaikkelas.id.
Gambar visualReference hanya untuk palet/identitas; perbaiki keterbacaan dan hindari teks terpotong.
Render dengan alat file, kode, dan terminal lokal. Jangan panggil layanan pembuat gambar, TTS, atau riset web.
Jangan memakai logo, nama, akun, atau ajaran Ruang Kalyanamitra.
Jangan mengunggah, menjadwalkan, atau menerbitkan ke Instagram/Repliz.
Jika file belum lengkap, laporkan kegagalan. Jawaban akhir singkat.
"@
    [IO.File]::WriteAllText($promptPath, $prompt, [Text.UTF8Encoding]::new($false))
    $state.renders[$id] = [ordered]@{thread_id=$id;postId=[string]$metric.postId;status='started';startedAtUtc=[DateTimeOffset]::UtcNow.ToString('o');folder=$folder;automaticPublish=$false}
    Save-State $state
    try {
        $hermesExe = Get-HermesExecutable
        $answer = (& $hermesExe chat --oneshot --toolsets file,terminal,code_execution,vision --query-file $promptPath 2>&1 | Out-String)
        $exitCode = $LASTEXITCODE
        [IO.File]::WriteAllText($responsePath, $answer, [Text.UTF8Encoding]::new($false))
        if ($exitCode -ne 0) { throw "Hermes gagal dengan kode $exitCode." }
        $assets = @(Check-Assets $folder)
        $state.renders[$id] = [ordered]@{thread_id=$id;postId=[string]$metric.postId;status='completed';completedAtUtc=[DateTimeOffset]::UtcNow.ToString('o');folder=$folder;assets=@($assets | ForEach-Object {$_.FullName});automaticPublish=$false}
        Save-State $state
        Write-Host "Hermes selesai: $id, $($assets.Count) slide di $folder"
    } catch {
        $state.renders[$id] = [ordered]@{thread_id=$id;postId=[string]$metric.postId;status='failed';failedAtUtc=[DateTimeOffset]::UtcNow.ToString('o');folder=$folder;error=[string]$_.Exception.Message;automaticPublish=$false}
        Save-State $state
        throw
    }
}

if (-not (Test-Path -LiteralPath $PackageFolder -PathType Container)) { throw "Folder paket UMKM tidak ditemukan: $PackageFolder" }
if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) { throw "Bank 800 utas tidak ditemukan: $SourcePath" }
if (-not (Test-Path -LiteralPath (Join-Path $PackageFolder 'UMKM_visual_reference.png') -PathType Leaf)) { throw 'Referensi visual UMKM tidak ditemukan.' }
$hash = (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
$source = Get-Content -LiteralPath $SourcePath -Raw -Encoding UTF8 | ConvertFrom-Json
$index = Verify-Source $source

if ($Install) {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Write-Host 'Task UMKM 800 sudah terpasang; tidak ditimpa.'; exit 0
    }
    $hermesVersion = Check-Hermes
    $auth = Get-Headers
    $account = Invoke-RestMethod -Method Get -Uri "$replizBase/account/$threadsId" -Headers $auth.repliz -TimeoutSec 30
    if ((@([string]$account.id,[string]$account._id) -notcontains $threadsId) -or
        [string]$account.type -ne 'threads' -or
        ([string]$account.username).TrimStart('@').ToLowerInvariant() -ne $username -or $account.isConnected -ne $true) {
        throw 'Repliz Threads bukan @umkmnaikkelas.id.'
    }
    $exe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $action = New-ScheduledTaskAction -Execute $exe -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -PackageFolder "' + $PackageFolder + '"')
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 365)
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Minutes 55)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
    Write-Host "Pemantau UMKM terpasang setiap jam. Hermes native Windows: $hermesVersion"
    exit 0
}

$lockPath = "$StatePath.lock"
try { $lock = [IO.File]::Open($lockPath,'OpenOrCreate','ReadWrite','None') }
catch { Write-Host 'Siklus UMKM sebelumnya masih berjalan.'; exit 0 }
try {
    $state = [ordered]@{schema='umkm-800-threads-hermes-h1-v1';sourceSha256=$hash;updatedAtUtc=$null;publications=@{};metrics=@{};renders=@{};selectedDays=@{}}
    if (Test-Path -LiteralPath $StatePath -PathType Leaf) {
        $old = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ([string]$old.sourceSha256 -ne $hash) { throw 'Bank 800 utas berubah sejak pemantauan sebelumnya. Periksa perubahan sebelum melanjutkan.' }
        foreach ($p in $old.publications.PSObject.Properties) { $state.publications[$p.Name]=$p.Value }
        foreach ($p in $old.metrics.PSObject.Properties) { $state.metrics[$p.Name]=$p.Value }
        foreach ($p in $old.renders.PSObject.Properties) { $state.renders[$p.Name]=$p.Value }
        foreach ($p in $old.selectedDays.PSObject.Properties) { $state.selectedDays[$p.Name]=$p.Value }
    }
    $auth = Get-Headers
    $account = Invoke-RestMethod -Method Get -Uri "$replizBase/account/$threadsId" -Headers $auth.repliz -TimeoutSec 30
    if ((@([string]$account.id,[string]$account._id) -notcontains $threadsId) -or
        [string]$account.type -ne 'threads' -or
        ([string]$account.username).TrimStart('@').ToLowerInvariant() -ne $username -or $account.isConnected -ne $true) { throw 'Akun Repliz UMKM tidak cocok.' }
    $schedules = @(Get-Schedules $auth.repliz)
    $remoteById = @{}
    $remoteByOpener = @{}
    foreach ($row in $schedules) {
        $remoteId = Get-ScheduleId $row
        if (-not $remoteId) { continue }
        $remoteById[$remoteId] = $row
        $opener = [string]$row.description
        if (-not $index.byOpener.ContainsKey($opener)) { continue }
        if (-not $remoteByOpener.ContainsKey($opener)) { $remoteByOpener[$opener] = New-Object System.Collections.ArrayList }
        [void]$remoteByOpener[$opener].Add($row)
    }
    $now = [DateTimeOffset]::UtcNow
    $due = New-Object System.Collections.ArrayList
    foreach ($id in @($index.byThread.Keys | Sort-Object)) {
        if ($state.metrics.ContainsKey($id)) { continue }
        $posts = @($index.byThread[$id].ToArray() | Sort-Object sequence)
        $scheduled = [DateTimeOffset]::Parse([string]$posts[0].scheduled_at).ToUniversalTime()
        if ($scheduled -gt $now) { continue }
        $opener = [string]$posts[0].content
        if (-not $remoteByOpener.ContainsKey($opener)) { continue }
        $matches = @($remoteByOpener[$opener].ToArray())
        if ($matches.Count -ne 1) { throw "Schedule pembuka $id ambigu di Repliz; periksa duplikat." }
        $summary = $matches[0]
        $scheduleId = Get-ScheduleId $summary
        if ([string]$summary.status -ne 'success') { continue }
        $detail = Invoke-RestMethod -Method Get -Uri "$replizBase/schedule/$scheduleId" -Headers $auth.repliz -TimeoutSec 30
        if ([string]$detail.accountId -ne $threadsId -or [string]$detail.description -cne $opener) { throw "Identitas Threads $id tidak cocok." }
        if ([string]$detail.status -ne 'success' -or -not [string]$detail.postId) { continue }
        if (-not $state.publications.ContainsKey($id)) {
            $remoteReplies = @($detail.replies | ForEach-Object { [string]$_.description })
            $expectedReplies = @($posts | Select-Object -Skip 1 | ForEach-Object { [string]$_.content })
            if ($remoteReplies.Count -ne $expectedReplies.Count) { Write-Warning "Balasan $id belum cocok dengan bank final; dilewati."; continue }
            $same = $true
            for ($i=0; $i -lt $remoteReplies.Count; $i++) { if ($remoteReplies[$i] -cne $expectedReplies[$i]) { $same=$false; break } }
            if (-not $same) { Write-Warning "Isi $id berbeda dari bank final; dilewati."; continue }
            $state.publications[$id] = [ordered]@{thread_id=$id;scheduleId=$scheduleId;postId=[string]$detail.postId;firstObservedSuccessAtUtc=$now.ToString('o')}
            Save-State $state
        }
        $published = $state.publications[$id]
        if ([string]$published.scheduleId -ne $scheduleId -or [string]$published.postId -ne [string]$detail.postId) {
            throw "Identitas post Repliz berubah untuk $id."
        }
        if (($now-[DateTimeOffset]::Parse([string]$published.firstObservedSuccessAtUtc)).TotalHours -lt 24) { continue }
        try { $insights = Get-Insights ([string]$published.postId) $auth.repliz }
        catch { Write-Warning "Insights $id belum tersedia: $($_.Exception.Message)"; continue }
        $history = @($state.metrics.Values | Where-Object {
            $null -ne $_.rate -and [DateTimeOffset]::Parse([string]$_.sampledAtUtc) -ge $now.AddDays(-30)
        } | ForEach-Object { [double]$_.rate })
        $median = Median ([double[]]$history)
        $p90 = Percentile90 ([double[]]$history)
        $required = 0.02
        if ($null -ne $median) { $required=[Math]::Max(0.02,1.5*[double]$median) }
        $ratePass = $null -ne $insights.rate -and ([double]$insights.rate -ge $required -or ($null -ne $p90 -and [double]$insights.rate -ge [double]$p90))
        $qualified = $insights.interactions -ge 10 -and $ratePass
        $metric = [ordered]@{thread_id=$id;scheduleId=$scheduleId;postId=[string]$published.postId;sampledAtUtc=$now.ToString('o');views=$insights.views;likes=$insights.likes;replies=$insights.replies;reposts=$insights.reposts;quotes=$insights.quotes;shares=$insights.shares;interactions=$insights.interactions;rate=$insights.rate;median30d=$median;percentile90=$p90;requiredRate=$required;status='not-qualified'}
        if ($qualified) { $metric.status='qualified'; [void]$due.Add($metric) }
        $state.metrics[$id] = $metric
        Save-State $state
    }
    $todayWib = $now.ToOffset([TimeSpan]::FromHours(7)).ToString('yyyy-MM-dd')
    if ($due.Count -gt 0 -and -not $state.selectedDays.ContainsKey($todayWib)) {
        $winner = @($due.ToArray() | Sort-Object @{Expression={[double]$_.rate};Descending=$true},@{Expression={[int64]$_.interactions};Descending=$true},@{Expression={$_.thread_id};Descending=$false})[0]
        foreach ($candidate in @($due.ToArray())) {
            if ($candidate.thread_id -eq $winner.thread_id) { $candidate.status='selected' }
            else { $candidate.status='daily-limit' }
            $state.metrics[[string]$candidate.thread_id]=$candidate
        }
        $state.selectedDays[$todayWib] = [ordered]@{date_wib=$todayWib;thread_id=[string]$winner.thread_id;selectedAtUtc=$now.ToString('o')}
        Save-State $state
        [void](Check-Hermes)
        Render-Selected ([string]$winner.thread_id) @($index.byThread[[string]$winner.thread_id].ToArray()) $winner $state
    } elseif ($RetryFailed) {
        $failed = @($state.renders.Values | Where-Object {$_.status -eq 'failed'} | Sort-Object failedAtUtc | Select-Object -First 1)
        if ($failed.Count -eq 1) {
            $id=[string]$failed[0].thread_id
            [void](Check-Hermes)
            Render-Selected $id @($index.byThread[$id].ToArray()) $state.metrics[$id] $state
        }
    } else {
        if ($due.Count -gt 0) { foreach ($candidate in @($due.ToArray())) { $candidate.status='daily-limit'; $state.metrics[[string]$candidate.thread_id]=$candidate }; Save-State $state }
        Write-Host "Siklus selesai. UMKM 800: $($state.publications.Count) teramati terbit, $($state.metrics.Count) dievaluasi; render baru: 0."
    }
} finally {
    if ($null -ne $lock) { $lock.Dispose() }
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
}
