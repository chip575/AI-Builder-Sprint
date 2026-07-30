// M-EMBEDDINGS — 세션 회상 검색 (FR-110 재개 · FR-111 근거 연결 · 02.5 §3)
// 기간 무관 관리의 기술적 성립 조건 (D-07). 6개월 만에 돌아와도 어제 온 사람과 같은 연속성.
import { z } from "zod";

export const RecallItem = z.object({
  utteranceId: z.string().uuid(),
  sessionId: z.string().uuid(),
  text: z.string(),
  spokenAt: z.string().datetime(),
  score: z.number().min(0).max(1), // embedding-query 유사도
});
export type RecallItem = z.infer<typeof RecallItem>;

export const RecallRes = z.object({
  /** "지난번엔 어머니 이야기를 하셨어요" — 재개 카드용 요약 */
  summary: z.string().nullish(),
  lastAxis: z.string().nullish(),
  recalls: z.array(RecallItem), // top-k
});
export type RecallRes = z.infer<typeof RecallRes>;
