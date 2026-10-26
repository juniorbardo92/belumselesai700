# Kalyanamitra IG monitor, central UMKM Cloudflare credential edition 2026-09-23.
param([switch]$Install, [switch]$CheckCloudflareAuth, [switch]$SetR2Credentials)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$api = 'https://api.repliz.com/public'
$R2AccountId = '4e9350b4532477f1fb91ee27c5b40b49'
$R2Bucket = 'umkm-content-media'
$Utf8 = [System.Text.UTF8Encoding]::new($false)
$publicBase = 'https://media.umkmnaikkelas.id'
$threadAccount = '6a8d2c7862caae1e0405397a'
$igAccount = '6a8d2c6762caae1e04053962'
$payloadFile = Join-Path $PSScriptRoot 'Ruang_Kalyanamitra_Repliz_450_Utas_3150_Post_MANUAL_PUBLISH.json'
$threadJournal = Join-Path $PSScriptRoot 'Ruang_Kalyanamitra_450_upload_state.json'
$igJournal = Join-Path $PSScriptRoot 'Ruang_Kalyanamitra_450_ig_state.json'
$logoFile = Join-Path $PSScriptRoot 'Kalyanamitra_logo.png'
$authFolder = Join-Path $env:LOCALAPPDATA 'Kalyanamitra450'
$authFile = Join-Path $authFolder 'autopublish_credentials.xml'
$umkmTokenFile = Join-Path $env:LOCALAPPDATA 'UMKM800Importer\cloudflare.xml'
$umkmR2File = Join-Path $env:LOCALAPPDATA 'UMKMContentOS\r2-credential.json'
$taskName = 'Kalyanamitra IG Carousel Setelah Threads'

function Unsecure([Security.SecureString]$value) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function To-Hex([byte[]]$bytes) {
    return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Get-Sha256Hex([string]$value) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return To-Hex -bytes ($sha.ComputeHash($script:Utf8.GetBytes($value))) }
    finally { $sha.Dispose() }
}

function Get-FileSha256Hex([string]$path) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($path)
    try { return To-Hex -bytes ($sha.ComputeHash($stream)) }
    finally { $stream.Dispose(); $sha.Dispose() }
}

function Get-HmacSha256([byte[]]$key, [string]$data) {
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    try {
        $hmac.Key = $key
        [byte[]]$result = $hmac.ComputeHash($script:Utf8.GetBytes($data))
        return ,$result
    } finally { $hmac.Dispose() }
}

function Get-SigV4Signature([string]$secretKey, [string]$dateStamp, [string]$region, [string]$stringToSign) {
    [byte[]]$dateKey = Get-HmacSha256 -key ($script:Utf8.GetBytes("AWS4$secretKey")) -data $dateStamp
    [byte[]]$regionKey = Get-HmacSha256 -key $dateKey -data $region
    [byte[]]$serviceKey = Get-HmacSha256 -key $regionKey -data 's3'
    [byte[]]$signingKey = Get-HmacSha256 -key $serviceKey -data 'aws4_request'
    return To-Hex -bytes (Get-HmacSha256 -key $signingKey -data $stringToSign)
}

function Assert-SigV4Signer {
    # Vektor uji AWS yang dipublikasikan; bukan kredensial sungguhan.
    $emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    $canonicalHeaders = "host:examplebucket.s3.amazonaws.com`nrange:bytes=0-9`nx-amz-content-sha256:$emptyHash`nx-amz-date:20130524T000000Z`n"
    $canonical = "GET`n/test.txt`n`n$canonicalHeaders`nhost;range;x-amz-content-sha256;x-amz-date`n$emptyHash"
    $hash = Get-Sha256Hex -value $canonical
    if ($hash -cne '7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972') {
        throw 'Uji lokal format penandatanganan R2 gagal; tidak ada unggahan.'
    }
    $stringToSign = "AWS4-HMAC-SHA256`n20130524T000000Z`n20130524/us-east-1/s3/aws4_request`n$hash"
    $signature = Get-SigV4Signature -secretKey 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' -dateStamp '20130524' -region 'us-east-1' -stringToSign $stringToSign
    if ($signature -cne 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41') {
        throw 'Uji lokal tanda tangan R2 gagal; tidak ada unggahan.'
    }
}

