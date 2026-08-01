# 배포 (Vercel) — 필요해질 때 30분

> **필요 여부**: 대회 공지의 제출물은 "**데모 영상/배포 링크**, 코드 저장소, 발표 자료,
> AI 활용 증빙"이다. 슬래시는 둘 중 하나로 읽히므로 **데모 영상이 있으면 배포는
> 선택**일 가능성이 높다. 최종 근거는 제출 양식 원문이다 — 확인 후 결정한다.
> 이 문서는 "필요하다"로 판정될 때 바로 실행하기 위한 준비다.

## 0. 주소 — 셋 중 하나만 진짜다 🔴

```
https://ai-builder-sprint-two.vercel.app        ← ✅ 이것만 쓴다
https://ai-builder-sprint-apptive.vercel.app    ← Vercel SSO로 잠김. 팀원 브라우저에서만 열린다
https://ai-builder-sprint.vercel.app            ← 남의 앱. 307로 다른 사이트로 넘어간다
```

**증상이 주소마다 다르다** — 각각 "정상"·"로그인 안 됨"·"404"로 보인다. 어느 것을 열었느냐에
따라 결론이 뒤집히므로, 문제를 재기 전에 **주소부터 확인한다** (2026-08-01 실측).

`-apptive`는 브라우저에 Vercel 세션이 있으면 통과되어 **만든 사람에게만 정상으로 보인다.**
심사위원·시청자는 로그인 화면으로 튕긴다. 보호를 끄지 말고 그냥 쓰지 않는다 —
같은 레포를 빌드하는 프로젝트가 둘 다 공개되면 "어느 쪽이 진짜였지"로 돌아온다.

⚠ **환경변수·Redeploy는 반드시 `-two` 프로젝트에서** 한다. `.vercel/project.json`은
`-apptive`를 가리키므로 CLI로 `vercel env`를 쓰면 **엉뚱한 프로젝트에 들어가고,
그 실패는 에러가 아니라 침묵이다.** GitHub 배포 기록에도 `-apptive`만 남는다.

## 1. 프로젝트 연결

1. https://vercel.com → **Add New… → Project**
2. **Import Git Repository** → `chip575/AI-Builder-Sprint` 선택
   (처음이면 Vercel에 GitHub 앱 설치 승인이 필요하다)
3. 설정 확인 — Next.js는 자동 감지된다:
   - Framework Preset: **Next.js**
   - Root Directory: **`./`** (소스는 `src/`에 있지만 Next가 알아서 찾는다)
   - Build Command / Output: **기본값 그대로**
   - Install Command: `pnpm install` (자동 감지)
4. **Production Branch**: `main` (Settings → Git). 층 브랜치는 자동 프리뷰 배포가 된다

## 2. 환경변수 (Settings → Environment Variables)

`.env`의 값을 그대로 옮긴다. **Production·Preview 양쪽에 넣는다.**

| 키 | 값 | 비고 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env`와 동일 | **필수** |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env`와 동일 (`sb_secret_…`) | **필수** — 서버리스에선 인메모리 폴백이 무의미하다. 요청마다 인스턴스가 갈려 세션이 유지되지 않는다 |
| `UPSTAGE_API_KEY` | `.env`와 동일 | |
| `UPSTAGE_MODE` | 평소 `mock` · **촬영·심사 기간만 `real`** | 공개 URL이라 real이면 링크를 아는 누구나 우리 크레딧을 태운다 (§6). mock이면 대화가 `"말씀 고맙습니다. {질문}"` 고정 템플릿이 된다 — **LLM이 호출조차 안 된다** |
| `MODUSIGN_MODE` | 평소 `mock` · **왕복 1건 때만 `real`** | 서식 8종은 등록·대조 완료(8/8 일치). real이면 `/api/dev/**`가 막힌다 — 그것이 곧 전환 확인용 리트머스지다(아래) |
| `NEXT_PUBLIC_DEV_UI` | 시연은 미설정 · **mock 촬영 시 `1`** | FR 배지와 `(데모) 서명 완료 시뮬레이션` 버튼을 한 플래그가 함께 묶고 있다. mock으로 촬영하면 **이 값이 없을 때 서명 완료를 진행시킬 방법이 화면에 없다** |
| `MODUSIGN_WEBHOOK_SECRET` | `.env`와 동일 | 모두싸인 콘솔의 커스텀 헤더 값과 같아야 한다 |

**모드 전환이 실제로 먹었는지 확인** (서명 소모 없음):

```
GET /api/dev/documents
  → 200            MODUSIGN_MODE=mock
  → 403 MOCK_ONLY  MODUSIGN_MODE=real   ← 전환 성공
```

모듈 최상위에서 읽으므로 **env 변경 후 Redeploy가 필수다.** 값만 바꾸고 재배포하지 않으면
이전 모드로 계속 돈다 — 이것도 에러 없이 조용하다.
| `CRON_SECRET` | 임의 문자열 | **cron 실행 인증** — 아래 참조 |
| `EVIDENCE_URL_SECRET` | 임의 문자열 | 증빙 만료 URL 서명 |

## 3. cron (리컨실러)

`vercel.json`에 이미 등록돼 있다 — **하루 1회**(03:00) `/api/cron/reconcile`.

⚠ **Hobby 플랜은 크론이 하루 1회로 제한된다.** `*/5 * * * *`를 두면 빌드가 시작되기도
전에 배포 자체가 거부되고, Deployments 목록에 실패 기록조차 남지 않는다 — 프로덕션이
옛 커밋에 멈춘 채 원인이 보이지 않는다(실제로 겪었다). 5분 주기가 필요하면 Pro 플랜이다.
시연에서는 `POST /api/cron/reconcile`을 손으로 눌러 즉시 교정을 보여준다.

