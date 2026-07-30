// M-HANDWRITING — 자필 필사 가이드 (FR-302)
// ⚠ 이 화면·계약에 서명 버튼/서명 URL은 존재하지 않는다 (민법 §1066, P2).
import { z } from "zod";
import { Statute } from "./gate";

export const HandwritingGuideRes = z.object({
  /** "손으로 옮겨 적어야 효력이 있습니다" 최상단 고지와 함께 출력되는 초안 전문 */
  draftText: z.string(),
  /** 4대 필수요건 — 전문 자서 · 연월일 · 주소 자서 · 성명+날인. 하나씩 순차 확인 */
  checklist: z
    .array(
      z.object({
        id: z.enum(["FULL_TEXT", "DATE", "ADDRESS", "NAME_SEAL"]),
        label: z.string(),
        caseNote: z.string(), // 무효 판례 근거 1줄
        checked: z.boolean(),
      }),
    )
    .length(4),
  statutes: z.array(Statute),
});
export type HandwritingGuideRes = z.infer<typeof HandwritingGuideRes>;
