-- branch_proposals.status — 가지 결정 영속화 (FR-115A)
--
-- ⚠ human_review: required — RLS 관련 확인 포함. 사람 검토 후 적용 (보안 5조).
--
-- 왜 필요한가: "닫은 가지는 다시 제안하지 않는다"(거부 이력 영구 보존)가
-- 이 컬럼 없이는 프로세스 메모리에만 존재한다. 서버리스에서 인스턴스가 갈리는 순간
-- 거절했던 가지가 다시 제안되고, 그건 사용자에게 **거절이 무시된 것**으로 보인다.
-- 시연에서 그 장면이 나오면 "사용자가 정한다"는 원칙이 정면으로 깨진다.

alter table public.branch_proposals
  add column if not exists status text not null default 'PROPOSED'
    check (status in ('PROPOSED', 'OPENED', 'PENDING_RECONFIRM', 'DECLINED', 'DEFERRED')),
  add column if not exists decided_at timestamptz;

-- 같은 가지를 다시 제안하는지 판정할 때 쓰는 조회 경로
create index if not exists branch_proposals_closed_idx
  on public.branch_proposals (intent_id, branch_type)
  where status = 'DECLINED';

select public.assert_rls_enabled();