⚠ **Vercel Cron은 GET으로 호출한다.** 그래서 이 라우트의 GET은
`Authorization: Bearer $CRON_SECRET`이 있으면 **실행**하고, 없으면 상태만 조회한다.
`CRON_SECRET`을 설정하지 않으면 **스케줄러가 돌아도 아무 일도 일어나지 않는다.**
(Vercel이 이 헤더를 자동으로 붙인다 — 우리가 코드에서 넣지 않는다)

## 4. 배포 후 검증

주소는 `https://ai-builder-sprint-two.vercel.app` (§0).

```
0. 배포된 커밋 확인 — 자동 배포가 안 걸릴 수 있다 (실제로 하루치 커밋이 안 올라갔다).
     화면 문구로 판정하지 말 것: 조건부 렌더 요소는 서버 HTML에 원래 없다.
     JS 청크를 뒤지거나, 새 기능의 API 응답으로 확인한다
1. 기동 로그 [mode] DATA=supabase UPSTAGE=? MODUSIGN=? 가 의도한 값인지
2. GET /api/dev/documents 로 MODUSIGN 모드 실측 (§2)
3. 로그인 — 미들웨어가 /chat·/confirm·/rewards·/doc·/vault를 막는다.
     로그인 없이 3번 이후를 시도하면 307만 보고 "배포가 깨졌다"고 오진하게 된다
4. https://…/ → 진입 문구 렌더
5. 브라우저 관통: 부산에 기부하고 싶어요 → 확인 → 답례품 → 서명 → 증빙
6. https://…/org → 차단 카운터·6단계 지표·마지막 동기화·갱신 도래 목록
7. UPSTAGE_MODE=mock 으로 E2E_BASE=https://… pnpm e2e   (원격 관통)
     ⚠ real이면 e2e가 대화를 여러 턴 돌려 실과금된다. 스크립트가 막지만
       .env 기준으로 판단하므로 배포본 모드와 다를 수 있다
```

**막히는 것과 통과하는 것을 쌍으로 잰다.** 3번에서 "로그인 없이 307"만 확인하고 끝내면
"벽이 있다"까지만 알고 "통과가 되는가"는 모른다 — 실제로 그 차이에서 오진이 났다.

왕복(실서명 1건) 절차는 `modusign/README.md` 맨 아래에 있다. 서명 **전** 인쇄 확인
4항목을 반드시 거치고, 이상하면 서명하지 말고 취소한다 — 완료까지 가면 2건을 쓴다.

## 5. 웹훅 URL

배포하면 이 주소가 확정된다:

```
https://ai-builder-sprint-two.vercel.app/api/webhooks/modusign
헤더  X-Webhook-Secret: (MODUSIGN_WEBHOOK_SECRET과 동일 값)
```

✔ 2026-08-01 실측 — 올바른 값은 200, 없거나 틀리면 401. 헤더 이름의 **대소문자는
무관**하다(HTTP 규격, `req.headers.get()`도 동일). 콘솔에 `X-Webhook-Secret`로 넣어도 된다.

⚠ 시크릿을 설정해 두고 **콘솔에 헤더를 안 넣으면 실제 웹훅이 전부 401로 거부된다.**
증상은 에러가 아니라 "서명을 기다리는 중…"에서의 정지다. 왕복 전에 위 조회로 확인한다.

터널(`cloudflared`)과 달리 **주소가 바뀌지 않는다** — 콘솔에 한 번만 등록하면 된다.
이것이 배포의 실질적 이점이다.

**첫 웹훅 페이로드 원문**은 서버 로그에 1회 찍힌다(`[webhook] 첫 페이로드 원문(마스킹):`).
`ModusignWebhookPayload`는 아직 추정이고 이 로그가 확정 근거다 — 서명 직후 바로 확인한다.
가드는 인스턴스 단위라 새 인스턴스에서 다시 찍히지만, 그 사이 다른 웹훅이 먼저 찍힐 수 있다.

## 6. 공개 노출 주의

배포되는 순간 **Upstage real 호출이 공개 URL에서 가능**해진다.

- 미들웨어가 `/chat`·`/confirm`·`/rewards`·`/doc`·`/vault`를 보호한다 —
  인증이 활성(Supabase 키 있음)이면 미인증 접근은 `/auth`로 리다이렉트된다
- 다만 **API 라우트는 미들웨어 대상이 아니다** (웹훅·cron·채점 경로를 막지 않기 위해).
  `/api/session/message`가 공개 상태이므로, 링크를 아는 사람이 우리 크레딧으로
  Solar를 태울 수 있다
- **배포 시 대응**: Upstage 콘솔 Usage를 하루 2회 확인(02.5 §5)하고, 이상 징후가 보이면
  `UPSTAGE_MODE=mock`으로 즉시 전환한다. 데모 기간이 짧아 이 운영 대응으로 충분하다고
  판단했다 — 레이트 리밋은 대회 이후 과제

## Cloudflare Workers는?

가능하지만 권하지 않는다. 우리는 Node 런타임을 가정하고 짰다 —
`crypto.timingSafeEqual`(웹훅 검증), HMAC 증빙 URL, Supabase 클라이언트.
Workers는 호환층이 있어도 완전하지 않아 **"배포 후 무엇이 조용히 다르게 도는지"**
확인에 시간이 간다. 마감 직전에 새 런타임을 검증할 이유가 없다.
Cloudflare는 **터널**로만 쓴다 (로컬 웹훅 수신).
