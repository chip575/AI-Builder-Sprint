-- assert_rls_enabled 굳히기 (NFR-714)
--
-- Supabase advisor WARN: "role mutable search_path".
-- search_path가 호출자에 따라 달라지면 같은 이름의 테이블을 다른 스키마에 만들어
-- 검증을 우회시킬 수 있다. 이 함수는 **RLS가 켜졌는지 확인하는 함수**라
-- 그 우회가 곧 검증의 무력화다.
--
-- ⚠ 본문은 바꾸지 않는다. 실행 환경만 고정한다.
alter function public.assert_rls_enabled() set search_path = public, pg_catalog;
