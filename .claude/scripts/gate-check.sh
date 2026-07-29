#!/usr/bin/env bash
# pnpm gate:check — 결정론적 검사. LLM 없이 잡을 수 있는 전부.
set -uo pipefail
FAIL=0
red(){ printf '\033[31m✗ %s\033[0m\n' "$1"; FAIL=1; }
grn(){ printf '\033[32m✓ %s\033[0m\n' "$1"; }

echo "── 1. 타입 검사 ──"
if [ -f tsconfig.json ]; then
  npx tsc --noEmit 2>&1 | head -20 && [ ${PIPESTATUS[0]} -eq 0 ] && grn "tsc" || red "tsc 실패"
else
  echo "  (tsconfig.json 없음 — 건너뜀)"
fi

echo "── 2. P3: 프롬프트 안의 법률 수치 ──"
# LLM 프롬프트 문자열에 %나 원 단위 숫자가 들어갔는가
HIT=$(grep -rnE '(systemPrompt|prompt|content|instruction)[^=]*=.*([0-9]+(\.[0-9]+)?%|[0-9,]{4,}원)' lib/ai/ 2>/dev/null)
[ -n "$HIT" ] && { red "프롬프트에 법률 수치 (P3 위반)"; echo "$HIT" | head -5; } || grn "프롬프트 수치 없음"

echo "── 3. P3: 룰테이블 밖 하드코딩 상수 ──"
# --exclude-dir 필수 — 출력 필터(grep -v)만 쓰면 node_modules·.next 전체를 스캔한 뒤 버린다
HIT=$(grep -rnE '\b(16\.5|276000|408000|2000만|30%)\b' --include='*.ts' --include='*.tsx' \
      --exclude-dir=node_modules --exclude-dir=.next . 2>/dev/null \
      | grep -v 'lib/rules/' | grep -v '\.test\.')
[ -n "$HIT" ] && { red "룰테이블 밖 법률 수치"; echo "$HIT" | head -5; } || grn "수치는 lib/rules에만"

echo "── 4. P1: confirmed 기본값 ──"
# 예외는 라인 단위 — 정당한 확정 지점(FR-103)은 같은 줄 또는 직전 줄에 P1-CONFIRM-PATH 마커.
# 파일 단위 제외는 금지: 마커 하나가 그 파일의 다른 위반까지 숨긴다.
HIT=$(grep -rn 'confirmed[_a-zA-Z]*:[[:space:]]*true' --include='*.ts' lib/ app/ 2>/dev/null \
      | grep -v '\.test\.' \
      | while IFS=: read -r file line rest; do
          prev=""; [ "$line" -gt 1 ] && prev=$(sed -n "$((line-1))p" "$file")
          case "$prev$rest" in
            *P1-CONFIRM-PATH*) ;;
            *) echo "$file:$line:$rest" ;;
          esac
        done)
# 마커는 만능 열쇠가 아니다 — 확정 연산이 실제로 사는 곳(confirm 라우트 + store 어댑터)에서만 유효
M=$(grep -rln 'P1-CONFIRM-PATH' --include='*.ts' lib/ app/ 2>/dev/null \
    | grep -vE 'app/api/facts/confirm/|lib/store/(supabase|memory)\.ts')
[ -n "$M" ] && { red "P1-CONFIRM-PATH 마커 허용 경로 밖 사용"; echo "$M" | head -3; }
[ -n "$HIT" ] && { red "confirmed=true 기본값 (P1 위반 의심)"; echo "$HIT" | head -5; } || grn "confirmed 기본값 정상"

echo "── 5. 보안: 식별번호 패턴 ──"
HIT=$(grep -rnE '[0-9]{6}-[0-9]{7}' --include='*.ts' --include='*.tsx' --include='*.json' \
      --exclude-dir=node_modules --exclude-dir=.next --exclude='pnpm-lock.yaml' . 2>/dev/null)
[ -n "$HIT" ] && { red "주민등록번호 패턴 발견 (NFR-714 1조)"; echo "$HIT" | head -3; } || grn "식별번호 없음"

echo "── 6. 실격 방지: 제출물 금칙어 ──"
# 검사 대상: 심사자가 실제로 읽는 산출물만.
#   README·코드 주석 = 제출물 → 검사
#   spec/**·docs/decisions.md = 내부 설계문서. 배점 역산 서술이 정상이므로 제외.
#     (단 배포 전 .gitignore 또는 별도 브랜치 분리 여부를 PM이 판단할 것)
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  printf '\033[33m⚠ git 저장소가 아님 — 6번 검사 건너뜀 (init 후 재실행)\033[0m\n'
else
  TARGETS=$(git ls-files 2>/dev/null | grep -E '^(README|CONTRIBUTING).*\.md$' || true)
  CODE=$(git ls-files 2>/dev/null | grep -E '\.(ts|tsx|js|jsx)$' || true)
  HIT=""
  [ -n "$TARGETS" ] && HIT=$(grep -rniE '심사|평가위원|점수를|가점|우수성|높이 평가' $TARGETS 2>/dev/null)
  [ -n "$CODE" ] && HIT="$HIT$(grep -rniE '//.*(심사|평가위원|점수를|가점)' $CODE 2>/dev/null)"
  [ -n "$HIT" ] && { red "제출물에 심사 문구 — 프롬프트 인젝션 판정 위험 (D-15)"; echo "$HIT" | head -3; } || grn "제출물 금칙어 없음"
fi

echo "── 7. 폐기 용어 ──"
HIT=$(grep -rnE "\b(Track|why_record)\b|트랙 [ABC]|갈래 후보|민감도 등급" --include='*.ts' --include='*.tsx' lib/ app/ components/ 2>/dev/null)
[ -n "$HIT" ] && { red "폐기 용어 사용 (decisions.md D-01)"; echo "$HIT" | head -5; } || grn "용어 정상"

echo "── 8. 아카이브 참조 ──"
# 코드만 본다. 문서가 아카이브를 "언급"하는 정상 문장은 위반이 아니다.
HIT=$(grep -rn '_archive' --include='*.ts' --include='*.tsx' lib/ app/ components/ 2>/dev/null)
[ -n "$HIT" ] && { red "코드가 폐기 명세 참조"; echo "$HIT" | head -3; } || grn "아카이브 참조 없음"

echo
[ $FAIL -eq 0 ] && { printf '\033[32m▣ gate:check PASS\033[0m\n'; exit 0; } \
                || { printf '\033[31m▣ gate:check FAIL\033[0m\n'; exit 1; }
