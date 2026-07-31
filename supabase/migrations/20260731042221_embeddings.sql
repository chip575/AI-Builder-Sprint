-- M-EMBEDDINGS — 세션 회상 검색 (02.5 §3 · D-07)
--
-- ⚠ human_review: required — RLS enable 포함. 사람 검토 후 적용 (보안 5조).
--
-- 왜 필요한가: 축의 세션 간격은 며칠에서 몇 달이다. "지난번엔 어머니 이야기를
-- 하셨어요"(FR-110)와 마음 유언 문단의 근거 발화 연결(FR-111)을 최근 N개 요약으로
-- 하면, 간격이 벌어지는 순간 연속성이 끊긴다. 기간 무관 관리를 성립시키는 장치다.

create extension if not exists vector;

-- 차원 4096 — **추측이 아니라 실측**이다.
--   POST https://api.upstage.ai/v1/embeddings  model=embedding-passage
--   응답 data[0].embedding.length = 4096 (2026-07-31 확인)
-- 문서를 읽고 적는 대신 한 번 호출해 재보는 편이 빠르고 틀리지 않는다.
create table public.utterance_embeddings (
  utterance_id uuid primary key references public.utterances(id),
  intent_id    uuid not null references public.intents(id),
  embedding    vector(4096) not null,
  created_at   timestamptz not null default now()
);

create index utterance_embeddings_by_intent
  on public.utterance_embeddings (intent_id);

-- ⚠ ANN 인덱스(ivfflat·hnsw)를 만들지 않는다 — **만들 수 없다**.
--    pgvector의 두 인덱스는 2000차원 상한이 있고 우리 벡터는 4096이다.
--    (halfvec도 4000이 상한이라 해당되지 않는다)
--    대신 순차 스캔 + `<=>` 연산자로 검색한다. 한 사람의 발화 수는 수백 단위라
--    이 규모에서는 순차 스캔이 충분하고, 정확도는 오히려 더 높다.
--    발화가 수만 건이 되면 차원 축소나 별도 검색 엔진을 검토할 일이지
--    지금 인덱스를 억지로 만들 일이 아니다.

-- 검색 RPC — 유사도 계산을 DB에서 한다. 벡터를 앱으로 끌어와 정렬하면
-- 발화 수만큼 4096개 실수를 네트워크로 나른다.
-- ⚠ search_path를 고정한다 (0003 harden과 같은 이유)
create or replace function public.search_utterances(
  p_intent_id uuid,
  p_query     vector(4096),
  p_k         int
)
returns table (
  utterance_id uuid,
  intent_id    uuid,
  text         text,
  spoken_at    timestamptz,
  score        double precision
)
language sql
stable
-- security definer를 쓰지 않는다 — 테이블을 "정책 없음 = 차단"으로 막아놓고
-- 함수가 definer로 돌면 그게 옆문이 된다 (save_fact와 같은 판단, 0002 참조).
-- invoker + service role로 충분하다.
security invoker
set search_path = public, pg_temp
as $$
  select u.id, u.intent_id, u.text, u.spoken_at,
         -- <=> 는 코사인 거리다. 유사도는 1 - 거리 (계약이 [0,1]을 요구한다)
         greatest(0, least(1, 1 - (e.embedding <=> p_query)))
  from public.utterance_embeddings e
  join public.utterances u on u.id = e.utterance_id
  where e.intent_id = p_intent_id
    -- 지운 이야기는 검색으로 되살아나지 않는다 (D-10)
    and u.deleted_at is null
  order by e.embedding <=> p_query
  limit p_k;
$$;

-- 실행 권한 회수 — 없으면 PostgREST로 노출돼 클라이언트가 남의 발화를 검색할 수 있다
revoke execute on function public.search_utterances(uuid, vector, int)
  from public, anon, authenticated;

-- ── RLS — enable, 정책 없음 = 클라이언트 전면 차단 (D-18) ─────
alter table public.utterance_embeddings enable row level security;

select public.assert_rls_enabled();