function Test-CentralR2S3([string]$accessKeyId, [string]$secretAccessKey) {
    Assert-SigV4Signer
    $hostName = "${script:R2AccountId}.r2.cloudflarestorage.com"
    $uri = "https://$hostName/${script:R2Bucket}?list-type=2&max-keys=1"
    $emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    $now = [DateTime]::UtcNow
    $amzDate = $now.ToString("yyyyMMdd'T'HHmmss'Z'")
    $dateStamp = $now.ToString('yyyyMMdd')
    $scope = "$dateStamp/auto/s3/aws4_request"
    $signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
    $canonicalHeaders = "host:$hostName`nx-amz-content-sha256:$emptyHash`nx-amz-date:$amzDate`n"
    $canonical = "GET`n/${script:R2Bucket}`nlist-type=2&max-keys=1`n$canonicalHeaders`n$signedHeaders`n$emptyHash"
    $stringToSign = "AWS4-HMAC-SHA256`n$amzDate`n$scope`n$(Get-Sha256Hex -value $canonical)"
    $signature = Get-SigV4Signature -secretKey $secretAccessKey -dateStamp $dateStamp -region 'auto' -stringToSign $stringToSign
    $headers = @{
        Authorization = "AWS4-HMAC-SHA256 Credential=$accessKeyId/$scope, SignedHeaders=$signedHeaders, Signature=$signature"
        'x-amz-content-sha256' = $emptyHash
        'x-amz-date' = $amzDate
    }
    $response = Invoke-WebRequest -UseBasicParsing -Method Get -Uri $uri -Headers $headers -TimeoutSec 30
    if ([int]$response.StatusCode -ne 200) { throw 'S3 R2 menolak pemeriksaan akses.' }
}

function Get-CentralCloudflareAuth {
    $failures = New-Object System.Collections.ArrayList
    if (Test-Path -LiteralPath $umkmTokenFile -PathType Leaf) {
        try {
            $tokenSecure = (Import-Clixml -LiteralPath $umkmTokenFile).cloudflare
            if ($null -eq $tokenSecure -or $tokenSecure -isnot [Security.SecureString]) { throw 'Format cloudflare.xml tidak dikenali.' }
            $token = Unsecure $tokenSecure
            if ([string]::IsNullOrWhiteSpace($token)) { throw 'Token kosong.' }
            $headers = @{Authorization=('Bearer ' + $token)}
            $token = $null
            $base = "https://api.cloudflare.com/client/v4/accounts/$R2AccountId/r2/buckets/$R2Bucket/objects"
            $list = Invoke-RestMethod -Method Get -Uri "${base}?per_page=1&prefix=kalyanamitra%2Fauto-carousel%2F" -Headers $headers -TimeoutSec 30
            if ($list.success -ne $true) { throw 'Cloudflare tidak mengonfirmasi akses REST.' }
            return [pscustomobject]@{ Mode='REST'; Source=$umkmTokenFile; Headers=$headers; Base=$base }
        } catch {
            [void]$failures.Add('Token UMKM800Importer tidak dapat mengakses R2 REST (bisa token khusus S3 atau izin tidak cukup).')
        }
    } else { [void]$failures.Add('Token UMKM800Importer belum tersimpan.') }

    if (Test-Path -LiteralPath $umkmR2File -PathType Leaf) {
        try {
            $saved = Get-Content -LiteralPath $umkmR2File -Raw -Encoding UTF8 | ConvertFrom-Json
            if ([string]$saved.schema -cne 'umkm-content-os-r2-credential-v1') { throw 'Skema kredensial UMKM Content OS tidak dikenali.' }
            $access = Unsecure (ConvertTo-SecureString -String ([string]$saved.protected_access_key_id))
            $secret = Unsecure (ConvertTo-SecureString -String ([string]$saved.protected_secret_access))
            if ($access -cnotmatch '^[0-9a-fA-F]{32}$' -or $secret -cnotmatch '^[0-9a-fA-F]{64}$') { throw 'Format pasangan S3 tidak cocok.' }
            Test-CentralR2S3 -accessKeyId $access -secretAccessKey $secret
            return [pscustomobject]@{ Mode='S3'; Source=$umkmR2File; Access=$access; Secret=$secret }
        } catch {
            [void]$failures.Add('Pasangan R2 UMKMContentOS tidak lolos pemeriksaan akses S3.')
        }
    } else { [void]$failures.Add('Pasangan R2 UMKMContentOS belum tersimpan.') }
    throw "Kredensial Cloudflare satu pintu belum dapat dipakai. $($failures -join ' ') Tidak ada unggahan atau jadwal IG yang dibuat."
}

