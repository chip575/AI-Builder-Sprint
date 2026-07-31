브랜치: m3

M-FAMILY-ACK 구현 (FR-554) — 가족 인지 확인 서명.

## 핵심 원칙 (본문·화면 문구에 반드시 반영)
- 가족 서명은 **동의가 아니라 인지**다. "동의" 표현 금지.
- 유류분 등 법적 권리에 영향 없음을 명시.
- 본인이 통지 대상을 지정하고, **통지하지 않을 자유도 보장** (P4).
- 가족이 거부해도 본인 확인서 효력은 유지되고, 거부 사실만 기록된다.

## 스키마 (파일 작성만, db push 금지)
supabase/migrations/<타임스탬프>_family_ack.sql
- family_acks: ledger_node_id FK, recipient_name, relation,
  status CHECK(PENDING|ACKNOWLEDGED|DECLINED),
  signed_at NULL, declined_reason NULL, notified_at
- enable row level security, 정책 없음 (D-18)
- 파일 끝에 select public.assert_rls_enabled();

## 구현 (인메모리 StorePort 우선, Supabase 어댑터도 작성)
- POST /api/family-ack { ledgerNodeId, recipientIds[] } — 빈 배열 허용(통지 안 함)
- MATERIAL 노드 확정 시 본인 → 가족 순차 요청
- 가족 열람 뷰: 변경 내용 + 본인의 change_reason 함께 표시
- 거부 시 사유 입력 (선택) → 노드에 기록만, 본인 확인서는 ACTIVE 유지
- 타임라인 화면에 인지 상태 표시 (대기/확인/거부)

## 실서명 연동
서식 FAMILY_ACK 템플릿이 등록돼 있으면 realSigner로, 없으면 mock으로 동작.
템플릿 미등록 시 조용히 실패하지 말고 "어떤 env를 설정해야 하는지" 알리며 실패
(기존 realSigner 패턴 유지).
다자 서명 순서는 state-machine.ts 한 곳에서만 다룬다 — 두 벌 금지.

## 테스트
1. 가족 거부 → 본인 확인서 status ACTIVE 유지 + 거부 사실 기록
2. recipientIds 빈 배열 → 노드 유효, 인지 요청 0건
3. 화면·본문 문구에 "동의" 어휘 부재 (문자열 검사)
4. 가족 열람 시 change_reason이 포함되는지
5. 본인 서명 전 가족에게 요청이 가지 않는지 (순차 보장)

## 금지
- db push / 계약 변경 / lib/rules 수정
- 다자 서명 로직을 state-machine.ts 밖에 새로 만들지 말 것

## 완료 조건
pnpm test && pnpm typecheck && pnpm gate:check 통과 → 커밋
하나라도 실패하면 커밋하지 말고 종료
