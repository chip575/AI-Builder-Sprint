// M-QUESTION-BANK — 5축 20문항 + 커버리지 (FR-301 · FR-110)
// 질문 본문·축 이름 상수는 lib/rules/question-bank.ts가 진실. 여기는 모양만.
import { z } from "zod";

export const Question = z.object({
  id: z.string(),
  axis: z.string(),
  text: z.string(),
  order: z.number().int().nonnegative(), // 순서 이탈 허용 (FR-110) — 정렬 힌트일 뿐
});
export type Question = z.infer<typeof Question>;

export const QuestionBank = z.object({
  axes: z.array(z.object({ id: z.string(), label: z.string() })),
  questions: z.array(Question),
});
export type QuestionBank = z.infer<typeof QuestionBank>;