function Send-JpegToR2([string]$path, [string]$objectKey, $auth) {
    if ($auth.Mode -eq 'REST') {
        try {
            $result = Invoke-RestMethod -Method Put -Uri "$($auth.Base)/$objectKey" -Headers $auth.Headers -InFile $path -ContentType 'image/jpeg' -TimeoutSec 60
        } catch {
            throw "Token Cloudflare pusat dapat membaca R2 REST tetapi unggah JPEG ditolak. Periksa izin tulis REST token di UMKM Content OS. Belum ada jadwal IG dibuat. Detail: $($_.Exception.Message)"
        }
        if ($result.success -ne $true -or [string]$result.result.key -cne $objectKey) { throw "R2 REST tidak mengonfirmasi unggahan $objectKey." }
        return
    }
    $accessKeyId = [string]$auth.Access
    $secretAccessKey = [string]$auth.Secret
    $r2HostName = "${script:R2AccountId}.r2.cloudflarestorage.com"
    $segments = @(("${script:R2Bucket}/$objectKey" -split '/') | Where-Object { $_ -ne '' })
    $canonicalUri = '/' + (($segments | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/')
    $requestUri = "https://$r2HostName$canonicalUri"
    $payloadHash = Get-FileSha256Hex -path $path
    $now = [DateTime]::UtcNow
    $amzDate = $now.ToString("yyyyMMdd'T'HHmmss'Z'")
    $dateStamp = $now.ToString('yyyyMMdd')
    $signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'
    $canonicalHeaders = "content-type:image/jpeg`nhost:$r2HostName`nx-amz-content-sha256:$payloadHash`nx-amz-date:$amzDate`n"
    $canonical = "PUT`n$canonicalUri`n`n$canonicalHeaders`n$signedHeaders`n$payloadHash"
    $canonicalHash = Get-Sha256Hex -value $canonical
    $scope = "$dateStamp/auto/s3/aws4_request"
    $stringToSign = "AWS4-HMAC-SHA256`n$amzDate`n$scope`n$canonicalHash"
    $signature = Get-SigV4Signature -secretKey $secretAccessKey -dateStamp $dateStamp -region 'auto' -stringToSign $stringToSign
    $headers = @{
        Authorization = "AWS4-HMAC-SHA256 Credential=$accessKeyId/$scope, SignedHeaders=$signedHeaders, Signature=$signature"
        'x-amz-content-sha256' = $payloadHash
        'x-amz-date' = $amzDate
    }
    $response = Invoke-WebRequest -UseBasicParsing -Method Put -Uri $requestUri -Headers $headers -ContentType 'image/jpeg' -InFile $path -TimeoutSec 60
    if ([int]$response.StatusCode -ne 200) { throw "R2 tidak menerima $objectKey. HTTP $($response.StatusCode)." }
}

function Save-IgState {
    $newFile = "$igJournal.new"
    $value = [ordered]@{
        updatedAtUtc = [DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        payloadSha256 = $masterHash
        entries = @($script:igResults.Values | Sort-Object editorial_id)
    } | ConvertTo-Json -Depth 25
    [IO.File]::WriteAllText($newFile, $value, [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $igJournal) {
        $backup = "$igJournal.backup.$([Guid]::NewGuid().ToString('N'))"
        [IO.File]::Replace([IO.Path]::GetFullPath($newFile), [IO.Path]::GetFullPath($igJournal), [IO.Path]::GetFullPath($backup))
        if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue }
    } else { [IO.File]::Move($newFile, $igJournal) }
}

function Render-Carousel($item, [string]$folder) {
    Add-Type -AssemblyName System.Drawing
    [IO.Directory]::CreateDirectory($folder) | Out-Null
    $messages = @([string]$item.body.description) + @($item.body.replies | ForEach-Object { [string]$_.description })
    if ($messages.Count -ne 7) { throw 'Carousel harus memuat tujuh teks utas asli.' }
    $paths = New-Object System.Collections.ArrayList
    for ($index=0; $index -lt 7; $index++) {
        $path = Join-Path $folder ('slide-{0:D2}.jpg' -f ($index+1))
        $bitmap = [Drawing.Bitmap]::new(1080,1350)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        $light = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(255,251,246,235))
        $gold = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(255,234,199,120))
        $muted = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(255,190,206,211))
        $back = [Drawing.Drawing2D.LinearGradientBrush]::new(
            [Drawing.Point]::new(0,0), [Drawing.Point]::new(1080,1350),
            [Drawing.Color]::FromArgb(255,16,42,68), [Drawing.Color]::FromArgb(255,52,36,59))
        try {
            $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
            $graphics.FillRectangle($back, 0, 0, 1080, 1350)
            $graphics.FillRectangle($gold, 70, 216, 940, 4)
            $graphics.FillRectangle($gold, 70, 1230, 940, 3)
            if (Test-Path -LiteralPath $logoFile -PathType Leaf) {
                $logo = [Drawing.Image]::FromFile($logoFile)
                $clip = [Drawing.Drawing2D.GraphicsPath]::new()
                $oldClip = $graphics.Clip.Clone()
                try {
                    $clip.AddEllipse(72,55,126,126)
                    $graphics.SetClip($clip)
                    $graphics.DrawImage($logo, [Drawing.Rectangle]::new(72,55,126,126))
                    $graphics.SetClip($oldClip, [Drawing.Drawing2D.CombineMode]::Replace)
                } finally { $oldClip.Dispose(); $clip.Dispose(); $logo.Dispose() }
            }
            $brandFont = [Drawing.Font]::new('Segoe UI', 32, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
            $smallFont = [Drawing.Font]::new('Segoe UI', 29, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
            $labelFont = [Drawing.Font]::new('Segoe UI', 30, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
            try {
                $graphics.DrawString('RUANG KALYANAMITRA', $brandFont, $gold, 225, 67)
                $graphics.DrawString([string]$item.body.title, $smallFont, $muted,
                    [Drawing.RectangleF]::new(225,118,770,88))
                $graphics.DrawString(('POST {0}/7' -f ($index+1)), $labelFont, $gold, 77, 258)
                $font = $null
                for ($size=56; $size -ge 35; $size-=2) {
                    $test = [Drawing.Font]::new('Segoe UI', $size, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
                    $measure = $graphics.MeasureString($messages[$index], $test, [Drawing.SizeF]::new(900,850))
                    if ($measure.Height -le 850) { $font=$test; break }
                    $test.Dispose()
                }
                if ($null -eq $font) { throw "Teks $($item.editorial_id) slide $($index+1) tidak muat; IG tidak dikirim." }
                try {
                    $graphics.DrawString($messages[$index], $font, $light,
                        [Drawing.RectangleF]::new(80,340,920,850))
                } finally { $font.Dispose() }
                $graphics.DrawString('@ruangkalyanamitra', $smallFont, $muted, 75, 1250)
                $bitmap.Save($path, [Drawing.Imaging.ImageFormat]::Jpeg)
                if ((Get-Item -LiteralPath $path).Length -gt 8000000) { throw "Slide IG melewati 8 MB: $path" }
                [void]$paths.Add($path)
            } finally { $brandFont.Dispose(); $smallFont.Dispose(); $labelFont.Dispose() }
        } finally { $back.Dispose(); $gold.Dispose(); $muted.Dispose(); $light.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
    }
    return $paths.ToArray()
}

function Get-InstagramSchedules {
    $all = New-Object System.Collections.ArrayList
    for ($page=1; $page -le 1000; $page++) {
        $uri = "$api/schedule?page=$page&limit=100&accountIds%5B%5D=$igAccount"
        $r = Invoke-RestMethod -Method Get -Uri $uri -Headers $replizHeaders
        if ($null -eq $r.docs -or $null -eq $r.hasNextPage) { throw 'Daftar IG Repliz tidak lengkap; hentikan agar tidak membuat duplikat.' }
        foreach ($s in @($r.docs)) { if ([string]$s.accountId -eq $igAccount) { [void]$all.Add($s) } }
        if ($r.hasNextPage -eq $false) { return $all.ToArray() }
    }
    throw 'Batas halaman IG Repliz tercapai.'
}

if ($CheckCloudflareAuth -or $SetR2Credentials) {
    $auth = Get-CentralCloudflareAuth
    Write-Host "Akses baca Cloudflare berhasil; jalur $($auth.Mode); sumber: $($auth.Source). Pemeriksaan ini tidak mengunggah atau menjadwalkan IG."
    exit 0
}

if ($Install) {
    if (-not (Test-Path -LiteralPath $payloadFile -PathType Leaf)) { throw 'Payload 450 utas tidak ada di samping skrip.' }
    $auth = Get-CentralCloudflareAuth
    if (-not (Test-Path -LiteralPath $authFile -PathType Leaf)) {
        $access = Read-Host 'Repliz Access Key'
        $secret = Read-Host 'Repliz Secret Key' -AsSecureString
        if ([string]::IsNullOrWhiteSpace($access) -or $secret.Length -eq 0) { throw 'Kredensial Repliz tidak lengkap.' }
        [IO.Directory]::CreateDirectory($authFolder) | Out-Null
        [pscustomobject]@{
            access = ConvertTo-SecureString $access -AsPlainText -Force
            secret = $secret
        } | Export-Clixml -LiteralPath $authFile -Force
    }
    $exe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $action = New-ScheduledTaskAction -Execute $exe -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"')
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 120)
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Minutes 9)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
    Write-Host 'Pemantau IG terpasang untuk berjalan setiap 10 menit ketika akun Windows ini masuk dan komputer hidup.'
    Write-Host "Kredensial Repliz tersimpan terenkripsi; Cloudflare dibaca dari $($auth.Source)."
    exit 0
}

if (-not (Test-Path -LiteralPath $authFile -PathType Leaf)) { throw 'Jalankan skrip ini sekali dengan -Install untuk menyiapkan IG.' }
if (-not (Test-Path -LiteralPath $threadJournal -PathType Leaf)) { Write-Host 'Belum ada jurnal unggahan Threads.'; exit 0 }
$lockPath = "$igJournal.lock"
try { $lock = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None') }
catch { Write-Host 'Proses IG sebelumnya masih berjalan.'; exit 0 }

try {
    $masterHash = (Get-FileHash -LiteralPath $payloadFile -Algorithm SHA256).Hash.ToLowerInvariant()
    $master = Get-Content -LiteralPath $payloadFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $threadState = Get-Content -LiteralPath $threadJournal -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([string]$threadState.payloadSha256 -ne $masterHash) { throw 'Jurnal Threads dan payload berbeda. IG dihentikan.' }
    $script:igResults = @{}
    if (Test-Path -LiteralPath $igJournal -PathType Leaf) {
        $igState = Get-Content -LiteralPath $igJournal -Raw -Encoding UTF8 | ConvertFrom-Json
        if ([string]$igState.payloadSha256 -ne $masterHash) { throw 'Jurnal IG dan payload berbeda.' }
        foreach ($record in @($igState.entries)) { $script:igResults[[string]$record.editorial_id]=$record }
    }
    $credentials = Import-Clixml -LiteralPath $authFile
    $access = Unsecure $credentials.access
    $secret = Unsecure $credentials.secret
    $cloudflareAuth = Get-CentralCloudflareAuth
    $replizHeaders = @{ Authorization=('Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($access+':'+$secret))) }
    $access=$null; $secret=$null
    $igAccountInfo = Invoke-RestMethod -Method Get -Uri "$api/account/$igAccount" -Headers $replizHeaders
    if ((@($igAccountInfo.id,$igAccountInfo._id) -notcontains $igAccount) -or
        $igAccountInfo.type -ne 'instagram' -or
        ([string]$igAccountInfo.username).TrimStart('@').ToLowerInvariant() -ne 'ruangkalyanamitra' -or
        $igAccountInfo.isConnected -ne $true) { throw 'Akun IG @ruangkalyanamitra tidak cocok atau tidak tersambung.' }

    $existingIG = @(Get-InstagramSchedules)
    $byCaption = @{}
    foreach ($s in $existingIG) {
        $caption = [string]$s.description
        if ($s.type -eq 'album' -and $caption -and -not $byCaption.ContainsKey($caption)) { $byCaption[$caption] = $s }
    }
    $itemById = @{}
    foreach ($item in @($master.items)) { $itemById[[string]$item.editorial_id] = $item }
    $done = 0
    foreach ($record in @($threadState.entries | Sort-Object editorial_id)) {
        $id = [string]$record.editorial_id
        if (-not $itemById.ContainsKey($id)) { throw "Jurnal memuat ID tidak dikenal: $id" }
        if ([DateTimeOffset]::Parse([string]$record.scheduleAt).ToUniversalTime() -gt [DateTimeOffset]::UtcNow.AddMinutes(1)) { continue }
        $item = $itemById[$id]
        $caption = [string]$item.body.description
        if ($byCaption.ContainsKey($caption)) {
            $found = $byCaption[$caption]
            $foundId = if ($found.id) { [string]$found.id } else { [string]$found._id }
            $script:igResults[$id] = @{ editorial_id=$id; scheduleId=$foundId; status=[string]$found.status; threadPostId=[string]$record.postId }
            Save-IgState
            continue
        }
        if ($script:igResults.ContainsKey($id)) {
            $check = Invoke-RestMethod -Method Get -Uri "$api/schedule/$($script:igResults[$id].scheduleId)" -Headers $replizHeaders
            if ([string]$check.accountId -ne $igAccount -or [string]$check.description -cne $caption -or $check.type -ne 'album') {
                throw "Jurnal carousel $id tidak sesuai Repliz. Hentikan agar tidak menduplikasi."
            }
            continue
        }
        $thread = Invoke-RestMethod -Method Get -Uri "$api/schedule/$($record.scheduleId)" -Headers $replizHeaders
        if ([string]$thread.accountId -ne $threadAccount -or [string]$thread.description -cne $caption) {
            throw "Identitas Threads $id tidak sesuai." 
        }
        if ($thread.status -eq 'error') { Write-Warning "Threads $id error; IG tidak diterbitkan."; continue }
        if ($thread.status -ne 'success' -or [string]::IsNullOrWhiteSpace([string]$thread.postId)) { continue }

        $medias = New-Object System.Collections.ArrayList
        $originalWebp = [string]$thread.postId -eq '18101153378200576'
        if ($originalWebp) {
            try {
                for ($i=1; $i -le 7; $i++) {
                    $url = "$publicBase/kalyanamitra/threads-18101153378200576/ig/slide-$('{0:D2}' -f $i).webp"
                    $head = Invoke-WebRequest -UseBasicParsing -Method Head -Uri $url -TimeoutSec 15
                    if ($head.StatusCode -ne 200 -or -not ([string]$head.Headers['Content-Type']).StartsWith('image/webp')) { throw 'WebP lama tidak tersedia.' }
                    [void]$medias.Add(@{ alt="Ruang Kalyanamitra slide $i"; type='image'; thumbnail=$url; url=$url })
                }
            } catch { $medias.Clear() }
        }
        if ($medias.Count -ne 7) {
            $imageFolder = Join-Path (Join-Path $PSScriptRoot 'carousel_cache') $id
            $files = @(Render-Carousel $item $imageFolder)
            if ($files.Count -ne 7) { throw "Gagal merender tujuh slide untuk $id." }
            for ($i=1; $i -le 7; $i++) {
                $name = 'slide-{0:D2}.jpg' -f $i
                $key = "kalyanamitra/auto-carousel/$id/$name"
                Send-JpegToR2 -path $files[$i-1] -objectKey $key -auth $cloudflareAuth
                $url = "$publicBase/$key"
                $head = Invoke-WebRequest -UseBasicParsing -Method Head -Uri $url -TimeoutSec 15
                if ($head.StatusCode -ne 200 -or -not ([string]$head.Headers['Content-Type']).StartsWith('image/jpeg')) { throw "Media IG tidak dapat diakses: $id/$name" }
                [void]$medias.Add(@{ alt="Ruang Kalyanamitra slide $i"; type='image'; thumbnail=$url; url=$url })
            }
        }

        # Periksa lagi setelah mengunggah gambar: rerun/pengirim lain bisa membuat album bersamaan.
        $checkAgain = @(Get-InstagramSchedules | Where-Object { $_.type -eq 'album' -and [string]$_.description -ceq $caption })
        if ($checkAgain.Count -gt 0) { Write-Host "Carousel $id sudah ada. Tidak dikirim ulang."; continue }
        $album = @{
            title=[string]$item.body.title; description=$caption; type='album'
            medias=@($medias.ToArray()); additionalInfo=@{ isDraft=$false }; replies=@()
            accountId=$igAccount
            scheduleAt=[DateTimeOffset]::UtcNow.AddMinutes(5).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        }
        $body = $album | ConvertTo-Json -Depth 30 -Compress
        try {
            $created = Invoke-RestMethod -Method Post -Uri "$api/schedule" -Headers $replizHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
        } catch { throw "Hasil POST IG $id tidak pasti; jangan jalankan pengirim lain. Siklus berikutnya memeriksa IG. Detail: $($_.Exception.Message)" }
        if (-not $created.scheduleId) { throw "Respons IG $id tanpa scheduleId. Siklus berikutnya memeriksa IG." }
        $script:igResults[$id] = @{
            editorial_id=$id; scheduleId=[string]$created.scheduleId
            status='accepted'; threadPostId=[string]$thread.postId
        }
        Save-IgState
        $done++
        Write-Host "IG $id diterima Repliz; scheduleId $($created.scheduleId)."
    }
    Write-Host "Siklus IG selesai; carousel baru: $done."
} finally {
    $lock.Dispose()
    try { Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue } catch {}
}
