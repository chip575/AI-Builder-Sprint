#!/usr/bin/env bash
# PreToolUse 훅 — 소유 경로 밖 수정 차단
# Claude Code는 도구 정보를 stdin에 JSON으로 전달한다.
# exit 2 = 도구 실행 차단.
set -uo pipefail

INPUT=$(cat)
if command -v jq >/dev/null 2>&1; then
  FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')
else
  FILE=$(printf '%s' "$INPUT" | grep -oE '"(file_path|path)"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
fi

# 경로를 못 읽으면 안전하게 차단한다 (fail-closed).
if [ -z "$FILE" ]; then
  echo "BLOCKED: 훅이 대상 파일 경로를 읽지 못했습니다. jq 설치 여부를 확인하세요." >&2
  exit 2
fi

ROLE="${WORKER_ROLE:-unknown}"
deny(){ echo "BLOCKED: $1" >&2; exit 2; }

# PM 전용 탈출구 — 계약·룰테이블을 사람이 직접 작성할 때만 켠다.
# 워커를 띄울 때 켜져 있으면 안전장치 전체가 무력화된다. 작업 후 반드시 끈다.
if [ "${PM_MODE:-}" = "1" ]; then
  echo "⚠ PM_MODE — 보호 경로 검사를 우회합니다. 계약 변경은 4인 합의 사항입니다." >&2
  exit 0
fi

# 전원 금지 (AGENTS.md 보안 5조)
case "$FILE" in
  *lib/contracts/*)  deny "lib/contracts는 PM만 수정. contract-owner로 제안서를 받으세요." ;;
  *lib/rules/*)      deny "lib/rules는 사람 리뷰 필수 (보안 5조)" ;;
  *validity-gate*)   deny "게이트는 사람 리뷰 필수 (보안 5조)" ;;
  *policies*)        deny "RLS 정책은 사람 리뷰 필수 (보안 5조)" ;;
  *spec/_archive/*)  deny "폐기 명세 (CLAUDE.md 읽지 말 것)" ;;
  *spec/manifest.yaml) deny "manifest는 SubagentStop 훅이 갱신합니다" ;;
esac

# 역할별 소유 경로
case "$ROLE" in
  be1) echo "$FILE" | grep -qE 'lib/ai/|app/api/(session|extract|gate)/' || deny "BE-1 소유 경로 밖: $FILE" ;;
  be2) echo "$FILE" | grep -qE 'lib/signer/|lib/ledger/|app/api/(documents|sign|webhooks|cron|evidence|ledger|dev)/|supabase/' || deny "BE-2 소유 경로 밖: $FILE" ;;
  fe)  echo "$FILE" | grep -qE 'app/\(ui\)/|components/|app/api/(facts|rewards|admin|heartwill|will)/' || deny "FE 소유 경로 밖: $FILE" ;;
  unknown) : ;;   # WORKER_ROLE 미설정 시 역할 검사 생략 (전원 금지 규칙은 이미 적용됨)
esac
exit 0
