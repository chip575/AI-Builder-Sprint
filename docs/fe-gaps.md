# 프론트 연결 점검 — 2026-08-01

**목적**: 브라우저에서 클릭만으로 데모 전 구간이 굴러가는지. 기준은 완성도가 아니라
**7분 안에 장면이 성립하는가**다.

**방법**: 브라우저가 없어 두 가지로 대체했다.
1. **링크 그래프** — `(ui)` 전체의 `href`·`router.push`·`redirect`·`<Link>`를 전수 수집해
   `/`에서 도달 가능한 화면을 계산했다. "진입로가 있는가"는 시각이 아니라 도달 가능성 문제다.
2. **실제 HTTP** — dev 서버를 띄워 화면·API를 실제로 때렸다. 200만 보지 않고 **본문**까지 봤다.

**확인한 것과 추정을 섞지 않았다.** 클릭해야만 알 수 있는 항목은 §4에 따로 뺐다.

## 0. 요약

| 처분 | 건수 | 뜻 |
|---|---|---|
| **고칠 것** | 11 | 코드 결함. 안 고치면 장면이 성립하지 않는다 |
| **심을 것** | 1 | 코드는 멀쩡하고 데이터가 없다. 시드로 채운다 |
| **말할 것** | 5 | 발표에서 말로 넘긴다 |

### 처리 결과 (2026-08-01)

| 고친 것 | 어떻게 |
|---|---|
| 게이트가 확정보다 뒤에 있던 것 | `documents/route.ts` 순서 교체. 안 되는 것을 먼저 말한다 |
| 화면이 `error.route`를 안 읽던 것 | `ErrorNote`가 대체 경로 버튼을 낸다 — 전 화면이 이 컴포넌트를 쓴다 |
| 필사 가이드가 목적지인데 403이던 것 | 항목이 **아예 없으면** 빈칸 서식을 준다. 미확정 항목이 있으면 여전히 막는다 |
| `/vault-will` 404 | 인쇄로 대체. 이 화면의 완결점은 인쇄다 (FR-302) |
| 차단 카운터 0 고정 | 집계에서 `wasSignAttempt` 조건 제거 — 문서 생성 단계의 차단도 차단이다 |
| `/recall`·`/org` 진입로 없음 | `/chat` 안 링크 · 홈 하단 "기관 담당자이신가요?" |
| `/heartwill` 진입로 없음 | 회상 종료 카드에서 `sessionId`를 실어 이동 |
| `/vault`의 축 소개가 `/chat`으로 가던 것 | `/recall`로 |

**e2e 관통 결과**: 차단 카운터 0 → **13**. 필사 가이드가 항목 없이 200.
이 조합을 지키는 것은 `scripts/e2e-mock.mjs` 14단계뿐이다 — 유닛으로는 안 잡힌다.

**남은 것**: `/ledger` 진입로(§3 — 제품 결함으로 존치) · 갱신 도래 목록(심을 것) ·
`/doc` 새로고침 상태 유실 · 가지 제안 SSE 미수신.

심각도(치명/중/경미)와 처분은 **다른 축**이다. "치명인데 코드는 멀쩡한" 항목이 갈 곳을
잃지 않도록 갈라 둔다 — 갱신 도래 빈 목록이 정확히 그 자리다.

### 환경 주의 (점검 중 실측)

- 기동 로그 `DATA=supabase UPSTAGE=real MODUSIGN=mock`.
  **UPSTAGE가 real이라 대화 1턴마다 실과금된다** (이번 점검에서 5턴 호출).
- `DATA=supabase`면 `SUPABASE_SERVICE_ROLE_KEY`가 있어 **미들웨어 인증이 켜진다** —
  `/chat` `/confirm` `/rewards` `/doc` `/vault`가 전부 307로 `/auth`로 튕긴다.
  A 동선 전체가 로그인 통과에 걸려 있다.
- 서명 요청은 **0건 소모**했다 (`MODUSIGN=mock`).

## 1. 발견 목록

