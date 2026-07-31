-- M-FAMILY-ACK — 가족 인지 확인 (FR-554)
--
-- ⚠ human_review: required — RLS enable 포함. 사람 검토 후 적용 (보안 5조).
--
-- 이 표의 이름과 컬럼이 성격을 규정한다:
--   [1] `ack`(인지)이지 `consent`(동의)가 아니다. 가족의 서명은 뜻을 **알았다**는
--       기록이지 승인이 아니다. 유류분 등 법적 권리에 아무 영향이 없다.
--   [2] DECLINED는 본인 확인서를 무효로 만들지 않는다 — 거부 **사실만** 남는다.
--       가족이 거부하면 유언이 흔들리는 구조였다면, 그건 본인의 뜻이 아니라
--       가족의 뜻을 기록하는 시스템이다.
--   [3] 통지 대상이 0명이어도 정상이다. 알리지 않을 자유가 본인에게 있다 (P4).
--       그래서 이 표에 행이 없는 원장 노드가 결함이 아니다.

create table public.family_acks (
  id              uuid primary key default gen_random_uuid(),
  ledger_node_id  uuid not null references public.intent_ledger_nodes(id),
  -- 통지 대상. 연락처 원문은 두지 않는다 — 발송은 서명 서비스가 하고
  -- 우리는 "누구에게 알렸는가"만 안다 (NFR-714 1조)
  recipient_id    uuid not null,
  recipient_name  text not null,
  relation        text not null,
  status          text not null default 'PENDING'
    check (status in ('PENDING', 'ACKNOWLEDGED', 'DECLINED')),
  notified_at     timestamptz not null default now(),
  signed_at       timestamptz,
  -- 거부 사유는 선택이다. 이유를 대야만 거부할 수 있으면 그건 거부권이 아니다
  declined_reason text,
  created_at      timestamptz not null default now(),
  -- 같은 사람에게 같은 노드로 두 번 요청하지 않는다 (재발송은 상태 갱신)
  unique (ledger_node_id, recipient_id)
);

create index family_acks_by_node on public.family_acks (ledger_node_id);

-- ── RLS — enable, 정책 없음 = 클라이언트 전면 차단 (D-18) ─────
alter table public.family_acks enable row level security;

-- 새 테이블을 만드는 마이그레이션은 끝에 이 한 줄을 붙인다 (AGENTS.md 마이그레이션 절)
select public.assert_rls_enabled();
