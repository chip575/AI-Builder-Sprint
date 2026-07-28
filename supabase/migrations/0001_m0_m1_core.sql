-- 0001_m0_m1_core.sql — M0·M1 코어 스키마 (M2·M3 테이블은 해당 마이그레이션에서)
-- ⚠ human_review: required — RLS·append-only 트리거 포함. 사람 검토 후 적용 (보안 5조).
--
-- 검토 기준 매핑 (docs/decisions.md D-18 논의):
--   [기준1] webhook_events.external_event_id UNIQUE — 멱등성은 제약이 본질 (FR-503)
--   [기준2] intent_facts.confirmed_by_user NOT NULL DEFAULT false — P1의 스키마 강제
--   [기준3] audit_logs append-only 트리거 — RLS는 service role을 못 막는다 (NFR-704)
--   [기준4] 상태값은 TEXT + CHECK, 자구는 lib/contracts 유니온과 일치. pg enum 금지
--   [기준5] 주민번호·계좌 원문 컬럼 없음 (NFR-712) — value/parties JSONB에도 원문 금지
--   [기준6] document_drafts.gate_verdict 저장 — FR-509 게이트 카운터가 M1에서 읽는다

-- ── 공통: append-only 강제 트리거 ─────────────────────────────
create or replace function public.forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only — UPDATE/DELETE 금지 (NFR-704)', tg_table_name;
end $$;

-- ── intents — 세션 1건 = Intent 1건 (00.2 §7) ────────────────
create table public.intents (
  id          uuid primary key default gen_random_uuid(),
  -- M-AUTH(M0 마지막) 전까지 null 허용. 연결 후 NOT NULL 마이그레이션 예정
  user_id     uuid references auth.users (id),
  -- [기준4] lib/contracts/common.ts IntentKind와 자구 일치
  kind        text not null default 'BRANCH'
              check (kind in ('SPINE_SESSION', 'BRANCH')),
  started_at  timestamptz not null default now()
);

-- ── utterances — 원문 발화. 덮어쓰지 않는다 (FR-111, D-10) ───
create table public.utterances (
  id         uuid primary key default gen_random_uuid(),
  intent_id  uuid not null references public.intents (id),
  -- [기준5] 식별번호 원문 저장 금지 — 저장 직전 서버 마스킹 (NFR-712, 02.4 §0)
  text       text not null,
  spoken_at  timestamptz not null default now()
);
create index utterances_intent_idx on public.utterances (intent_id, spoken_at);

-- ── branch_proposals — 가지 제안. origin은 분석·감사용 (FR-115) ─
create table public.branch_proposals (
  id                   uuid primary key default gen_random_uuid(),
  intent_id            uuid not null references public.intents (id),
  -- [기준4] lib/contracts/common.ts BranchType와 자구 일치
  branch_type          text not null check (branch_type in
    ('DONATION_NOW','HERITAGE_SUPPORT','LEGACY_GIFT','HANDWRITTEN_WILL','ESTATE')),
  -- [기준4] BranchOrigin — EXPRESS 직행 vs AI 감지 (D-05)
  origin               text not null check (origin in ('DETECTED','EXPRESS')),
  source_utterance_id  uuid not null references public.utterances (id),
  created_at           timestamptz not null default now()
);
create index branch_proposals_intent_idx on public.branch_proposals (intent_id);

-- ── intent_facts — 구조화 추출 결과 (FR-102·FR-103) ──────────
create table public.intent_facts (
  id                   uuid primary key default gen_random_uuid(),
  intent_id            uuid not null references public.intents (id),
  key                  text not null,
  -- [기준5] 계좌·식별번호 원문 금지 — 마스킹된 값만 (NFR-712)
  value                jsonb,
  confidence           numeric not null check (confidence >= 0 and confidence <= 1),
  source_span          jsonb,          -- { utteranceId, start, end, text }
  -- [기준2] P1 — AI 산출물은 false로 태어난다. 해제는 POST /api/facts/confirm만
  confirmed_by_user    boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (intent_id, key)              -- 같은 슬롯은 최신 1건 (mock-extractor와 동일 규칙)
);