| 동선 | 지점 | 증상 | 심각도 | 처분 | 원인 |
|---|---|---|---|---|---|
| B | documents 403 → 필사 가이드 | 서버는 `error.route`(`/will/handwriting?intentId=…`)를 실어 보내는데 **`(ui)` 전체에 `error.route` 참조 0건.** `ErrorNote`는 `message`/`nextAction`만 렌더 → 안내 문구만 뜨고 갈 길이 없다 | 치명 | 고칠 것 | `documents/route.ts:110-114` ↔ `_components/Shell.tsx:100-108` |
| B | "유언장을 준비하고 싶어요" | 가지 판정은 HANDWRITTEN_WILL로 정확히 떨어지는데, 이 가지엔 필수 슬롯이 없고 추출기가 `region/amount/orgName`만 뽑아 `facts=[]` → **게이트(403②)에 닿기 전에 `FACTS_UNCONFIRMED`(403①)로 먼저 막힌다.** 게이트 차단 장면 자체가 안 나온다 | 치명 | 고칠 것 | `documents/route.ts:68-84` · `mock-extractor.ts:17-20,49-60` |
| B | 필사 가이드 마지막 버튼 | "네 가지 모두 확인했어요 — 보관 안내로" → `/vault-will`. **그 라우트가 없다. 404** (영문 Next 기본 페이지) | 치명 | 고칠 것 | `will/handwriting/page.tsx:164` |
| C | `/recall` 진입 | 링크 그래프상 **도달 불가.** 어디에도 `/recall`로 가는 링크가 없다 | 치명 | 고칠 것 | 링크 그래프 (진입로 0건) |
| C | 커버리지 표시 | 5축 진행바는 `/recall`에만 있다(도달 불가). `/chat`은 "지금까지 N가지…" 한 줄뿐이고 `covered>0`일 때만 뜬다 — **첫 발화가 축에 안 걸리면 아무것도 안 보인다** (실측: axisCoverage 전부 0인 케이스 발생) | 치명 | 고칠 것 | `recall/page.tsx:106-130` · `chat/page.tsx:180-184` |
| C | 세션 종료 → 마음 유언 | `/recall` 종료 화면·`/chat`·`/vault` 어디에도 `/heartwill` 링크가 없다. `/vault`의 축 소개 버튼도 `/chat`으로 보낸다 | 치명 | 고칠 것 | `recall/page.tsx:190-199` · `vault/[draftId]/page.tsx:99-104` |
| D | `/org` 진입 | 링크 그래프상 **도달 불가.** `/org/gate-counter`·`/org/pipeline`은 `/org`에서만 링크되므로 함께 잠긴다 | 치명 | 고칠 것 | 링크 그래프 (진입로 0건) |
| D | 차단 카운터 | **0으로 고정.** `blockedTotal`은 `POST /api/sign/:id`에서만 증가하는데, ESIGN_OK가 아닌 draft는 `/api/documents`가 애초에 만들지 않는다 → **UI 경로로는 절대 증가할 수 없다.** 실측: ESIGN_INVALID 판정 11건인데 `blockedTotal: 0`, `byStatute: []` | 치명 | 고칠 것 | `documents/route.ts:92`(attemptedSign=false) ↔ `sign/[draftId]/route.ts:48-51` |
| D | 갱신 도래 목록 | **화면에 없다.** 데이터는 `GET /api/admin/summary`의 `renewalDue`에 있고 200으로 응답하는데, **이 API를 호출하는 UI가 0건.** `/org`는 gate-stats·pipeline-stats·reconcile 셋만 부른다 | 치명 | 고칠 것 | `org/page.tsx:22-26` · `admin/summary/route.ts:20,35` |
| E | 원장 타임라인 진입 | **확정: 진입로 없음.** 코드 전체에서 `/ledger`로 가는 `href`/`router.push` 0건. API·시드는 정상 | 치명 | 말할 것(촬영) / 고칠 것(제품) | 링크 그래프 (진입로 0건) — §3 참조 |
| A | `/doc/[draftId]` 새로고침 | `signUrl`·`docId`가 컴포넌트 state에만 있다. REQUESTED 상태에서 새로고침하면 `docId=null`이 되어 데모 버튼이 사라지고 **"서명을 기다리는 중…"에서 영구 정지** | 치명 | 고칠 것 | `doc/[draftId]/page.tsx:23,61-65,139` |
| B | `/will/handwriting` 직접 진입 | `GET /api/will/draft/{id}/print`가 403 → 화면 전체가 빨간 안내문 하나. 지역·금액 단어를 우연히 말해야만 200 (그 경우 초안·체크리스트 정상) | 치명 | 고칠 것 (위 2행과 같은 뿌리) | `will/draft/[id]/print/route.ts:31-44` |
| A | `/` → 로그인 | `/chat` 클릭 시 307 → `/auth?next=/chat`. 현재 env에서 로그인이 필수 벽 | 중 | 말할 것 | `middleware.ts:15-31` |
| B | 대화 중 가지 제안 | 서버는 `event: proposal` SSE를 보내는데 `postSse`에 핸들러가 없어 통째로 버려진다. `/api/branch/[id]/decide`를 호출하는 UI도 0건 → **첫 발화가 아니면 어떤 가지도 열 수 없다** | 중 | 말할 것 | `lib/sse.ts:37-42,74-77` |
| C | `/heartwill` 직접 진입 | `?sessionId=` 없으면 "대화 번호"를 **손으로 입력**하라는 폼. 사용자가 세션 UUID를 알 방법이 없다(localStorage에만 존재). sessionId를 주면 정상 렌더 | 중 | 고칠 것 (위 C 링크와 함께) | `heartwill/page.tsx:60-87` |
| C | `/recall` 새로고침 | `sessionId`·`answers`·`asked`·`skipped`가 전부 컴포넌트 state. URL에도 localStorage에도 없다 → 새로고침하면 새 세션이 생기고 커버리지 0으로 리셋 | 중 | 말할 것 | `recall/page.tsx:23-30` |
| 공통 | 없는 경로 진입 | 영문 Next 기본 404("This page could not be found"). `not-found.tsx`·`error.tsx` 없음 | 중 | 말할 것 | `src/app` (부재) |
| A | `/doc` 게이트 배지 | "ESIGN_OK · 전자서명으로 효력이 생깁니다"가 하드코딩. 서버 판정을 읽지 않는다 | 경미 | 말할 것 | `doc/[draftId]/page.tsx:86-88` |
| D | `/org/pipeline` 되돌아가기 | 로딩 중에만 `back` 링크가 있고 로드 완료 후 사라진다 → `/org`로 돌아갈 길이 홈뿐 | 경미 | 말할 것 | `org/pipeline/page.tsx:32 vs 41` |
| D | 갱신 도래 **데이터** | API는 응답하나 목록이 실제로 비어 있는지 미확인. 비어 있으면 화면을 붙여도 빈 표다 | — | **심을 것** | 촬영 전 시드 필요 |

