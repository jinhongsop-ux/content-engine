param(
  [int]$Port = 3000,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

function Write-Info($message) {
  Write-Host "[Content Engine] $message" -ForegroundColor Cyan
}

function Write-Warn($message) {
  Write-Host "[Content Engine] $message" -ForegroundColor Yellow
}

function Write-Fail($message) {
  Write-Host "[Content Engine] $message" -ForegroundColor Red
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
Set-Location -LiteralPath $root

Write-Info "Project directory: $root"

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue

if (-not $nodeCmd -or -not $npmCmd) {
  Write-Fail "Node.js or npm was not found."
  Write-Host "Please install Node.js LTS first: https://nodejs.org/"
  Write-Host "Then run start-windows.bat again."
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Info "Node.js: $(node --version)"
Write-Info "npm: $(npm --version)"

if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules"))) {
  Write-Warn "First run: installing npm dependencies. Internet access is required and this may take a few minutes."
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Fail "npm install failed. Check network, npm registry, proxy, or folder permissions, then retry."
    Read-Host "Press Enter to exit"
    exit $LASTEXITCODE
  }
}

$envPath = Join-Path $root ".env"
$envExamplePath = Join-Path $root ".env.example"
if ((-not (Test-Path -LiteralPath $envPath)) -and (Test-Path -LiteralPath $envExamplePath)) {
  Copy-Item -LiteralPath $envExamplePath -Destination $envPath -ErrorAction Stop
  Write-Info "Created local .env from .env.example. Existing .env files are never overwritten."
}

$runtimeDir = Join-Path $root "runtime"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$pidPath = Join-Path $runtimeDir "content-engine.pid"
$healthUrl = "http://127.0.0.1:$Port/api/sites"
$appUrl = "http://127.0.0.1:$Port"

try {
  $existing = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
  if ($existing.StatusCode -ge 200 -and $existing.StatusCode -lt 500) {
    Write-Info "A Content Engine service is already available at $appUrl."
    if (-not $NoBrowser) {
      & cmd.exe /c start "" $appUrl
    }
    Write-Host "This window did not start a new service. Press Enter to close."
    Read-Host
    exit 0
  }
} catch {
  # No existing service responded; continue with normal startup.
}

Write-Info "Starting local service: http://127.0.0.1:$Port"

if (-not $env:PORT) {
  $env:PORT = [string]$Port
}

try {
  Set-Content -LiteralPath $pidPath -Value $PID -Encoding ASCII
  Write-Info "Recorded launcher PID: $PID"

  $openJob = Start-Job -ScriptBlock {
    param($HealthUrl, $AppUrl, $SkipBrowser)
    $ready = $false
    for ($i = 1; $i -le 30; $i++) {
      Start-Sleep -Seconds 1
      try {
        $res = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
        if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 500) {
          $ready = $true
          break
        }
      } catch {
        # Keep waiting.
      }
    }
    if ($ready -and -not $SkipBrowser) {
      & cmd.exe /c start "" $AppUrl
    }
  } -ArgumentList $healthUrl, $appUrl, ([bool]$NoBrowser)

  Write-Host ""
  Write-Host "Close this window to stop the service, or run stop-windows.bat."
  Write-Host "Do not hardcode API keys here. Configure them in the UI or local .env."
  Write-Host ""

  & $nodeCmd.Source main.js
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    Write-Fail "The local service stopped with exit code: $code"
  }
} finally {
  if ($openJob) {
    Remove-Job $openJob -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $pidPath) {
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  }
}
