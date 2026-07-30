# 밤 배치 — 지시서를 순서대로 claude -p 에 물린다.
#
# 토큰이 소진되면 CLI가 0이 아닌 코드로 죽는다. 그때 30분 자고 같은 태스크를 다시 시도한다
# (최대 12회 = 최대 6시간). 충전되면 그 시도에서 이어서 진행된다.
#
# 안전장치:
#   · 각 지시서에 "실패하면 커밋하지 말고 종료"가 들어 있다 → 아침에 커밋 유무가 곧 판정
#   · db push는 지시서에서 금지 → 되돌릴 수 없는 스키마 변경은 밤에 일어나지 않는다
#   · 작업은 m2·m3 브랜치에서만 → main과 배포는 밤새 안전하다
$ErrorActionPreference = "Continue"

$repo = "C:\Users\doyun\켠김에왕까지_apptive"
Set-Location $repo

$tasks = @(
  "docs/batch/01-heartwill.md",
  "docs/batch/02-ledger.md",
  "docs/batch/03-timeline.md"
)

$log = Join-Path $repo "batch.log"
Add-Content $log "`n########## BATCH START $(Get-Date -Format 'yyyy-MM-dd HH:mm') ##########"

foreach ($t in $tasks) {
  $prompt = Get-Content (Join-Path $repo $t) -Raw
  Add-Content $log "`n===== START $t $(Get-Date -Format 'HH:mm') ====="

  for ($i = 0; $i -lt 12; $i++) {
    claude -p $prompt `
      --permission-mode acceptEdits `
      --allowedTools "Read,Write,Edit,Bash,Grep,Glob" 2>&1 | Tee-Object -Append $log

    if ($LASTEXITCODE -eq 0) {
      Add-Content $log "----- OK $t (시도 $($i+1)회) -----"
      break
    }
    Add-Content $log "----- 실패(exit=$LASTEXITCODE) — 30분 후 재시도 $($i+1)/12 -----"
    Start-Sleep -Seconds 1800
  }

  Add-Content $log "===== END $t exit=$LASTEXITCODE $(Get-Date -Format 'HH:mm') ====="
}

Add-Content $log "########## BATCH END $(Get-Date -Format 'yyyy-MM-dd HH:mm') ##########"
