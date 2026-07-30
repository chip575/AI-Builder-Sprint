-- M-HEARTWILL — 마음 유언(살아있는 유서) 스키마 (FR-111 · FR-112)
--
-- ⚠ human_review: required — RLS enable·append-only 트리거 포함. 사람 검토 후 적용 (보안 5조).
--
-- 설계 결정 세 가지가 이 파일의 형태를 정했다:
--   [1] 문단이 행이다. 버전을 jsonb 통짜로 저장하지 않는다 — 승인·근거 연결·
--       AI/사용자 구분이 전부 문단 단위이기 때문이다 (FR-111).
--   [2] 근거 없는 문단은 만들 수 없다. source_utterance_id가 NOT NULL이다.
--       "AI가 지어낸 문장"이 문서에 들어갈 자리를 스키마에서 없앤다 (P1).
--   [3] is_binding 같은 컬럼은 두지 않는다. NON_BINDING은 설정이 아니라 정의다 —
--       컬럼으로 두면 언젠가 true가 되고, 그 순간 "설정에 따라 효력이 생기는 유언"이
--       된다. 효력 판정은 validity-gate가 한다 (민법 §1066).

-- ── heart_will_documents — Intent당 마음 유언 1건 ─────────────
create table public.heart_will_documents (
  id         uuid primary key default gen_random_uuid(),
  intent_id  uuid not null references public.intents(id),
  created_at timestamptz not null default now(),
  unique (intent_id)
);

-- ── heart_will_versions — 버전 체인. append-only (FR-111) ─────
-- 이전 버전을 보존한다. 갱신이 아니라 새 행 + prev_version_id 연결이다 —
-- M3 스냅샷 봉인이 이 체인 위에 붙는다.
create table public.heart_will_versions (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references public.heart_will_documents(id),
  prev_version_id uuid references public.heart_will_versions(id),
  created_at      timestamptz not null default now()
);
create trigger heart_will_versions_append_only
  before update or delete on public.heart_will_versions
  for each row execute function public.forbid_mutation();

-- 한 버전에서 뻗어나온 버전이 둘이면 어느 쪽이 현재인지 판정 불가가 된다.
-- 체인은 선형이어야 한다 (분기는 M3 원장의 일이지 유서의 일이 아니다).
create unique index heart_will_versions_linear
  on public.heart_will_versions (prev_version_id)
  where prev_version_id is not null;

-- ── heart_will_paragraphs — 문단이 행이다 ────────────────────
create table public.heart_will_paragraphs (
  id                  uuid primary key default gen_random_uuid(),
  version_id          uuid not null references public.heart_will_versions(id),
  ord                 int  not null,
  body                text not null,
  -- AI 문장과 사용자 문장을 화면에서 다르게 보여주기 위한 구분 (P1의 화면 증거).
  -- USER_EDITED는 AI 초안을 사용자가 고친 것 — 고친 순간 사용자의 문장이 된다.
  origin              text not null
    check (origin in ('AI_DRAFT', 'USER_EDITED', 'USER_WRITTEN')),
  -- 근거 발화. NOT NULL — 문서의 모든 문단은 원문을 참조한다 (FR-111).
  -- utterances는 물리 삭제가 없고 소프트 삭제만 있으므로 FK가 끊기지 않는다 (D-10).
  source_utterance_id uuid not null references public.utterances(id),
  -- NULL이 기본이다. 사용자가 승인해야 문서에 반영된다 (P1) —
  -- 애플리케이션이 잊어도 기본값이 미승인이므로 조용히 반영되는 경로가 없다.
  accepted_at         timestamptz,
  created_at          timestamptz not null default now(),
  unique (version_id, ord)
);

-- 미결(D-18 부록): 삭제된 발화를 근거로 가진 문단의 처리.
--   후보 ① 문단을 "고아"로 표시하고 화면에서 근거 없음을 알린다
--   후보 ② 근거 삭제 시 해당 문단 삭제를 사용자에게 제안한다
-- 지금 고르지 않는다 — 어느 쪽이든 사용자의 삭제권 해석이 걸려 있어 사람이 정해야 한다.

-- ── RLS — 전 테이블 enable, 정책 없음 = 클라이언트 전면 차단 (D-18) ──
-- 서버는 service role + user_id 명시 필터로 접근한다.
alter table public.heart_will_documents  enable row level security;
alter table public.heart_will_versions   enable row level security;
alter table public.heart_will_paragraphs enable row level security;

-- ── RLS 자기검증 ─ 함수로 빼둔다 ──────────────────
-- 0001의 DO 블록은 **그 마이그레이션이 도는 순간의 스냅샷 검사**일 뿐이다.
-- 새 테이블은 그때 존재하지 않았으므로 검사되지 않는다. 매번 복붙하면 언젠가 빠지므로
-- 함수로 둔다 — 이후 마이그레이션은 끝에 한 줄만 붙이면 된다 (AGENTS.md 마이그레이션 절).
create or replace function public.assert_rls_enabled() returns void
language plpgsql as $$
declare t record;
begin
  for t in select tablename from pg_tables
           where schemaname = 'public' and not rowsecurity
  loop
    raise exception 'RLS 미적용 테이블: %', t.tablename;
  end loop;
end $$;

select public.assert_rls_enabled();
