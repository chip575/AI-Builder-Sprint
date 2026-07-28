# 남기다 (NAMGIDA)

@AGENTS.md

죽음이 구체화되는 사건을 겪었지만 아직 시간이 있는 사람이, 남기려는 마음을
대화로 정리하고 **법이 인정하는 방식으로만** 서명하며, 세션 주기와 무관하게
저장·관리·갱신하는 서비스.

- 마음 = 살아있는 유서(마음 유언, `NON_BINDING`)
- 실행 = 기부·유산·자산 약정(`ESIGN_OK`) + 자필유언 필사 가이드

## 절대 규칙 (위반 시 즉시 중단)

1. 유일한 진실은 `lib/contracts/*.ts`. 여기 없는 필드는 주고받지 않는다.
2. 법률 수치(공제율·한도·기한)는 `lib/rules/`에만 존재한다.
   LLM 프롬프트에 숫자를 넣지 않는다. `[CALC:항목]` 토큰만 사용한다.
3. AI 산출물은 `confirmed=false`로 시작한다. 사용자 승인 없이 확정 금지.
4. 유언(HANDWRITTEN_WILL) 문서 타입에 서명 버튼을 만들지 않는다 (민법 §1066).
5. 아래 경로를 수정해야 하면 **작업을 멈추고 사람에게 보고**한다:
   `lib/contracts/**`, `lib/rules/**`, `**/validity-gate*`,
   RLS 정책, 서명 URL 발급 코드
6. README·주석에 심사·평가·점수 관련 문구를 쓰지 않는다 (대회 실격 사유).

## 어디를 볼 것인가

| 필요 | 파일 |
|---|---|
| 작업 목록·계약 매핑 | `spec/manifest.yaml` ← **먼저 여기** |
| 원칙·용어 | `spec/00-constitution.md`, `spec/00.2-glossary.md` |
| 법령 수치 | `spec/00.1-rules.md` |
| FR 원문 | `spec/fr/` (필요한 파일 **1개만**) |
| 모듈 I/O 계약 | `spec/plan/02.4-contracts.md` |
| MVP 절단 순서 | `spec/03.0-mvp.md` |
| 이 프로젝트의 결정 이력 | `docs/decisions.md` |

## 읽지 말 것

`spec/_archive/` — 폐기된 옛 명세(Phase 구조, Track 용어, 데이터모델 v1).
참조 금지. 여기 내용으로 코드를 짜면 현재 설계와 충돌한다.

## 작업 종료 시 필수

`docs/ai-log.md`에 한 줄 append —
`YYYY-MM-DD | 담당 | 무엇을 AI에 맡겼고 무엇을 사람이 고쳤는지`
