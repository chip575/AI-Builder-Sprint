// 공통 응답 envelope — NFR-705 (spec/plan/02.4-contracts.md §0)
// 모든 라우트의 응답은 이 둘 중 하나다. 기술 오류 코드를 그대로 노출하지 않는다.
// nextAction = 사용자에게 보여줄 "다음에 할 행동" 문구.
import { z } from "zod";

export const ApiError = z.object({
  code: z.string(),
  message: z.string(),
  nextAction: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;

export const Fail = z.object({
  ok: z.literal(false),
  error: ApiError,
});
export type Fail = z.infer<typeof Fail>;

/** 성공 응답 스키마 생성기: envelope(Data) → { ok: true, data } | { ok: false, error } */
export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data }),
    Fail,
  ]);
}

export type Envelope<T> = { ok: true; data: T } | Fail;
