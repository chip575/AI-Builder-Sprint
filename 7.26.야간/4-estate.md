브랜치: m4 (git checkout m4 2>/dev/null || git checkout -b m4 main)
먼저 git merge main 으로 최신화한다.

M4 ESTATE 가지 구현 (FR-401~405).

## 이 층의 의미
"가지 추가 비용 ≈ 템플릿 1개"라는 주장을 실제로 증명하는 층이다.
파이프라인(대화→구조화→게이트→문서→체결→보관)을 그대로 재사용하고,
새로 만드는 것은 인벤토리 데이터 모델과 화면뿐이어야 한다.
파이프라인 코드를 고쳐야 한다면 그 자체가 설계 결함 신호이므로 종료하고 보고.

## 스키마 (파일 작성만, db push 금지)
- assets: user_id, category CHECK(부동산|금융|보험|증권|채무|물건|디지털),
  name, detail jsonb, masked_identifier, beneficiary_id NULL, story text NULL,
  source_document_path NULL, extraction_confidence NULL
- beneficiaries: user_id, name, relation, contact
- custodians: user_id, name, contact, agreement_draft_id, granted_at NULL,
  view_scope jsonb (카테고리 단위 — NFR-713)
- 식별번호 원문 컬럼 없음 (NFR-712) — masked_identifier만
- enable RLS, 정책 없음 + 파일 끝에 select public.assert_rls_enabled();

## 구현
- FR-401 업로드 판독: 기존 M-PAPER-SCAN의 DP+IE 파이프라인 재사용
  (새로 만들지 말 것 — 문서 유형별 IE 스키마만 추가)
  전송 전 외부 고지 + 주민번호 감지 경고 (NFR-711)
- FR-402 인벤토리: 카테고리별 집계, 낮은 confidence 강조
  채무 존재 시 상속포기·한정승인 3개월 안내
- FR-403 디지털 유산: 삭제/보존/이전 필수 선택 → NON_BINDING 문서
- FR-404 수증자 매핑 + "물건의 이야기" 한 문단 (선택, 강제 아님)
- FR-405 Custodian 협조 약정: 서명 완료 전 열람 차단,
  열람권은 카테고리 단위 (NFR-713), 서식 있으면 real 아니면 mock

## 테스트
1. 미서명 Custodian이 인벤토리 조회 → 거부 + 시도 기록
2. 부동산만 허용된 Custodian이 금융 조회 → 거부
3. 디지털 계정 처리 방식 미선택 → 저장 거부
4. 디지털 유산 지시서 → 게이트가 NON_BINDING 반환, 서명 단계 없음
5. 채무 등록 시 3개월 안내 노출
6. 업로드 저장 후 DB에 식별번호 원문 부재

## 금지
- db push / 계약 변경 없이 진행 (필요하면 종료하고 보고)
- 파이프라인 코드(session·extract·gate·documents·sign) 수정 금지
  — 수정이 필요하다는 것은 "가지 추가 비용 = 템플릿 1개"가 거짓이라는 뜻

## 완료 조건
pnpm test && pnpm typecheck && pnpm gate:check 통과 → 커밋
하나라도 실패하면 커밋하지 말고 종료
