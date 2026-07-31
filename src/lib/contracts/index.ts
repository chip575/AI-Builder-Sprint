// lib/contracts — 입출력의 유일한 진실 (CLAUDE.md 절대규칙 1)
// 프론트 폼과 백엔드 라우트가 같은 스키마를 import한다. 여기 없는 필드는 주고받지 않는다.
// 변경은 4인 합의 후 PM만 — 에이전트는 contract-owner로 제안서만 낸다.
export * from "./envelope";
export * from "./common";
export * from "./gate";
export * from "./auth";
export * from "./session";
export * from "./extract";
export * from "./facts";
export * from "./rules";
export * from "./rewards";
export * from "./documents";
export * from "./sign";
export * from "./webhook";
export * from "./estate";
export * from "./evidence";
export * from "./obligations";
export * from "./reconcile";
export * from "./paper-scan";
export * from "./admin";
export * from "./question-bank";
export * from "./heartwill";
export * from "./handwriting";
export * from "./branch";
export * from "./ledger";
export * from "./family-ack";
export * from "./embeddings";
