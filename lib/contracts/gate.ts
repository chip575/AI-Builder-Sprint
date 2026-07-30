// M-GATE — 법적 유효성 게이트 (FR-104 · spec/00.1-rules.md)
// ★ BE-1과 BE-2가 만나는 유일한 지점 (D-12). 이 타입이 절단선이다.
//   판정 로직은 lib/rules/validity-gate.ts (순수 함수, LLM 비의존, 사람 리뷰 필수).
import { z } from "zod";
import { DocType } from "./common";
import { IntentFact } from "./extract";

export const GateReq = z.object({
  docType: DocType,
  facts: z.array(IntentFact),
});
export type GateReq = z.infer<typeof GateReq>;

/** 법령 조문 인용 — 모든 판정에는 근거가 붙는다 (P3). 갱신일자 UI 노출 필수 */
export const Statute = z.object({
  id: z.string(),          // 예: "민법 §1066"
  title: z.string(),
  summary: z.string(),
  verifiedAt: z.string(),  // YYYY-MM-DD — 룰테이블 검증일
});
export type Statute = z.infer<typeof Statute>;

export const GateVerdictCode = z.enum([
  "ESIGN_OK",       // 전자서명으로 효력 발생 → 모두싸인 서명 요청
  "ESIGN_INVALID",  // 전자서명해도 무효 → 대체 경로(자필/공증) 안내, 서명 API는 서버가 차단
  "NON_BINDING",    // 법적 구속력 없음이 의도된 문서 → 서명 없이 보관
]);
export type GateVerdictCode = z.infer<typeof GateVerdictCode>;

export const GateVerdict = z.object({
  verdict: GateVerdictCode,
  statutes: z.array(Statute),
  /** ESIGN_INVALID일 때 라우팅할 대체 경로 (예: 자필 필사 가이드) */
  alternativeRoute: z.string().nullish(),
});
export type GateVerdict = z.infer<typeof GateVerdict>;

/** M-GATE-COUNTER — GET /api/admin/gate-stats (FR-509)
 *  형태는 spec/manifest.yaml의 M-GATE-COUNTER 행이 이미 선언한 것을 코드로 옮긴 것이다.
 *
 *  ⚠ blockedTotal은 **차단**만 센다: verdict=ESIGN_INVALID ∧ wasSignAttempt.
 *    NON_BINDING은 차단이 아니라 정상 라우팅이고, 문서 생성 단계의 거부도
 *    "서명 시도 차단"은 아니다. 부풀린 지표는 없느니만 못하다.
 *    전체 분포(byVerdict)는 게이트가 3분기를 실제로 태웠다는 증거로 따로 보여준다. */
export const GateStatsRes = z.object({
  blockedTotal: z.number().int().nonnegative(),
  byDocType: z.record(z.string(), z.number().int().nonnegative()),
  byStatute: z.array(
    z.object({ id: z.string(), count: z.number().int().nonnegative() }),
  ),
  byVerdict: z.record(GateVerdictCode, z.number().int().nonnegative()),
  totalEvaluations: z.number().int().nonnegative(),
});
export type GateStatsRes = z.infer<typeof GateStatsRes>;
