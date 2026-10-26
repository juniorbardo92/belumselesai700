param(
    [ValidateSet('Status','Validate','CheckMediaAuth','Media','Preview','Import','InstallIG','RunIG')]
    [string]$Action = 'Status',
    [string]$PackageFolder = '',
    [string]$StartDate = '',
    [string]$EndDate = '',
    [switch]$RenewCloudflareToken,
    [int]$Limit = 0
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$payloadName = 'UMKM_Repliz_Manual_800_Utas_7200_Post.json'
$candidates = @()
if (-not [string]::IsNullOrWhiteSpace($PackageFolder)) {
    $candidates = @($PackageFolder)
} else {
    $candidates = @($PSScriptRoot,(Join-Path $PSScriptRoot 'UMKM800_Manual'))
}
$folder = $null
foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $candidate $payloadName) -PathType Leaf) {
        $folder = (Resolve-Path -LiteralPath $candidate).Path
        break
    }
}
if (-not $folder) {
    throw "Paket UMKM 800 tidak ditemukan di samping launcher. Ekstrak seluruh ZIP ke folder UMKM800_Manual, atau isi -PackageFolder dengan path lengkap."
}
$media = Join-Path $folder 'Upload-UMKM800-Media.ps1'
$importer = Join-Path $folder 'Import-UMKM800-Repliz.ps1'
$monitor = Join-Path $folder 'Monitor-UMKM800-ThreadsToHermes.ps1'
foreach ($file in @($media,$importer,$monitor)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Komponen UMKM tidak ditemukan: $file" }
}
$exe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "Windows PowerShell tidak ditemukan: $exe" }

function Invoke-Component([string]$file,[string[]]$arguments) {
    & $exe -NoProfile -ExecutionPolicy Bypass -File $file @arguments
    if ($LASTEXITCODE -ne 0) { throw "Langkah UMKM berhenti pada $(Split-Path -Leaf $file); exit code: $LASTEXITCODE" }
}
function Get-DateRange {
    if ([string]::IsNullOrWhiteSpace($StartDate)) { throw "Untuk $Action, isi -StartDate. Satu tanggal berlaku untuk satu batch harian." }
    $end = $EndDate
    if ([string]::IsNullOrWhiteSpace($end)) { $end = $StartDate }
    foreach ($value in @($StartDate,$end)) {
        $parsed=[DateTime]::MinValue
        if (-not [DateTime]::TryParseExact($value,'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None,[ref]$parsed)) {
            throw "Tanggal harus YYYY-MM-DD: $value"
        }
    }
    if ($StartDate -gt $end -or $StartDate -lt '2026-10-13' -or $end -gt '2026-12-31') {
        throw 'Rentang tanggal harus berada antara 2026-10-13 dan 2026-12-31.'
    }
    return @('-StartDate',$StartDate,'-EndDate',$end)
}

Write-Host "UMKM Content OS: $Action; folder: $folder"
switch ($Action) {
    'Status' {
        $mapPath = Join-Path $folder 'UMKM_160_Media_URLs.json'
        if (-not (Test-Path -LiteralPath $mapPath -PathType Leaf)) { throw "Peta media tidak ditemukan: $mapPath" }
        $map = Get-Content -LiteralPath $mapPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $values = @($map.PSObject.Properties | ForEach-Object { [string]$_.Value })
        if ($values.Count -ne 160) { throw "Peta media tidak tepat 160 visual: $($values.Count)" }
        $filled = @($values | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count
        Write-Host "Media: $filled/160 URL terisi; $($values.Count-$filled) belum terisi."
        $journal = Join-Path $folder 'UMKM_800_upload_state.json'
        if (Test-Path -LiteralPath $journal -PathType Leaf) {
            $state = Get-Content -LiteralPath $journal -Raw -Encoding UTF8 | ConvertFrom-Json
            if ([string]$state.accountId -ne '6a8e2fc362caae1e04063419') { throw 'Akun jurnal bukan Threads UMKM.' }
            $count = @($state.entries.PSObject.Properties).Count
            Write-Host "Jurnal impor UMKM lokal: $count utas. Cek remote dengan Preview untuk status sebenarnya."
        } else { Write-Host 'Jurnal impor UMKM lokal belum ada.' }
        $cf = Join-Path $env:LOCALAPPDATA 'UMKM800Importer\cloudflare.xml'
        Write-Host "Token media UMKM tersimpan: $(Test-Path -LiteralPath $cf -PathType Leaf)."
        $task = Get-ScheduledTask -TaskName 'UMKM 800 H+1 Threads ke Hermes' -ErrorAction SilentlyContinue
        Write-Host "Task IG Hermes UMKM terpasang: $([bool]$task)."
        Write-Host 'Status ini lokal dan read-only; tidak memeriksa Repliz atau Cloudflare.'
    }
    'Validate' {
        Invoke-Component $importer @('-Mode','Validate')
        Invoke-Component $media @('-Mode','Validate','-PackageFolder',$folder)
    }
    'CheckMediaAuth' {
        $componentArgs = @('-Mode','CheckAuth','-PackageFolder',$folder)
        if ($RenewCloudflareToken) { $componentArgs += '-RenewCloudflareToken' }
        Invoke-Component $media $componentArgs
    }
    'Media' {
        if ($Limit -lt 0) { throw '-Limit tidak boleh negatif.' }
        $componentArgs = @('-Mode','Upload','-PackageFolder',$folder)
        if ($RenewCloudflareToken) { $componentArgs += '-RenewCloudflareToken' }
        if ($Limit -gt 0) { $componentArgs += @('-Limit',[string]$Limit) }
        Invoke-Component $media $componentArgs
    }
    'Preview' {
        $dates = @(Get-DateRange)
        Invoke-Component $importer (@('-Mode','DryRun') + $dates)
    }
    'Import' {
        $dates = @(Get-DateRange)
        Invoke-Component $importer (@('-Mode','Upload') + $dates)
    }
    'InstallIG' {
        $task = Get-ScheduledTask -TaskName 'UMKM 800 H+1 Threads ke Hermes' -ErrorAction SilentlyContinue
        if ($task) { Write-Host 'Task UMKM IG Hermes sudah ada; instalasi dilewati agar tidak menimpa task yang berjalan.' }
        else { Invoke-Component $monitor @('-Install') }
    }
    'RunIG' { Invoke-Component $monitor @() }
}
