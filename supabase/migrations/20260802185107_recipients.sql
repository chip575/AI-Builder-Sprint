-- M-RECIPIENT — 알릴 상대 (FR-405 · FR-112 · NFR-714)
--
-- 계약 넷(Beneficiary.recipientId · Custodian.recipientId · FamilyAckReq.recipientIds ·
-- DeliveryPatch.recipientIds)이 참조하던 실체가 없어서, 통지가 필요한 기능이 전부
-- 앞에서 멈춰 있었다. 이 테이블이 그 넷을 동시에 푼다.
--
-- ⚠ 이메일은 개인정보다 (보안 1조). 여기 저장하되 로그·에러·LLM 프롬프트에 원문을
--   내보내지 않는다. 화면 표시는 마스킹한다.
-- ⚠ 주민등록번호·주소·계좌는 담지 않는다. 통지에 필요한 최소치만 갖는다.

create table public.recipients (
  id         uuid primary key default gen_random_uuid(),
  -- 소유자. FK는 profiles와 같은 이유로 걸지 않는다 — 인증 비활성(키 없는) 경로의
  -- DEV_USER_ID가 auth.users에 없기 때문이다
  user_id    uuid not null,
  -- ORG(수증 기관) · FAMILY(유가족) · CUSTODIAN(지킴이).
  -- 역할이 화면 문구와 접근 권한을 가르므로 자유 문자열이 아니라 제약으로 고정한다
  kind       text not null check (kind in ('ORG', 'FAMILY', 'CUSTODIAN')),
  name       text not null,
  -- 통지가 실제로 도달하는 곳. 없으면 보낼 수 없으므로 not null
  email      text not null,
  -- "장녀", "조카" — 표시용. 법정상속분 판정에 쓰지 않는다
  relation   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 같은 사람을 두 번 등록하면 통지가 두 번 간다.
-- 역할이 다르면 별개로 둔다 — 기관 담당자가 유가족이기도 한 경우가 있다
create unique index recipients_user_kind_email_uniq
  on public.recipients (user_id, kind, lower(email));

-- 목록 조회는 항상 소유자 기준이다
create index recipients_user_idx on public.recipients (user_id, kind);

alter table public.recipients enable row level security;

-- 정책을 만들지 않는다 = 클라이언트 전면 차단 (D-18).
-- 접근은 서비스 롤을 쓰는 라우트만 하고, 소유 필터는 라우트 코드가 명시한다.

-- 새 테이블은 RLS 검증을 직접 호출한다 — 0001의 검증 블록은 그때의 스냅숏이라
-- 나중에 생긴 테이블을 잡지 못한다 (AGENTS.md 마이그레이션 절)
select public.assert_rls_enabled();
