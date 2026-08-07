# One-command phone install: builds the app, opens the USB tunnel, and serves it.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\install-to-phone.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# Find adb: on PATH, or in common install spots
$adb = $null
try { $adb = (Get-Command adb -ErrorAction Stop).Source } catch {}
if (-not $adb) {
  foreach ($p in @("C:\platform-tools\adb.exe", "$env:USERPROFILE\platform-tools\adb.exe", "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe")) {
    if (Test-Path $p) { $adb = $p; break }
  }
}
if (-not $adb) {
  Write-Host "adb not found. Download Platform-Tools from:" -ForegroundColor Yellow
  Write-Host "  https://developer.android.com/tools/releases/platform-tools"
  Write-Host "and extract it to C:\platform-tools, then run this again."
  exit 1
}

Write-Host "Building the app..." -ForegroundColor Cyan
Set-Location $root
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

Write-Host "Checking for the phone (plug it in via USB, unlock it, and accept the debugging prompt)..." -ForegroundColor Cyan
$devices = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" }
if (-not $devices) {
  Write-Host "No phone detected. Make sure USB debugging is on and the phone is unlocked, then run this again." -ForegroundColor Yellow
  exit 1
}

& $adb reverse tcp:4173 tcp:4173
Write-Host ""
Write-Host "Tunnel open. Now on the phone:" -ForegroundColor Green
Write-Host "  1. Open Chrome and go to  http://localhost:4173"
Write-Host "  2. Tap the three-dot menu -> 'Add to Home screen' / 'Install app'"
Write-Host ""
Write-Host "Serving the app now — leave this window open until the install finishes, then press Ctrl+C." -ForegroundColor Cyan
npm run preview
