-- M-ESTATE — 자산정리 가지 인벤토리 (FR-401 · FR-402 · FR-404 · FR-405)
--
-- ⚠ human_review: required — RLS enable 포함. 사람 검토 후 적용 (보안 5조).
-- ⚠ 파일명 시각을 손으로 정했다. CLI가 준 값(...064226)이 이미 있는
--    20260731070000_branch_proposal_status.sql보다 앞서서 순서가 뒤집혔기 때문이다.
--    자구는 CLI 형식(<타임스탬프>_<이름>.sql) 그대로다.
--
-- 이 표들이 규정하는 성격:
--   [1] 채무(DEBT)는 별도 표가 아니라 assets의 한 category다. 상속은 채무도 승계하므로
--       목록을 분리하면 한정승인 안내(FR-402)가 두 표를 가로질러야 한다.
--   [2] **식별번호 원문 컬럼이 없다** (NFR-712). masked_identifier 하나뿐이고,
--       원문을 담을 자리를 아예 만들지 않는 것이 유일하게 믿을 수 있는 방어다 —
--       컬럼이 있으면 언젠가 채워지고, 마스킹을 잊는 경로가 반드시 하나는 생긴다.
--   [3] confirmed의 기본값은 false다 (P1). 판독해 넣은 값이 사용자 승인 없이
--       확정된 것처럼 보이는 상태를 스키마 차원에서 없앤다.
--   [4] beneficiaries에 연락처·주소가 없다. 통지가 필요하면 recipient_id로 참조한다 —
--       family_acks와 같은 규약이다 (NFR-714 1조).

-- 수증자 — assets가 참조하므로 먼저 만든다 (FR-404)
create table public.beneficiaries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  name         text not null,
  -- "장녀", "조카" — 표시용이다. 법정상속분 판정에 쓰지 않는다
  relation     text not null,
  -- 통지가 필요할 때만 참조한다. 연락처 원문은 우리가 갖지 않는다
  recipient_id uuid,
  created_at   timestamptz not null default now()
);

create index beneficiaries_by_user on public.beneficiaries (user_id);

create table public.assets (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,
  -- 7종 고정. 자구는 contracts/estate.ts의 AssetCategory와 **한 글자도 다르지 않다**
  category            text not null
    check (category in ('REAL_ESTATE', 'FINANCIAL', 'INSURANCE', 'SECURITIES',
                        'DEBT', 'BELONGINGS', 'DIGITAL')),
  -- 표시명. 소재지 원문·계좌 원문을 담는 자리가 아니다
  label               text not null,
  -- 마스킹된 값만. 어댑터가 저장 직전에 다시 마스킹한다 (lib/store/mask.ts)
  masked_identifier   text,
  -- 본인 신고 추정액. 부호 없는 크기이고 채무도 양수로 담는다 —
  -- 합산에서 분리하는 것은 조회 계층의 일이다. 상속세 계산에 쓰지 않는다 (FR-304)
  estimated_value_krw bigint check (estimated_value_krw is null or estimated_value_krw >= 0),
  origin              text not null check (origin in ('OCR', 'MANUAL')),
  confidence          numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- 기본값 false — 확정은 사용자의 행위다 (P1)
  confirmed           boolean not null default false,
  beneficiary_id      uuid references public.beneficiaries(id) on delete set null,
  -- "왜 그 사람에게 주는지" 한 문단. 비어 있어도 저장된다 — 이유를 대야만
  -- 남길 수 있으면 그건 유산 정리가 아니라 심문이다 (FR-404)
  story               text,
  -- M-PAPER-SCAN 업로드 참조. 원본 파일 경로는 담지 않는다 (보안 3조)
  source_upload_id    uuid,
  -- 디지털 유산 처리 지시 (FR-403). 디지털이 아니면 null이다.
  -- 디지털인데 비어 있는 상태는 계약(DigitalAsset)이 막는다 — 스키마에서 한 번 더 막는다
  disposition         jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint assets_disposition_only_digital check (
    (category = 'DIGITAL' and disposition is not null)
    or (category <> 'DIGITAL' and disposition is null)
  )
);

create index assets_by_user on public.assets (user_id, category);
create index assets_by_beneficiary on public.assets (beneficiary_id);

-- 지킴이 (FR-405). 유언집행자가 아니다 (00.2 §7.1 · D-09) — UI 표기는 "지킴이".
-- PENDING = 열람 0건. 서명 완료 웹훅만 ACTIVE로 올린다.
-- granted_at이 null이면 열람 권한이 없다 — 서버가 이 값으로 판정한다.
create table public.custodians (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  recipient_id       uuid not null,
  display_name       text not null,
  -- 카테고리 단위 부분 열람 (NFR-713). 빈 배열이 기본값이고 그것이 최소 권한이다
  view_scope         jsonb not null default '[]'::jsonb,
  status             text not null default 'PENDING'
    check (status in ('PENDING', 'ACTIVE', 'REVOKED')),
  agreement_draft_id uuid references public.document_drafts(id),
  granted_at         timestamptz,
  revoked_at         timestamptz,
  created_at         timestamptz not null default now(),
  -- 같은 사람을 두 번 지정하지 않는다 (재초대는 상태 갱신)
  unique (user_id, recipient_id)
);

create index custodians_by_user on public.custodians (user_id, status);

-- ── RLS — enable, 정책 없음 = 클라이언트 전면 차단 (D-18) ─────
-- 서버 라우트가 service role + 코드의 user_id 명시 필터로만 접근한다.
alter table public.beneficiaries enable row level security;
alter table public.assets        enable row level security;
alter table public.custodians    enable row level security;

-- 새 테이블을 만드는 마이그레이션은 끝에 이 한 줄을 붙인다 (AGENTS.md 마이그레이션 절)
select public.assert_rls_enabled();
