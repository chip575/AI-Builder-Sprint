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

# Windows 경로 정규화 — 하네스는 백슬래시 경로를 준다 (jq는 \, grep 폴백은 \).
# 슬래시 패턴(*lib/contracts/* 등)과 매치되려면 통일 + 연속 슬래시 축약이 필수다.
# (이거 없으면 훅이 호출돼도 아무것도 못 막는다 — 2026-07-29 실검증에서 발견)
FILE=$(printf '%s' "$FILE" | tr '\134' '/' | sed 's#//*#/#g')

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

# ai-log는 모든 역할이 쓴다 — CLAUDE.md가 작업 종료 시 append를 요구한다.
# 역할 검사가 이걸 막으면 두 규칙이 충돌하고, 워커는 지시를 지킬 방법이 없어진다.
# ⚠ 이건 PM 경로의 구멍이 아니다. **ai-log는 워커의 산출물이므로 PM 소유가 아니다** —
#   decisions.md(PM의 결정 기록)와 성격이 다르고, 그래서 그쪽은 계속 막는다.
case "$FILE" in
  */docs/ai-log.md) exit 0 ;;
esac

# 역할별 소유 경로
# ⚠ 라우트 그룹 `(m0)`·`(m1)`이 api/와 세그먼트 사이에 낀다 — `api/(m0)/session/`.
#   그래서 그룹 세그먼트를 선택적으로 허용해야 한다. 이게 없으면 워커가 **자기 경로에서**
#   차단된다 (2026-07-31 탐침에서 발견 — be1·be2 둘 다 첫 파일에서 죽었을 상태).
G='(\([^/)]*\)/)?'   # 있어도 되고 없어도 되는 라우트 그룹
case "$ROLE" in
  be1) echo "$FILE" | grep -qE "lib/ai/|app/api/${G}(session|extract|gate|recall|obligations|branch)/" || deny "BE-1 소유 경로 밖: $FILE" ;;
  be2) echo "$FILE" | grep -qE "lib/signer/|lib/ledger/|app/api/${G}(documents|sign|webhooks|cron|evidence|ledger|dev|family-ack)/|supabase/" || deny "BE-2 소유 경로 밖: $FILE" ;;
  fe)  echo "$FILE" | grep -qE "app/\(ui\)/|components/|app/api/${G}(facts|rewards|admin|heartwill|will)/" || deny "FE 소유 경로 밖: $FILE" ;;
  unknown) : ;;   # WORKER_ROLE 미설정 시 역할 검사 생략 (전원 금지 규칙은 이미 적용됨)
esac
exit 0
