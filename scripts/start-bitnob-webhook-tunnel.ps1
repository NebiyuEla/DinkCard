param(
  [int]$Port = 3001
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$logPath = Join-Path $root "cloudflared-bitnob.log"
$errPath = Join-Path $root "cloudflared-bitnob.err.log"
$envPath = Join-Path $root ".env"

Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    Stop-Process -Id $_.Id -Force -ErrorAction Stop
  } catch {
    Write-Host "Could not stop existing cloudflared process $($_.Id); starting a fresh tunnel anyway."
  }
}
if (Test-Path -LiteralPath $logPath) { Remove-Item -LiteralPath $logPath -Force }
if (Test-Path -LiteralPath $errPath) { Remove-Item -LiteralPath $errPath -Force }

$process = Start-Process -FilePath "cloudflared.exe" `
  -ArgumentList @("tunnel", "--url", "http://127.0.0.1:$Port") `
  -WorkingDirectory $root `
  -RedirectStandardOutput $logPath `
  -RedirectStandardError $errPath `
  -PassThru

$publicUrl = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  $logText = ""
  if (Test-Path -LiteralPath $logPath) { $logText += Get-Content -LiteralPath $logPath -Raw }
  if (Test-Path -LiteralPath $errPath) { $logText += Get-Content -LiteralPath $errPath -Raw }
  $match = [regex]::Match($logText, "https://[a-z0-9-]+\.trycloudflare\.com")
  if ($match.Success) {
    $publicUrl = $match.Value
    break
  }
}

if (-not $publicUrl) {
  throw "Cloudflared started as process $($process.Id), but no public URL was found. Check cloudflared-bitnob.err.log."
}

$webhookUrl = "$publicUrl/api/webhooks/bitnob"
$envText = Get-Content -LiteralPath $envPath -Raw
if ($envText -match "(?m)^BITNOB_WEBHOOK_URL=") {
  $envText = $envText -replace "(?m)^BITNOB_WEBHOOK_URL=.*$", "BITNOB_WEBHOOK_URL=$webhookUrl"
} else {
  $envText = $envText.TrimEnd() + "`r`nBITNOB_WEBHOOK_URL=$webhookUrl`r`n"
}
Set-Content -LiteralPath $envPath -Value $envText -NoNewline

Write-Host ""
Write-Host "Bitnob webhook tunnel is running."
Write-Host "Cloudflared process: $($process.Id)"
Write-Host "Paste this URL into Bitnob sandbox:"
Write-Host $webhookUrl
Write-Host ""
Write-Host "Keep this process running while testing. If you restart it, paste the new URL into Bitnob again."
