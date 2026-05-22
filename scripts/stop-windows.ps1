$ErrorActionPreference = "Stop"

function Write-Info($message) {
  Write-Host "[Content Engine] $message" -ForegroundColor Cyan
}

function Write-Warn($message) {
  Write-Host "[Content Engine] $message" -ForegroundColor Yellow
}

function Get-ChildProcessIds([int]$ParentPid) {
  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ParentPid" -ErrorAction SilentlyContinue
  foreach ($child in $children) {
    Get-ChildProcessIds -ParentPid $child.ProcessId
    $child.ProcessId
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
Set-Location -LiteralPath $root

$pidPath = Join-Path $root "runtime\content-engine.pid"

if (Test-Path -LiteralPath $pidPath) {
  $rawPid = (Get-Content -LiteralPath $pidPath -ErrorAction Stop | Select-Object -First 1).Trim()
  $pidValue = 0
  if ([int]::TryParse($rawPid, [ref]$pidValue)) {
    $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Info "Stopping process started by start-windows. PID: $pidValue"
      $tree = @(Get-ChildProcessIds -ParentPid $pidValue) + @($pidValue)
      foreach ($id in ($tree | Select-Object -Unique)) {
        $target = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($target) {
          Stop-Process -Id $id -ErrorAction Stop
        }
      }
      Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
      Write-Info "Content Engine stopped."
      exit 0
    }
  }
  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
}

Write-Warn "No process started by start-windows was found. Close the startup window or check port usage."

try {
  $connections = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if ($connections) {
    Write-Host ""
    Write-Host "Port 3000 usage information only. No unrelated process will be killed:"
    foreach ($conn in $connections) {
      $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
      $name = if ($proc) { $proc.ProcessName } else { "unknown" }
      Write-Host "PID $($conn.OwningProcess) - $name"
    }
  }
} catch {
  Write-Host "Could not read port usage: $($_.Exception.Message)"
}
