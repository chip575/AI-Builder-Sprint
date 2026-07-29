-- 20260729165214_store_rpc.sql — StorePort용 함수. supabase-js upsert가 조건부 WHERE를
-- 지원하지 않아 facts의 확정 방어는 RPC로 내린다.
-- ⚠ human_review: required (보안 5조).
-- (참고: _pending/0002_user_id_not_null.sql은 M-AUTH 후 이관 시 다음 번호로 재부여)

-- ═══ 쌍둥이 주의 ═══
-- webhook_events INSERT = ON CONFLICT DO NOTHING  → 중복을 버린다 (멱등, FR-503)
-- intent_facts   INSERT = ON CONFLICT DO UPDATE   → 중복이 정정이다 (FR-102)
-- 같은 구문, 정반대 의도 — 하나를 보고 다른 하나를 "통일"하지 말 것.

-- facts UPSERT — 확정된 행은 덮지 않는다 (P1의 DB 층위 방어).
-- WHERE가 걸러낸 경우 RETURNING이 비므로, 어댑터는 빈 결과 = "확정값 보호됨"으로 읽고
-- 기존 행을 재조회한다. confidence 우선순위 비교는 SQL이 아니라 어댑터 코드가 한다
-- (SQL이 복잡해지면 인메모리와의 동형성 검증이 어려워진다 — 검토 결정).
create or replace function public.save_fact(
  p_id          uuid,
  p_intent_id   uuid,
  p_key         text,
  p_value       jsonb,
  p_confidence  numeric,
  p_source_span jsonb
) returns setof public.intent_facts
language sql as $$
  insert into public.intent_facts (id, intent_id, key, value, confidence, source_span)
  values (p_id, p_intent_id, p_key, p_value, p_confidence, p_source_span)
  on conflict (intent_id, key) do update
    set value       = excluded.value,
        confidence  = excluded.confidence,
        source_span = excluded.source_span,
        updated_at  = now()
    where public.intent_facts.confirmed_by_user = false
  returning *;
$$;

-- ⚠ 옆문 차단 — public 스키마 함수는 기본적으로 PostgREST에 노출된다.
-- 테이블을 "정책 없음 = 차단"으로 막아도 이 RPC가 열려 있으면 클라이언트가
-- 테이블을 우회해 미확정 facts를 직접 쓸 수 있다. service role만 호출한다 (D-18).
-- security definer는 쓰지 않는다 — invoker + service role로 충분하고, definer는 권한 상승만 만든다.
revoke execute on function public.save_fact(uuid, uuid, text, jsonb, numeric, jsonb)
  from public, anon, authenticated;
