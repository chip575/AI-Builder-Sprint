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

/** 철회 요청 (FR-405 · 민법 §1108①).
 *  ⚠ 문서 상태(DocStatus)를 바꾸지 않는다 — COMPLETED → CANCELED는 역행 전이라
 *  canTransition이 막고, 서명된 증빙은 남아야 한다 (P5). 철회는 삭제가 아니라
 *  **그 위에 얹는 새로운 사실**이다: 그때 약정했고 나중에 철회했다, 둘 다 참이다. */
export const RevokeReq = z.object({
  /** 왜 철회하시는지 — 본인 진술. 정황 봉인의 핵심이라 필수다 (FR-553).
   *  철회는 사유의 당부와 무관하게 효력이 있으므로 내용을 검사하지 않는다 (서식 제4조) */
  changeReason: z.string().min(1).max(500),
  /** 통지할 상대. 없으면 철회만 하고 알리지 않는다 —
   *  알리지 않아도 철회는 성립하지만 상대가 모른다 (서식 제2조) */
  notifyRecipientId: z.string().uuid().nullish(),
});
export type RevokeReq = z.infer<typeof RevokeReq>;

export const RevokeRes = z.object({
  /** 철회 뒤의 이력 한 벌. 화면이 목록을 따로 계산하지 않게 한다 */
  nodes: z.array(LedgerNode),
  chainValid: z.boolean(),
  /** 통지 대상이 정해졌는가. 실제 발송은 사용자가 확인 화면에서 한 번 더 누른다 */
  notifyRecipientId: z.string().uuid().nullish(),
});
export type RevokeRes = z.infer<typeof RevokeRes>;
