# 01 · M-HEARTWILL — 마음 유언 문단 승인 (FR-111 · FR-112)

브랜치: `git switch m2` (없으면 `git switch -c m2 origin/m2`)

## 이미 되어 있는 것 (손대지 말 것)
- 계약: `src/lib/contracts/heartwill.ts` (HeartWillApplyReq · HeartWillVersionRes · DeliveryPatch)
- 스키마: `supabase/migrations/20260730160227_heartwill.sql` — **작성만 됐고 적용은 안 됐다**

## 구현할 것
1. StorePort에 마음 유언 메서드 추가 (`src/lib/store/port.ts` + `memory.ts` + `supabase.ts`)
   - 인메모리부터 동작하게 한다. Supabase 어댑터는 같은 시그니처로 작성하되
     테이블이 없어 실패해도 인메모리 경로가 죽지 않게 한다
   - 공유 계약 테스트(`store-contract.ts`)에 케이스를 추가한다
2. `POST /api/heartwill/apply` — `{ sessionId, acceptedParagraphIds[] }`
   - **승인된 문단만 반영**한다. 빈 배열이면 문서를 갱신하지 않는다 (P1)
   - 응답은 `HeartWillVersionRes.parse(...)`를 통과해야 한다
   - 문단마다 `sourceUtteranceId`가 있어야 한다 — 없으면 생성 거부
3. 화면 `src/app/(ui)/(m2)/heartwill/page.tsx`
   - AI 문장(`AI_DRAFT`)과 사용자 문장(`USER_WRITTEN`)을 **시각적으로 구분**
   - 문단별 승인 체크박스. 기본은 전부 미승인
   - 상단에 "법적 효력이 없는 문서입니다" 영구 노출 (인쇄에도 남을 것)
   - 서명 버튼·서명 API 호출을 만들지 않는다 (NON_BINDING)

## 테스트
- 미승인 문단은 문서에 들어가지 않는다
- `acceptedParagraphIds: []` → 버전이 생기지 않는다
- 근거 발화 없는 문단은 생성되지 않는다

## 금지
- `npx supabase db push` 실행 금지 (마이그레이션은 이미 작성돼 있다 — 손대지 않는다)
- `src/lib/contracts/**`, `src/lib/rules/**` 수정 금지 — 훅이 막는다. 필요하면 **작업을 종료**한다
- main 브랜치로 병합 금지, main에 커밋 금지
- 범위 밖 개선 금지 (회상 인터뷰 고도화, 리팩터링, 의존성 추가)

## 완료 조건
`pnpm typecheck && pnpm gate:check && pnpm test` 전부 통과 → `git commit` + `git push origin m2`
하나라도 실패하면 **커밋하지 말고 종료**한다.
