// NFR-709 — 6단계 실행 지표(성공/실패/소요시간)의 수집 지점.
// 지금은 no-op. M-OBSERVABILITY(M1)가 적재·집계로 교체한다 — 인터페이스만 고정.
// 호출부가 M0 관통 중에 이미 심어지므로, M1에서 라우트를 다시 열 일이 없다.

export type PipelineStage =
  | "CONVERSE" // 1. 대화 (M-SESSION-MSG)
  | "EXTRACT"  // 2. 구조화 (M-EXTRACT)
  | "GATE"     // 3. 검증 (M-GATE 호출부)
  | "DRAFT"    // 4. 문서화 (M-DOCUMENTS)
  | "SIGN"     // 5. 체결 (M-SIGN·M-WEBHOOK)
  | "CUSTODY"; // 6. 보관·이행 (M-EVIDENCE·M-OBLIGATIONS)

export function track(stage: PipelineStage, ok: boolean, ms: number): void {
  // no-op — M1에서 구현
  void stage;
  void ok;
  void ms;
}
