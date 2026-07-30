# Night batch - runs each instruction file through claude -p.
#
# When tokens run out the CLI exits non-zero. We sleep 30 minutes and retry the
# same task (up to 12 times = up to 6 hours). Once quota refills it continues.
#
# Safety: each instruction file says "do not commit on failure", db push is
# forbidden, and work happens only on m2/m3 branches. main stays untouched.
#
# NOTE: no Korean text and no hardcoded path in this file on purpose -
# Windows PowerShell 5.1 reads .ps1 as ANSI when there is no BOM, which
# mangles non-ASCII paths. The repo root is derived from the script location.
$ErrorActionPreference = "Continue"

$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo

$tasks = @(
  "docs/batch/01-heartwill.md",
  "docs/batch/02-ledger.md",
  "docs/batch/03-timeline.md"
)

$log = Join-Path $repo "batch.log"
if (-not (Test-Path -LiteralPath $log)) { New-Item -ItemType File -Path $log | Out-Null }

function Say($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm'), $msg
  Write-Host $line
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}

Say "BATCH START  repo=$repo"

foreach ($t in $tasks) {
  $file = Join-Path $repo $t
  if (-not (Test-Path -LiteralPath $file)) { Say "SKIP (missing) $t"; continue }
  $prompt = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

  Say "START $t"
  for ($i = 1; $i -le 12; $i++) {
    claude -p $prompt --permission-mode acceptEdits --allowedTools "Read,Write,Edit,Bash,Grep,Glob" 2>&1 |
      Tee-Object -Append -FilePath $log
    if ($LASTEXITCODE -eq 0) { Say "OK $t (attempt $i)"; break }
    Say "FAIL exit=$LASTEXITCODE - retry $i/12 after 30 min"
    Start-Sleep -Seconds 1800
  }
  Say "END $t exit=$LASTEXITCODE"
}

Say "BATCH END"
