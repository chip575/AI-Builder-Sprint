#!/usr/bin/env bash
# SubagentStop 훅 — manifest status 갱신 + ai-log 강제
# 사용: MODULE_ID=M-REWARDS 환경변수로 대상 지정
set -uo pipefail
MF="spec/manifest.yaml"
ID="${MODULE_ID:-}"

# 실제 실행 가능한 인터프리터를 고른다.
# Windows의 python3는 Microsoft Store 스텁일 수 있다 — 존재하지만 아무것도 안 한다.
PYBIN=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'pass' >/dev/null 2>&1; then PYBIN="$c"; break; fi
done

if [ -n "$ID" ] && [ -f "$MF" ]; then
  if [ -n "$PYBIN" ]; then
    PYTHONIOENCODING=utf-8 "$PYBIN" - "$MF" "$ID" <<'PY'
import sys, re
mf, mid = sys.argv[1], sys.argv[2]
lines = open(mf, encoding='utf-8').read().split('\n')
inblk = False; changed = False
for i, l in enumerate(lines):
    if l.startswith('- id: '):
        inblk = (l.strip() == f'- id: {mid}')
    elif inblk and re.match(r'\s*status:\s*', l):
        lines[i] = re.sub(r'(status:\s*)\w+', r'\1done', l); changed = True; inblk = False
if changed:
    open(mf, 'w', encoding='utf-8').write('\n'.join(lines))
    print(f'manifest: {mid} → done')
else:
    print(f'manifest: {mid} 행을 찾지 못했습니다', file=sys.stderr)
PY
  else
    echo "⚠ 실행 가능한 python이 없습니다 — manifest status를 갱신하지 못했습니다. 수동으로 바꾸세요." >&2
  fi
else
  echo "⚠ MODULE_ID 미설정 — manifest status를 갱신하지 못했습니다. 수동으로 바꾸세요."
fi

# ai-log 강제
D=$(date +%F)
if ! grep -q "^$D" docs/ai-log.md 2>/dev/null; then
  echo "$D | ${WORKER_ROLE:-agent} | ${MODULE_ID:-?} | (무엇을 AI에 맡겼고 무엇을 사람이 고쳤는지 채우세요)" >> docs/ai-log.md
  echo "⚠ docs/ai-log.md에 오늘 기록 자리를 만들었습니다. 내용을 채우세요."
fi
