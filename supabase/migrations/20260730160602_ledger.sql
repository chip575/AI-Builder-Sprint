-- M-LEDGER — 의사 이력 원장 (FR-550~556)
--
-- ⚠ human_review: required — RLS enable·append-only 트리거 포함. 사람 검토 후 적용 (보안 5조).
--
-- 유언은 순간의 문서지만 뜻은 과정이다. 이 표가 그 과정을 담는다.
--   [1] append-only. 정정도 새 노드다 — 이력을 고칠 수 있으면 이력이 아니다.
--   [2] 해시 체인. 한 바이트만 바뀌어도 이후 전부 불일치한다 (FR-553).
--   [3] condition_note·witness는 선택이다 (D-11) — 일반 사용자에게 임상 기록을
--       강제하지 않는다. NOT NULL로 만들면 그 순간 의료 서식이 된다.

create table public.intent_ledger_nodes (
  id             uuid primary key default gen_random_uuid(),
  subject_id     uuid not null references public.intents(id),
  -- 주체별 1부터. 빈 번호가 생기면 "지워진 노드가 있다"는 뜻이 된다
  seq            int  not null,
  -- 판정은 코드(lib/ledger)가 한다. 여기서는 값만 제약한다
  materiality    text not null
    check (materiality in ('MATERIAL', 'MINOR', 'ANNOTATION')),
  change_summary jsonb not null,
  -- 본인 진술 변경 사유. 정황 봉인의 핵심이라 비워둘 수 없다 (FR-553)
  change_reason  text not null,
  condition_note text,          -- 선택 (D-11)
  witness        jsonb,         -- 선택 — 입회인 [{name, relation}]
  -- MATERIAL일 때만 의사 확인서가 붙는다 (FR-552). 문서명에 "유언"을 쓰지 않는다 (FR-551)
  draft_id       uuid references public.document_drafts(id),
  prev_hash      text,          -- 첫 노드는 null
  node_hash      text not null,
  status         text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'SUPERSEDED', 'REVOKED')),
  created_at     timestamptz not null default now(),
  unique (subject_id, seq),
  -- 같은 체인에 같은 prev_hash를 가진 노드가 둘이면 분기가 생겨
  -- "지금 유효한 뜻"을 특정할 수 없다 (FR-556 최신성)
  unique (subject_id, prev_hash)
);

-- 이력은 고쳐지지 않는다. 정정도 새 노드다.
create trigger intent_ledger_nodes_append_only
  before update or delete on public.intent_ledger_nodes
  for each row execute function public.forbid_mutation();

-- 최신성(FR-556)은 저장된 값이 아니라 **질의로 유도되는 사실**이다 —
-- 가장 큰 seq가 현재의 뜻이고, 그 앞은 전부 지나간 뜻이다.
create index intent_ledger_nodes_latest
  on public.intent_ledger_nodes (subject_id, seq desc);

-- ── RLS — enable, 정책 없음 = 클라이언트 전면 차단 (D-18) ─────
alter table public.intent_ledger_nodes enable row level security;

-- 새 테이블을 만드는 마이그레이션은 끝에 이 한 줄을 붙인다 (AGENTS.md 마이그레이션 절)
select public.assert_rls_enabled();
