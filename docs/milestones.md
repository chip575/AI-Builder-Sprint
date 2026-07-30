# 마일스톤별 개발 — 폴더 + 브랜치

층(M0~M3)은 **증명 가능한 명제** 단위다(`spec/03.0-mvp.md`).

## 파일에서 층 보기 — 라우트 그룹

```
src/app/api/(m0)/   src/app/api/(m1)/     ← API를 층별로
src/app/(ui)/(m0)/  src/app/(ui)/(m1)/    ← 화면을 층별로
```

`(m0)`·`(m1)`은 Next.js **라우트 그룹**이라 **URL에 나타나지 않는다** —
`src/app/api/(m0)/session/message` → `/api/session/message`.
파일 트리에서 층이 보이되 주소는 그대로다. 각 그룹 폴더의 README에 그 층의 목록이 있다.

`src/lib/`은 층으로 나누지 않는다 — 계약·룰테이블·스토어·어댑터는 **모든 층이 공유하는
토대**이고, 나누면 같은 파일을 여러 층이 참조하며 경계가 거짓이 된다.

## 진행에서 층 보기 — 브랜치

아직 서로 연결하지 않을 층은 **독립 브랜치에서 개발**한다.

```
main   ← M0 완료. 항상 동작하는 상태를 유지한다 (데모·심사 대상)
 ├ m1   ← M1만 개발
 ├ m2   ← M2만 개발
 └ m3   ← M3만 개발
```

## 규칙

1. **`main`은 항상 초록이다** — `pnpm test` · `pnpm e2e` · `pnpm gate:check` 통과 상태를 깨지 않는다
2. 층 작업은 해당 브랜치에서만 한다. `git switch m1`
3. 층이 끝나면 **포크 내부 PR**(`m1` → `main`)로 병합한다.
   ⚠ GitHub은 포크에서 PR을 열면 base가 기본 upstream이다 — **base를 `chip575/AI-Builder-Sprint`로 바꿔야 한다** (CLAUDE.md P7)
4. 병합 후 `m1-code` 주석 태그를 단다 (`m0-code`가 선례)
5. 다른 층 브랜치는 병합 뒤 `git rebase main` 또는 `merge main`으로 따라잡는다

## 어디까지 했는지 확인하는 법

| 보고 싶은 것 | 명령 |
|---|---|
| 그 층에서 한 일만 | `git log main..m1 --oneline` |
| 층별 완료 지점 | `git tag -n9` |
| 모듈 단위 상태 | `spec/manifest.yaml` — 각 행의 `mvp:` · `status:` |
| GitHub에서 | Branches 탭 · Tags · PR |

---

## M0 · "말이 서명이 된다" — 완료 (`main`, 태그 `m0-code`)

**명제**: 한 문장의 발화가 법적으로 유효한 전자서명 문서가 되어 돌아온다.

| 모듈 | 구현 위치 |
|---|---|
| M-GATE (FR-104) | `src/lib/rules/validity-gate.ts` — 게이트 3분기, 순수 함수 |
| M-RULES-DONATION (FR-202·203) | `src/lib/rules/hometown-donation.ts` — 검산 3케이스 |
| M-MOCK (NFR-707) | `src/lib/signer/mock/` — 키 없이 전 흐름 |
| M-PERSISTENCE (D-18) | `supabase/migrations/`, `src/lib/store/` — 인메모리·Supabase 이중 구현 |
| M-SESSION-MSG (FR-101·110·115B) | `src/app/api/(m0)/session/message/`, `src/lib/rules/express-detect.ts` |
| M-EXTRACT (FR-102) | `src/app/api/(m0)/extract/`, `src/lib/ai/extract/` |
| M-FACTS-CONFIRM (FR-103) | `src/app/api/(m0)/facts/` — 확인 버튼이 P1 강제 지점 |
| M-DOCUMENTS (FR-501) | `src/app/api/(m0)/documents/` — 미확정·게이트 비통과는 403 |
| M-SIGN (FR-501·502) | `src/app/api/(m0)/sign/`, `src/lib/signer/` |
| M-WEBHOOK (FR-503) | `src/app/api/(m0)/webhooks/modusign/` — 멱등·아웃박스 |
| M-EVIDENCE (FR-505) | `src/app/api/(m0)/evidence/` — 해시·15분 만료 URL |
| M-REWARDS (FR-203) | `src/app/api/(m0)/rewards/` — 한도 초과는 서버가 거부 |
| M-AUTH | `src/lib/auth/`, `src/app/api/(m0)/auth/`, `middleware.ts` |
| 화면 S1~S7 | `src/app/(ui)/(m0)/` — auth·chat·confirm·rewards·doc·vault |
| real 어댑터 | `src/lib/signer/real/`, `src/lib/ai/extract/real/`, `src/lib/ai/session/real/` — 키 없이 픽스처 테스트 |

**완료 판정 (03.0)**: 실 서명 왕복 1건 — **미달**. 코드는 끝났고 PM 계정 작업 대기.
**검증**: `pnpm test`(139) · `pnpm e2e`(14단계, 키 유무 양쪽) · `pnpm gate:check`(8종)

---

## M1 · "체결이 끝이 아니다" — 브랜치 `m1`

**명제**: 서명 이후에도 계약이 살아 있고, 연동은 유실에도 견딘다.

### 완료

| 모듈 | 구현 위치 |
|---|---|
| M-GATE-COUNTER (FR-509) | `src/app/api/(m1)/admin/gate-stats/` · `src/lib/observability/gate-log.ts` · `src/app/(ui)/(m1)/org/gate-counter/` |
| M-OBSERVABILITY (NFR-709) | `src/app/api/(m1)/admin/pipeline-stats/` · `src/lib/observability/{track,stages}.ts` · `src/lib/store/percentile.ts` · `src/app/(ui)/(m1)/org/pipeline/` |
| M-RECONCILER (FR-504) | `src/app/api/(m1)/cron/reconcile/` · `src/app/(ui)/(m1)/org/` |
| M-PAPER-SCAN (FR-401·NFR-711) | `src/app/api/(m1)/paper-scan/` · `src/lib/ai/document/` · `src/app/(ui)/(m1)/branch/paper-scan/` |

### 잔여

M-SIGN-LIFECYCLE(FR-506·507) · M-OBLIGATIONS(FR-508) ·
M-ADMIN / M-ADMIN-OPS(FR-601~605) · M-TIMETRAVEL

DB는 이미 준비돼 있다 — `gate_verdicts`·`pipeline_metrics`·`obligations` 테이블은
첫 마이그레이션에 포함됐다. 남은 모듈도 적재·조회·화면만 붙이면 된다.

---

## M2 · "마음이 축이 된다" — 브랜치 `m2`

질문은행·세션 재개·마음 유언 버전·가지 감지(DETECTED)·자필 필사 가이드·
마음의 편지·유산기부(숙려 화면). 계약(`src/lib/contracts/`)은 이미 정의돼 있고
DB 테이블(`heart_will_*`)은 해당 마이그레이션에서 추가한다.

## M3 · "시간에 서명한다" — 브랜치 `m3`

의사 확인서·실질성 등급·원장 해시체인·가족 인지 서명·유족 타임라인·Embeddings 회상.
`intent_ledger_nodes`는 append-only 트리거와 함께 M3 마이그레이션에서 만든다.

## M4 · 여력

절단 시 여기부터 버린다. `spec/manifest.yaml` 맨 아래 주석 참조.