### 정상 확인 (실측)

- **A 관통** — 대화→확인→답례품→초안→서명→증빙 API 전 구간 200. 공제 **276,000원 검산 일치**,
  증빙 해시·PDF URL 발급까지 정상.
- **D 6단계 지표** — 6단계 전부 데이터 있음 (CONVERSE p95 2820ms).
- **D 마지막 동기화·교정** — `GET /api/cron/reconcile` 200.
- **D "지금 대조하기"** — `POST /api/cron/reconcile?staleMs=0` → 200 `{corrected:0, lastSyncAt:…}`.

## 2. 링크 그래프

**간선(전수)**: `/`→`/chat` · `/chat`→`/confirm` · `/confirm`→`/rewards`,`/chat` ·
`/rewards`→`/doc/{id}` · `/doc/{id}`→`/vault/{id}` · `/vault/{id}`→`/chat` ·
`/branch/paper-scan`→`/confirm` · `/org`→`/org/gate-counter`,`/org/pipeline` ·
각 화면 Shell→`/` · `/heartwill`·`/recall` back→`/chat` · `/ledger/{id}` back→`/` ·
`/will/handwriting`→`/vault-will`(**존재하지 않음**) · 미들웨어→`/auth`

**도달 가능 (7)** — `/` `/auth` `/chat` `/confirm` `/rewards` `/doc/[draftId]` `/vault/[draftId]`

