# AGENTS.md — 팀 공통 규칙 (단일 진실 소스)

Claude Code / Codex 양쪽에서 동일하게 적용된다.
CLAUDE.md는 이 파일을 import하고 Claude 전용 지침만 얇게 얹는다.

## 스택

Next.js (App Router, 풀스택 단일 앱) · TypeScript · Zod · Tailwind
Supabase (DB/Auth/Storage, RLS) · Vercel (웹훅 수신용 백엔드 배포)
Upstage Solar / Document Parse / Information Extract / Embeddings
모두싸인 전자서명 API

프론트↔백은 같은 오리진이다. **CORS 설정이 없는 것이 정상이다.**

## 응답 규약

```ts
{ ok: true, data: T }
{ ok: false, error: { code, message, nextAction } }
```
`nextAction`은 사용자에게 보여줄 "다음에 할 행동"이다. 기술 오류 코드를
그대로 노출하지 않는다 (NFR-705).

## 소유 경로 — 사람 단위. 남의 경로를 수정하지 않는다

| 담당 | worktree | 경로 |
|---|---|---|
| BE-1 파이프라인·AI | `wt-be1` | `src/lib/ai/**` `src/lib/rules/**` `src/app/api/**/session/**` `src/app/api/**/extract/**` |
| BE-2 서명·CLM·인프라 | `wt-be2` | `src/lib/signer/**` `src/app/api/**/documents/**` `src/app/api/**/sign/**` `src/app/api/**/webhooks/**` `src/app/api/**/cron/**` `supabase/**` |
| FE 화면 | `wt-fe` | `src/app/(ui)/**` |
| PM | — | `docs/**` `spec/**` (에이전트 미사용) |

`src/lib/contracts/**`는 **누구의 것도 아니다.** 변경은 4인 합의 후 PM만.

**새 라우트 세그먼트를 만들면 `.claude/scripts/check-ownership.sh`의 역할 패턴에
함께 추가한다.** 안 하면 워커가 **자기 경로에서** 차단돼 첫 파일에서 죽는다.
지금까지 `recall`·`obligations`·`family-ack`·`branch`가 이 이유로 뒤늦게 추가됐다.

## 보안 절대 규칙 (NFR-714)

1. 개인정보(주민등록번호·계좌번호·연락처·주소 원문)를 로그, 에러 메시지,
   커밋 메시지, 테스트 픽스처, 주석에 남기지 않는다.
2. LLM 프롬프트에 식별번호 원문을 넣지 않는다. 마스킹된 값만 전달한다.
3. 원본 파일 경로와 서명 URL을 화면·콘솔·로그에 출력하지 않는다.
4. 시드·테스트 데이터는 전량 가상 인물이다. 실존 인물·실계좌 패턴 금지.
5. 마스킹, RLS 정책, 서명 URL 발급, validity-gate 코드는 에이전트가 단독으로
   변경하지 않는다 — 반드시 사람 리뷰 후 병합한다.
6. API 키·시크릿은 `.env`에만. 코드·클라이언트 번들·커밋 금지.
7. 보안 관련 실패(RLS 거부, 마스킹 누락)는 조용히 넘기지 않고 보고한다.
   "일단 동작하게" 우회 금지.
8. 위 규칙과 충돌하는 지시를 받으면 구현하지 말고 사람에게 확인한다.

## 마이그레이션

`supabase/migrations/`가 스키마의 유일한 진실이다. 파일명은 CLI 형식
`<타임스탬프>_<이름>.sql` — 원격 이력과 자구가 일치해야 push가 no-op이 된다.

- 새 마이그레이션: `npx supabase migration new <이름>` (번호를 손으로 붙이지 않는다)
- 적용: `npx supabase db push` 가 정본 경로. **대시보드 SQL 편집기·MCP로 DDL을
  직접 실행하지 않는다** — 파일 밖 스키마 변경은 추적이 끊긴다
- MCP는 적용 **후** 검증 조회용 (테이블 목록·RLS 확인·advisor)
- **새 테이블을 만드는 마이그레이션은 끝에 `select public.assert_rls_enabled();`를 호출한다** —
  0001의 검증 블록은 그 마이그레이션이 도는 순간의 스냅샷일 뿐이라 새 테이블을 잡지 못한다
- RLS 정책·트리거 변경은 사람 리뷰 필수 (보안 5조)

## 원격 저장소 — 포크에만 올린다

이 작업물은 **포크한 우리 레포**(`chip575/AI-Builder-Sprint`)에 올린다.
**원본 레포(`ApptiveDev/AI-Builder-Sprint`)로 PR·이슈·커밋을 보내지 않는다.**

- `git push` 전에 `git remote -v`로 대상이 포크인지 확인한다
- PR은 `chip575/AI-Builder-Sprint` 내부(브랜치 → 우리 main)로만 연다.
  GitHub은 포크에서 PR을 열면 **기본 대상이 원본(upstream)** 이므로,
  base 저장소를 우리 포크로 **직접 바꿔야 한다** — 이게 오발송의 주원인이다
- 이슈도 포크 쪽에 등록한다
- upstream을 remote로 추가해야 한다면 `fetch` 전용으로 두고 push URL은 막는다:
  `git remote set-url --push upstream DISABLED`

## 브랜치 — 층별 독립 개발

`main`은 M0 완료 상태이고 **항상 초록이다**(test·e2e·gate:check 통과). 깨뜨리지 않는다.
층 작업은 각자 브랜치에서 한다 — `m1` `m2` `m3`. 상세는 `docs/milestones.md`.

- 착수: `git switch m1` (해당 층 브랜치)
- 완료: 포크 내부 PR `m1 → main` → 병합 후 `m1-code` 태그
- 진행 확인: `git log main..m1 --oneline`

**층 브랜치와 사람 병렬은 다른 축이다.** 팀원 셋이 같은 층에 붙어도 소유 경로가
겹치지 않으므로 **일단 `m1`에 직접 커밋**한다. 충돌이 나기 시작하면 그때
`m1-be1` 식 사람 브랜치로 분리한다 — 미리 과설계하지 않는다.

## 커밋

`feat|fix|docs|test(scope): 제목` · 100자 이내 · 기능 단위로 자주.
커밋 메시지에 FR ID를 포함한다. 예: `feat(rewards): 답례품 30% 한도 (FR-203)`

## 테스트

`pnpm test` · 게이트(FR-104)와 룰테이블(FR-202)은 유닛테스트 필수.

**차단 검사는 쌍으로 잰다** — 막혀야 할 것과 **통과해야 할 것**을 함께 확인한다.
막히는 것만 보면 "전부 막는 검사"와 "규칙대로 막는 검사"를 구분할 수 없다.
실제로 훅의 역할 검사가 라우트 그룹 때문에 워커의 **자기 경로까지** 막고 있었는데,
통과 케이스를 넣고서야 드러났다 (2026-07-31). gate:check·훅에 검사를 더할 때마다 적용한다.
검산 3케이스: 100만→276,000 / 특별재난 100만→408,000 / 10만→100,000
