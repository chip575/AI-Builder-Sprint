-- 20260729165235_harden_function_search_path.sql
-- Supabase security advisor(WARN: function_search_path_mutable) 대응.
-- 가변 search_path는 호출자가 자기 스키마를 앞세워 함수 내부의 객체 참조를
-- 가로챌 수 있게 한다. service role만 호출한다 해도 고정해 두는 것이 표준이다.
--
-- 남은 advisor INFO 5건(rls_enabled_no_policy: webhook_events·audit_logs·
-- gate_verdicts·pipeline_metrics·obligations)은 **의도된 설계**다 —
-- "정책 없음 = 클라이언트 전면 차단, 서버(service role)만 접근" (D-18).
alter function public.forbid_mutation() set search_path = public, pg_temp;
alter function public.utterances_guard() set search_path = public, pg_temp;
alter function public.save_fact(uuid, uuid, text, jsonb, numeric, jsonb)
  set search_path = public, pg_temp;
