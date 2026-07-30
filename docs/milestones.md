# 마일스톤별 구현 범위

이 저장소는 **증명 가능한 명제** 단위로 절단해 개발했다(`spec/03.0-mvp.md`).
어디까지가 어느 층인지 세 가지로 확인할 수 있다.

| 확인 방법 | 명령 |
|---|---|
| 태그 | `git tag -n9` — 층 완료 지점에 주석 태그 |
| 층별 커밋 | `git log m0-code..m1-code --oneline` |
| 모듈 상태 | `spec/manifest.yaml` — 각 행의 `mvp:`·`status:` |

---

## M0 · "말이 서명이 된다" — 완료

**명제**: 한 문장의 발화가 법적으로 유효한 전자서명 문서가 되어 돌아온다.
**태그**: `m0-code` — 코드 완료 지점

| 모듈 | 구현 위치 |
|---|---|
| M-GATE (FR-104) | `lib/rules/validity-gate.ts` — 게이트 3분기, 순수 함수 |
| M-RULES-DONATION (FR-202·203) | `lib/rules/hometown-donation.ts` — 검산 3케이스 |
| M-MOCK (NFR-707) | `lib/signer/mock/` — 키 없이 전 흐름 |
| M-PERSISTENCE (D-18) | `supabase/migrations/`, `lib/store/` — 인메모리·Supabase 이중 구현 |
| M-SESSION-MSG (FR-101·110·115B) | `app/api/session/message/`, `lib/rules/express-detect.ts` |
| M-EXTRACT (FR-102) | `app/api/extract/`, `lib/ai/extract/` |
| M-FACTS-CONFIRM (FR-103) | `app/api/facts/` — 확인 버튼이 P1 강제 지점 |
| M-DOCUMENTS (FR-501) | `app/api/documents/` — 미확정·게이트 비통과는 403 |
| M-SIGN (FR-501·502) | `app/api/sign/`, `lib/signer/` |
| M-WEBHOOK (FR-503) | `app/api/webhooks/modusign/` — 멱등·아웃박스 |
| M-EVIDENCE (FR-505) | `app/api/evidence/` — 해시·15분 만료 URL |
| M-REWARDS (FR-203) | `app/api/rewards/` — 한도 초과는 서버가 거부 |
| M-AUTH | `lib/auth/`, `app/api/auth/`, `middleware.ts` |
| 화면 S1~S7 | `app/(ui)/` — auth·chat·confirm·rewards·doc·vault |
| real 어댑터 | `lib/signer/real/`, `lib/ai/extract/real/` — 키 없이 픽스처 테스트 |

**완료 판정 (03.0)**: 실 서명 왕복 1건 — **미달**. 코드는 끝났고 PM 계정 작업 대기.
**검증**: `pnpm test`(139) · `pnpm e2e`(14단계, 키 유무 양쪽) · `pnpm gate:check`(8종)

---

## M1 · "체결이 끝이 아니다" — 착수 전

**명제**: 서명 이후에도 계약이 살아 있고, 연동은 유실에도 견딘다.
**태그**: `m1-code` (예정)

M-GATE-COUNTER(FR-509) · M-OBSERVABILITY(NFR-709) · M-RECONCILER(FR-504) ·
M-SIGN-LIFECYCLE(FR-506·507) · M-OBLIGATIONS(FR-508) · M-ADMIN(FR-601~605) ·
M-PAPER-SCAN(FR-401) · M-TIMETRAVEL

계측 지점(`lib/observability/track.ts`)은 M0에서 미리 심어뒀다 — M1은 적재·화면만 붙인다.

---

## M2 · "마음이 축이 된다" / M3 · "시간에 서명한다"

`spec/03.0-mvp.md` 참조. 계약(`lib/contracts/`)은 M2·M3 모듈까지 이미 정의돼 있고,
DB 테이블은 해당 마이그레이션에서 추가한다(추가는 싸고 변경은 비싸다).

---

## M4 · 여력

절단 시 여기부터 버린다. `spec/manifest.yaml` 맨 아래 주석 참조.
