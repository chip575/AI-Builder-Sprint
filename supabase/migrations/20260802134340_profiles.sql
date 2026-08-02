-- M-PROFILE — 마이페이지 (FR-501 · NFR-714)
--
-- 왜 auth.users.user_metadata가 아니라 우리 테이블인가:
--   여기 값은 **계약서에 인쇄된다**(성명·연락처). user_metadata는 Supabase 설계상
--   사용자가 자기 토큰으로 직접 고칠 수 있는 자리라, 앱이 신뢰해 서면에 찍는 값을
--   두기엔 헐겁다. 보존·감사·삭제를 우리가 통제해야 한다.
--
-- 연락처는 개인정보다. 저장은 하되 로그·에러·LLM 프롬프트에는 나가지 않는다 (보안 1조·2조).

create table public.profiles (
  -- auth.users.id. FK는 0002가 intents에 걸 때 함께 본다 — 여기서 먼저 걸면
  -- 인증 비활성(키 없는 채점 경로) 환경의 DEV_USER_ID가 막힌다
  user_id      uuid primary key,
  -- 서식의 성명 칸. 비우면 라우트가 이메일 앞부분을 쓴다
  display_name text,
  -- 서식의 연락처 칸. 비우면 라우트가 이메일을 쓴다 — 빈칸으로 서명되지 않게
  contact      text,
  -- 자주 쓰는 기관명. 개인정보가 아니라 대화로도 받지만 반복을 던다
  org_name     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 정책을 만들지 않는다 = 클라이언트 전면 차단 (D-18).
-- 접근은 서비스 롤을 쓰는 라우트만 하고, 소유 필터는 라우트 코드가 명시한다.

-- 새 테이블은 RLS 검증을 직접 호출한다 — 0001의 검증 블록은 그때의 스냅숏이라
-- 나중에 생긴 테이블을 잡지 못한다 (AGENTS.md 마이그레이션 절)
select public.assert_rls_enabled();
