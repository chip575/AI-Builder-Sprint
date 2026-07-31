-- family_acks.document_id 추가 (FR-554)
--
-- 20260731032933_family_ack.sql에서 빠뜨렸다. 가족의 응답은 별도 API가 아니라
-- **서명 웹훅**으로 들어오고(그래야 "인지했다"는 기록에 서명 근거가 붙는다),
-- 웹훅은 문서 id만 준다 — 이 컬럼이 없으면 역참조할 방법이 없다.
--
-- ⚠ 20260731052937은 빈 파일로 적용됐다(생성 명령이 중간에 멈춰 내용이 안 쓰였다).
--    이미 원격 이력에 기록됐으므로 그 파일을 고치지 않는다 — 자구가 어긋나면
--    push가 no-op이 아니게 되고 추적이 끊긴다 (AGENTS.md 마이그레이션 절).

alter table public.family_acks
  add column if not exists document_id text;

-- 웹훅 역참조용. 한 문서가 두 인지 요청에 붙을 수 없다
create unique index if not exists family_acks_document_id_idx
  on public.family_acks (document_id)
  where document_id is not null;

select public.assert_rls_enabled();
