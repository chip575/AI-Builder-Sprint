# M3 잔여 + M4 밤샘 배치
# 사용: powershell -ExecutionPolicy Bypass -File .\run.ps1
Set-Location -LiteralPath "C:\Users\doyun\켠김에왕까지_apptive"
$ErrorActionPreference = "Continue"
$here = $PSScriptRoot
$log  = Join-Path $here "batch.log"
$tasks = @("1-eval.md","2-family-ack.md","3-embeddings.md","4-estate.md")

Add-Content -Encoding UTF8 $log "`n########## BATCH START $(Get-Date) ##########"

foreach ($t in $tasks) {
  $prompt = Get-Content (Join-Path $here $t) -Raw -Encoding UTF8
  Add-Content -Encoding UTF8 $log "`n===== START $t $(Get-Date) ====="
  for ($i = 0; $i -lt 12; $i++) {
    claude -p $prompt `
      --permission-mode acceptEdits `
      --allowedTools "Read,Write,Edit,Bash,Grep,Glob" 2>&1 | Tee-Object -Append $log
    if ($LASTEXITCODE -eq 0) { break }
    Add-Content -Encoding UTF8 $log "--- retry $i failed, sleeping 30m ($(Get-Date)) ---"
    Start-Sleep -Seconds 1800
  }
  Add-Content -Encoding UTF8 $log "===== END $t exit=$LASTEXITCODE $(Get-Date) ====="
}

Add-Content -Encoding UTF8 $log "`n########## BATCH END $(Get-Date) ##########"
