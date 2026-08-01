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
 *  집계: verdict = 'ESIGN_INVALID'  (2026-08-01 변경)
 *
 *  ⚠ 이전 규칙은 `∧ wasSignAttempt` 였다. 문서 생성 단계의 차단도 차단이므로
 *    제외하지 않는다 — UI 경로에서는 ESIGN_OK가 아닌 draft를 /api/documents가
 *    애초에 만들지 않아 서명 단계에 도달할 방법이 없고, 그래서 카운터가 영원히
 *    0이 되는 문제가 있었다 (실측: 판정 11건 · 표시 0건).
 *    wasSignAttempt는 DB에 그대로 남아 있다. 상세 분해가 필요해지면 그때 필드를 낸다.
 *
 *  ⚠ NON_BINDING 제외는 **여전히 유효하다.** 바뀐 것은 sign_attempt 조건뿐이다 —
 *    정상 라우팅을 차단으로 세면 지표가 부풀려진다.
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
