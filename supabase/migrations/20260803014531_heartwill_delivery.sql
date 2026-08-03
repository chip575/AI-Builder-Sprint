-- 마음 유언 전달 설정 (FR-112)
--
-- "언제, 누구에게 전할지"를 남겨 둔다. **이 서비스가 하는 일이 그것이다** —
-- 뜻을 기록하는 것. 실제 발송은 별개 층이고, 지금 준비된 것과 아닌 것이 갈린다:
--   · SCHEDULED  — 날짜가 오면 보낸다. 약속(obligations)·크론이 이미 있다
--   · IMMEDIATE  — 지금 보낸다. 유가족 통지 경로가 아직 없다
--   · POSTHUMOUS — 떠나신 뒤에. **사망 확인 절차가 설계되지 않았다**
-- 그래서 이 표는 **설정을 보관**하고, 무엇이 아직 안 되는지는 화면이 말한다.
-- 저장조차 안 해 두면 사용자의 뜻이 아무 데도 안 남는다.

-- 문서당 한 벌. 마음 유언 문서는 intent당 하나라 자연스럽게 사람당 한 벌이 된다
create table public.heart_will_delivery (
  document_id   uuid primary key references public.heart_will_documents(id),
  reveal_policy text not null default 'POSTHUMOUS'
    check (reveal_policy in ('IMMEDIATE', 'SCHEDULED', 'POSTHUMOUS')),
  -- SCHEDULED일 때만 의미가 있다. 다른 정책에서 값이 남아 있으면 혼란스러우므로
  -- 라우트가 함께 비운다 (제약으로 강제하지 않는 이유: 정책을 오갈 때 값을 잃는다)
  reveal_at     timestamptz,
  -- 받으실 분 — recipients를 가리킨다. 배열로 두는 이유는 여러 분께 같은 글이
  -- 가기 때문이고, 순서에는 의미가 없다
  recipient_ids uuid[] not null default '{}',
  updated_at    timestamptz not null default now()
);

alter table public.heart_will_delivery enable row level security;

-- 정책을 만들지 않는다 = 클라이언트 전면 차단 (D-18).
-- 접근은 서비스 롤을 쓰는 라우트만 하고, 소유 필터는 라우트 코드가 명시한다.

-- 새 테이블은 RLS 검증을 직접 호출한다 (AGENTS.md 마이그레이션 절)
select public.assert_rls_enabled();
