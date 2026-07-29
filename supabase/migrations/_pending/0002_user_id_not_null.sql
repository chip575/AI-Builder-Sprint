-- 0002 (대기) — M-AUTH 완료 직후 supabase/migrations/로 옮겨 적용한다.
-- ⚠ human_review: required. 근거: docs/decisions.md D-18 검토 (2026-07-29).
--
-- 전제: 0001부터 서버 코드는 user_id에 NULL 대신 DEV_USER_ID
--   ('00000000-0000-4000-8000-0000000000de')를 넣는다 — 그래서 이 파일이 짧다.
-- FK를 0001에서 못 건 이유: M-AUTH 전에는 auth.users에 해당 유저가 없어 FK 위반.

-- 1) 개발 데이터 정리 — DEV_USER_ID 행을 실 유저로 이관하거나 삭제 (팀 판단)
-- delete from public.intents where user_id = '00000000-0000-4000-8000-0000000000de';

-- 2) 제약
alter table public.intents alter column user_id set not null;
alter table public.intents
  add constraint intents_user_fk foreign key (user_id) references auth.users (id);