**도달 불가 (8)** — `/recall` · `/heartwill`(`?sessionId=` 필수) · `/will/handwriting`(`?intentId=` 필수) ·
`/branch/paper-scan`(`?intentId=` 필수) · `/org` · `/org/gate-counter` · `/org/pipeline` · `/ledger/[subjectId]`

**존재하지 않는 링크 대상 (1)** — `/vault-will`

> **교훈**: manifest에도 코드에도 없는 경로를 화면이 참조하고 있었다. 화면이 목적지를
> **지어낸** 것이다. 링크 대상은 manifest 또는 실재 라우트와 대조한다 — 같은 종류가 또 있을 수 있다.
> 이 계열의 증상은 빌드 실패가 아니라 **런타임 404**라 타입 검사로는 안 잡힌다.

**화면 없는 API 계층** — `/api/estate/*`(자산·수익자·스캔) · `/api/obligations/fire` ·
`/api/branch/[id]/decide` · `/api/dev/advance-time`. **M4 자산 인벤토리는 화면이 아예 없다.**

## 3. 제품 결함으로 남기는 항목

> **원장 진입로 없음.** 유족·Custodian이 열람할 경로가 앱에 존재하지 않는다 (FR-556).
> 열람권 매트릭스(M2)와 함께 설계해야 하며, **목록 화면을 만들 때 소유자 필터를 반드시
> 같이 넣는다** (오염 subject 11개).

두 문제가 같은 지점에서 만난다 — 목록 화면을 만드는 순간 진입로도 생기고 오염 데이터도
노출된다. 지금 `listLedgerNodes(subjectId)`가 인자를 필수로 둔 **설계** 덕에 전체 조회가
구조적으로 불가능해 노출이 없을 뿐이다 (D-18 "정책 없음 = 전면 차단"과 같은 계열 —
열어주지 않으면 닫혀 있다).

**촬영 대응**: 탭 미리 열기. 코드 변경 0이고 예열과 같은 동작이다.
다만 이는 카메라에서 가릴 뿐 유족의 길을 만들지 않는다.

## 4. 확인하지 못한 항목

브라우저가 없어 아래는 확인하지 못했다. **추측으로 채우지 않았다.**

1. **실제 렌더 결과** — `/heartwill` 하나 빼고 전부 client component라 curl HTML에 데이터가 없다.
   "데이터가 보이는가"는 API 응답 + 코드 경로로만 판정했고 실제 DOM은 못 봤다.
2. **로그인·회원가입 성공 여부** — 계정 생성 부작용을 피해 호출하지 않았다.
   **A 동선 전체가 여기 걸려 있으므로 데모 전 반드시 사람이 눌러 봐야 한다.**
3. **`/branch/paper-scan` 업로드** — multipart + Upstage 실호출이라 시도하지 않았다.
4. **`/heartwill` 쓰기 동작** — 문단 승인·서버 액션 실행 결과 미확인 (읽기 렌더까지만).
5. **뒤로 가기 실제 거동** — 표의 "상태 유실"은 *state가 URL/서버 어디에도 없다*는
   코드 사실까지만 확인했다. bfcache 복원은 브라우저에서만 알 수 있다.
6. **`/doc` 3초 폴링 UI**, **`window.print()` 미리보기**, **반응형·터치 44px** — 전부 미확인.
7. **답례품 한도 초과 버튼 비활성화** — 서버 한도(remaining 300,000원)는 실측했으나
   화면에서 실제로 눌리지 않는지는 미확인.