-- ── document_drafts — 게이트 통과 문서 초안 (FR-501) ─────────
create table public.document_drafts (
  id                     uuid primary key default gen_random_uuid(),
  intent_id              uuid not null references public.intents (id),
  -- [기준4] lib/contracts/common.ts DocType와 자구 일치
  doc_type               text not null check (doc_type in
    ('DONATION_PLEDGE','RECURRING_CONSENT','PRIVACY_TAX_CONSENT','VOLUNTEER_PLEDGE',
     'HERITAGE_SUPPORT_PLEDGE','LEGACY_GIFT_AGREEMENT','CUSTODIAN_AGREEMENT',
     'INTENT_AFFIRMATION','HANDWRITTEN_WILL','HEART_LETTER')),
  -- [기준6] 판정 원본 보존 — { verdict, statutes[], alternativeRoute? } (GateVerdict)
  gate_verdict           jsonb not null,
  -- Storage 경로 키. 클라이언트에는 만료형 서명 URL만 나간다 (보안 3조, D-10)
  pdf_storage_path       text,
  -- [기준4] lib/contracts/common.ts DocStatus와 자구 일치
  status                 text not null default 'DRAFT' check (status in
    ('DRAFT','REQUESTED','COMPLETED','REJECTED','CANCELED')),
  modusign_document_id   text unique,   -- 역참조 (02.3 §1 준비작업 3)
  reject_reason          text,          -- FR-506
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index document_drafts_intent_idx on public.document_drafts (intent_id);
create index document_drafts_status_idx on public.document_drafts (status, updated_at);

-- ── webhook_events — 아웃박스 (FR-503 · 02.3 §3) ─────────────
create table public.webhook_events (
  id                    bigint generated always as identity primary key,
  -- [기준1] 멱등성의 본질. INSERT는 반드시 ON CONFLICT (external_event_id) DO NOTHING
  external_event_id     text not null unique,
  event                 text not null,
  modusign_document_id  text,
  payload               jsonb not null,
  received_at           timestamptz not null default now(),
  -- 부수효과(메일·Obligation 생성)는 processed_at IS NULL 조건 안에서만 (02.3 §3)
  processed_at          timestamptz
);
create index webhook_events_unprocessed_idx
  on public.webhook_events (received_at) where processed_at is null;

-- ── evidences — 증빙 (FR-505) ────────────────────────────────
create table public.evidences (
  id                uuid primary key default gen_random_uuid(),
  draft_id          uuid not null unique references public.document_drafts (id),
  pdf_storage_path  text not null,      -- 만료형 URL 발급은 서버 코드 (15분, D-10)
  sha256            text not null,
  signed_at         timestamptz not null,
  -- [기준5] 마스킹된 표시명·역할만. 연락처 원문 금지 (NFR-712)
  parties           jsonb not null,
  created_at        timestamptz not null default now()
);

-- ── obligations — 이행 관리 (FR-508 · M1) ────────────────────
create table public.obligations (
  id          uuid primary key default gen_random_uuid(),
  -- [기준4] lib/contracts/obligations.ts ObligationKind와 자구 일치
  kind        text not null check (kind in
    ('RECURRING_RENEWAL','WILL_REVIEW','RESUME_INVITE')),
  subject_id  uuid not null,            -- draft 또는 intent
  due_at      timestamptz not null,
  fired_at    timestamptz,
  created_at  timestamptz not null default now()
);
create index obligations_due_idx on public.obligations (due_at) where fired_at is null;

-- ── audit_logs — 감사 로그. append-only (NFR-704) ────────────
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor       text not null,            -- 'user:<uuid>' | 'system:webhook' 등
  action      text not null,
  subject     text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
-- [기준3] RLS는 service role을 못 막는다 — 트리거로 차단
create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public.forbid_mutation();

-- ── gate_blocks — 게이트 차단 카운터 (FR-509 · M1) ───────────
create table public.gate_blocks (
  id          bigint generated always as identity primary key,
  doc_type    text not null,
  verdict     text not null check (verdict in ('ESIGN_INVALID','NON_BINDING')),
  statutes    jsonb not null,           -- 차단 사유·조문 (FR-509 수락 기준)
  created_at  timestamptz not null default now()
);
create trigger gate_blocks_append_only
  before update or delete on public.gate_blocks
  for each row execute function public.forbid_mutation();

-- ── pipeline_metrics — 6단계 실행 지표 (NFR-709 · M1) ────────
create table public.pipeline_metrics (
  id          bigint generated always as identity primary key,
  -- [기준4] lib/observability/track.ts PipelineStage와 자구 일치
  stage       text not null check (stage in
    ('CONVERSE','EXTRACT','GATE','DRAFT','SIGN','CUSTODY')),
  ok          boolean not null,
  ms          integer not null check (ms >= 0),
  created_at  timestamptz not null default now()
);

-- ── RLS — 전 테이블 활성. 심층방어 (D-18) ────────────────────
-- 서버 라우트는 service role + 코드의 user_id 명시 필터 (M-AUTH 전 타협, D-18).
-- 아래 정책은 클라이언트(anon/authenticated) 직접 접근 방어용.
alter table public.intents          enable row level security;
alter table public.utterances       enable row level security;
alter table public.branch_proposals enable row level security;
alter table public.intent_facts     enable row level security;
alter table public.document_drafts  enable row level security;
alter table public.evidences        enable row level security;
alter table public.obligations      enable row level security;
alter table public.webhook_events   enable row level security;
alter table public.audit_logs       enable row level security;
alter table public.gate_blocks      enable row level security;
alter table public.pipeline_metrics enable row level security;

-- 본인 소유 행만 (intents 기준, 자식은 EXISTS 연결)
create policy intents_owner on public.intents
  for select to authenticated using (user_id = auth.uid());

create policy utterances_owner on public.utterances
  for select to authenticated using (exists (
    select 1 from public.intents i
    where i.id = intent_id and i.user_id = auth.uid()));

create policy branch_proposals_owner on public.branch_proposals
  for select to authenticated using (exists (
    select 1 from public.intents i
    where i.id = intent_id and i.user_id = auth.uid()));

create policy intent_facts_owner on public.intent_facts
  for select to authenticated using (exists (
    select 1 from public.intents i
    where i.id = intent_id and i.user_id = auth.uid()));

create policy document_drafts_owner on public.document_drafts
  for select to authenticated using (exists (
    select 1 from public.intents i
    where i.id = intent_id and i.user_id = auth.uid()));

create policy evidences_owner on public.evidences
  for select to authenticated using (exists (
    select 1 from public.document_drafts d
    join public.intents i on i.id = d.intent_id
    where d.id = draft_id and i.user_id = auth.uid()));

-- webhook_events·audit_logs·gate_blocks·pipeline_metrics·obligations:
-- 정책 없음 = 클라이언트 전면 차단. 서버(service role)만 접근한다.
