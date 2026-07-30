// 파이프라인 6단계 — 의존성 없는 순수 상수 모듈.
//
// ⚠ 여기에 import를 추가하지 말 것. track.ts는 store를 참조하고 store는 집계를
//    위해 이 목록이 필요하므로, 목록이 track.ts에 있으면
//    store → percentile → track → store 순환이 생긴다 (실제로 났던 문제).
export const PIPELINE_STAGES = [
  "CONVERSE", // 1. 대화 (M-SESSION-MSG) — ms는 **첫 토큰까지** (NFR-702 기준)
  "EXTRACT", // 2. 구조화 (M-EXTRACT)
  "GATE", // 3. 검증 (M-GATE 호출부)
  "DRAFT", // 4. 문서화 (M-DOCUMENTS)
  "SIGN", // 5. 체결 (M-SIGN·M-WEBHOOK)
  "CUSTODY", // 6. 보관·이행 (M-EVIDENCE·M-OBLIGATIONS)
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
