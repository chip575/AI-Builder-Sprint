# 03 · 유족 타임라인 뷰 (FR-556)

브랜치: `git switch m3` (02가 끝나 있어야 한다 — chain.ts가 없으면 종료)

## 구현할 것
1. `GET /api/ledger/[subjectId]` → `LedgerRes.parse({ nodes, chainValid })`
2. 화면 `src/app/(ui)/(m3)/ledger/[subjectId]/page.tsx`
   - 시간순 목록 + 각 노드의 `changeReason`
   - 해시 검증 배지: 유효하면 회색, 변조 감지되면 빨강 + "이력이 변조되었습니다"
   - ACTIVE / SUPERSEDED / REVOKED 시각 구분
   - 열람 사실을 `audit_logs`에 남긴다 (기록 실패가 화면을 막지 않게 삼킨다)

## 테스트
만들지 않는다. 조회·렌더뿐이라 tsc로 충분하고 아침에 눈으로 본다.

## 금지
- `npx supabase db push` 실행 금지 (마이그레이션은 이미 작성돼 있다 — 손대지 않는다)
- `src/lib/contracts/**`, `src/lib/rules/**` 수정 금지 — 훅이 막는다. 필요하면 **작업을 종료**한다
- main 브랜치로 병합 금지, main에 커밋 금지
- 범위 밖 개선 금지 (회상 인터뷰 고도화, 리팩터링, 의존성 추가)

## 완료 조건
`pnpm typecheck && pnpm gate:check` 통과 → `git commit` + `git push origin m3`
실패하면 **커밋하지 말고 종료**한다.
