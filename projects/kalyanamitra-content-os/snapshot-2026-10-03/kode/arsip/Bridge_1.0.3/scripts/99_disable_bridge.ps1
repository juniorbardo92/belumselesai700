$ErrorActionPreference = "Stop"

openclaw.cmd plugins disable kalyanamitra-content-os
openclaw.cmd config validate
openclaw.cmd gateway restart
Start-Sleep -Seconds 5
openclaw.cmd channels status --channel telegram --probe --json

Write-Host "`nBridge Kalyanamitra dinonaktifkan. Plugin UMKM dan registry tidak diubah." -ForegroundColor Green
