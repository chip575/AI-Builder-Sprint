브랜치: m3 (git checkout m3 && git merge main)

M-EVAL 구현 — 검증 픽스처 통과율 측정 (docs/decisions.md D-08 / ADR-7).

## 목적
"검증 모델을 의견이 아니라 측정으로 정했다"를 증명하는 산출물.
결과 JSON을 레포에 커밋해 재현 가능한 증거로 삼는다.

## 픽스처 12케이스 — eval/fixtures/*.json
문서 렌더링 직전 "누락·모순 검증"에 던질 대화 케이스. 각각 기대 결함 명시:
1. 금액 미언급 (기대: amount 누락)
2. 금액 모순 ("십만원" → "백만원", 정정 의사 없음)
3. 금액 정정 (명시적 "아니, 30만원으로") — 결함 아님, 최신값 채택 확인
4. 기부처 미언급
5. 기부처 모순 (부산 → 대구, 정정 의사 없음)
6. 정기후원인데 기간 없음
7. 기간 역전 (종료일 < 시작일)
8. 거주지 = 기부처 (고향사랑기부 불가)
9. 답례품 한도 초과 조합
10. 수증자 모순 (유산기부에서 두 기관을 서로 배타적으로 지정)
11. 결함 없음 — 정상 케이스
12. 결함 없음 — 정상 케이스 2 (거짓 양성 확인용)

픽스처는 전량 가상 인물·가상 금액 (NFR-714 4조).

## 실행기 — eval/run.mjs
- UPSTAGE_MODE=real → Solar reasoning_effort=high 로 검증 호출
- UPSTAGE_MODE=mock → 스킵하고 "키 없음"으로 기록 (에러 아님, NFR-707)
- 각 케이스: 기대 결함을 감지했는가 → pass/fail
- 거짓 양성도 실패로 집계 (11·12에서 결함을 만들어내면 fail)
- eval/results.json 기록:
  { runAt, model, mode, total, passed, rate,
    falsePositives, cases: [{ id, expected, detected, pass }] }
- package.json에 "eval": "node eval/run.mjs"
- 재실행 가능해야 한다 — 같은 픽스처로 몇 번을 돌려도 동작

## 판정
통과율 출력. 팀 임계(9/10 상당) 미달이면 콘솔 경고만.
모델 전환은 사람이 결정한다 — 스크립트가 자동으로 바꾸지 않는다.

## 테스트
- 픽스처 12개가 전부 스키마를 만족하는지
- mock 모드에서 실행이 에러 없이 끝나는지
- results.json이 유효한 JSON이고 필수 키를 갖는지

## 금지
- db push 금지
- src/lib/contracts, src/lib/rules 수정 금지 (필요하면 종료)
- 게이트·룰테이블 로직 변경 금지 — eval은 읽기만
- 실 API 키를 로그·결과 JSON에 남기지 않는다

## 완료 조건
pnpm test && pnpm typecheck && pnpm gate:check 통과 + pnpm eval 성공 → 커밋
하나라도 실패하면 커밋하지 말고 종료
