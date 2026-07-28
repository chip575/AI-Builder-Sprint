// M-LEDGER — 의사 이력 원장 (FR-550~556)
// append-only + 해시 체인. UPDATE·DELETE 금지 — 정정도 새 노드로.
// condition_note·witness는 선택이다 (D-11 — 일반 사용자에게 임상 기록을 강제하지 않는다).
import { z } from "zod";

export const Materiality = z.enum(["MATERIAL", "MINOR", "ANNOTATION"]);
export type Materiality = z.infer<typeof Materiality>;

export const LedgerNodeStatus = z.enum(["ACTIVE", "SUPERSEDED", "REVOKED"]);
export type LedgerNodeStatus = z.infer<typeof LedgerNodeStatus>;

export const LedgerNodeReq = z.object({
  subjectId: z.string().uuid(),
  changeSummary: z.record(z.string(), z.unknown()), // 변경 전후 요약 (jsonb)
  /** 본인 진술 변경 사유 — 정황 봉인의 핵심 (FR-553) */
  changeReason: z.string(),
  conditionNote: z.string().nullish(), // 선택 — 확산 단계 강화용
  witness: z
    .object({ name: z.string(), relation: z.string() })
    .array()
    .nullish(), // 선택 — 입회인
});
export type LedgerNodeReq = z.infer<typeof LedgerNodeReq>;

export const LedgerNode = LedgerNodeReq.extend({
  id: z.string().uuid(),
  seq: z.number().int().positive(),
  materiality: Materiality, // 판정은 코드 — MATERIAL만 재서명 (FR-552)
  /** MATERIAL일 때 의사 확인서 draft (FR-551 — 문서명에 "유언" 금지) */
  draftId: z.string().uuid().nullish(),
  prevHash: z.string().nullish(), // 첫 노드는 null
  nodeHash: z.string(),
  status: LedgerNodeStatus,
  createdAt: z.string().datetime(),
});
export type LedgerNode = z.infer<typeof LedgerNode>;

export const LedgerRes = z.object({
  nodes: z.array(LedgerNode),
  /** 해시 체인 검증 결과 — 1바이트 변조도 이후 전체 불일치 (FR-553) */
  chainValid: z.boolean(),
});
export type LedgerRes = z.infer<typeof LedgerRes>;
