# 배포 (Vercel) — 필요해질 때 30분

> **필요 여부**: 대회 공지의 제출물은 "**데모 영상/배포 링크**, 코드 저장소, 발표 자료,
> AI 활용 증빙"이다. 슬래시는 둘 중 하나로 읽히므로 **데모 영상이 있으면 배포는
> 선택**일 가능성이 높다. 최종 근거는 제출 양식 원문이다 — 확인 후 결정한다.
> 이 문서는 "필요하다"로 판정될 때 바로 실행하기 위한 준비다.

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
| `UPSTAGE_MODE` | `real` | |
| `MODUSIGN_MODE` | `mock` | 서식 8종 등록 전까지. real로 켜면 `/api/dev/**`가 막혀 데모 시뮬 버튼이 죽는다 |
| `MODUSIGN_WEBHOOK_SECRET` | `.env`와 동일 | 모두싸인 콘솔의 커스텀 헤더 값과 같아야 한다 |
| `CRON_SECRET` | 임의 문자열 | **cron 실행 인증** — 아래 참조 |
| `EVIDENCE_URL_SECRET` | 임의 문자열 | 증빙 만료 URL 서명 |

## 3. cron (리컨실러)

`vercel.json`에 이미 등록돼 있다 — 5분마다 `/api/cron/reconcile`.

⚠ **Vercel Cron은 GET으로 호출한다.** 그래서 이 라우트의 GET은
`Authorization: Bearer $CRON_SECRET`이 있으면 **실행**하고, 없으면 상태만 조회한다.
`CRON_SECRET`을 설정하지 않으면 **스케줄러가 돌아도 아무 일도 일어나지 않는다.**
(Vercel이 이 헤더를 자동으로 붙인다 — 우리가 코드에서 넣지 않는다)

## 4. 배포 후 검증

```
1. 기동 로그에서 [mode] DATA=supabase UPSTAGE=real MODUSIGN=mock 확인
2. https://<도메인>/ → "무엇을 남기고 싶으세요?" 렌더
3. 브라우저 관통: 부산에 기부하고 싶어요 → 확인 → 답례품 → 서명 → 증빙
4. https://<도메인>/org → 견고성 3종 세트가 숫자를 보이는지
5. E2E_BASE=https://<도메인> pnpm e2e   (원격 대상 관통)
```

## 5. 웹훅 URL

배포하면 이 주소가 확정된다:

```
https://<도메인>/api/webhooks/modusign
헤더  x-webhook-secret: (MODUSIGN_WEBHOOK_SECRET과 동일 값)
```

터널(`cloudflared`)과 달리 **주소가 바뀌지 않는다** — 콘솔에 한 번만 등록하면 된다.
이것이 배포의 실질적 이점이다.

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
