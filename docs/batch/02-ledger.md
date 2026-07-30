# 02 · M-LEDGER — 의사 이력 원장 최소 구현 (FR-550~556)

브랜치: `git switch m3` (없으면 `git switch -c m3 origin/main`) 후 `git merge main`

## 이미 되어 있는 것 (손대지 말 것)
- 계약: `src/lib/contracts/ledger.ts` (LedgerNodeReq · LedgerNode · LedgerRes · Materiality)
- 스키마: `supabase/migrations/20260730160602_ledger.sql` — **작성만 됐고 적용은 안 됐다**

## 구현할 것
1. `src/lib/ledger/chain.ts` — 순수 로직
   - `nodeHash` 계산: 이전 해시 + 노드 내용을 sha256. `prev_hash`로 연결
   - `verifyChain(nodes)` → boolean. 한 바이트만 달라도 이후 전부 불일치
   - `judgeMateriality(changeSummary)` — 수증자·금액·기부처 변경이면 MATERIAL,
     문구만 바뀌면 MINOR, 메모성이면 ANNOTATION
   - 최신성: 가장 큰 seq가 ACTIVE, 그 앞은 SUPERSEDED (저장값이 아니라 유도값)
2. StorePort에 원장 메서드 (인메모리 우선, Supabase 어댑터는 같은 시그니처로 작성)
3. `POST /api/ledger` — 노드 추가

## 테스트 (최소만 — 순수 로직 3개)
화면·라우트 테스트는 만들지 않는다.
1. 노드 3개 체인 → `verifyChain` = true
2. 중간 노드 1바이트 변조 → `verifyChain` = false
3. 수증자 변경 → MATERIAL / 문구 수정 → MINOR

## 범위 밖
가족 인지 서명(FR-554), 다자 서명, 재서명 흐름

## 금지
- `npx supabase db push` 실행 금지 (마이그레이션은 이미 작성돼 있다 — 손대지 않는다)
- `src/lib/contracts/**`, `src/lib/rules/**` 수정 금지 — 훅이 막는다. 필요하면 **작업을 종료**한다
- main 브랜치로 병합 금지, main에 커밋 금지
- 범위 밖 개선 금지 (회상 인터뷰 고도화, 리팩터링, 의존성 추가)

## 완료 조건
`pnpm typecheck && pnpm gate:check && pnpm test` 통과 → `git commit` + `git push origin m3`
실패하면 **커밋하지 말고 종료**한다.
