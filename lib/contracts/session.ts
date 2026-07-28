// M-SESSION-MSG — 축 대화 (FR-101 · FR-110 · FR-115B)
// 응답 본문은 SSE 스트림. 스트림 종료 후 메타는 이 스키마로 내려온다.
import { z } from "zod";
import { BranchType } from "./common";

export const SessionMessageReq = z.object({
  sessionId: z.string().uuid().nullish(), // 없으면 새 세션 시작
  text: z.string().min(1),
});
export type SessionMessageReq = z.infer<typeof SessionMessageReq>;

/** 5축 질문은행 커버리지 — 축 이름은 lib/rules/question-bank.ts 상수가 진실 */
export const AxisCoverage = z.array(
  z.object({
    axis: z.string(),
    answered: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  }),
);
export type AxisCoverage = z.infer<typeof AxisCoverage>;

/** 첫 발화가 명시적 의사면 감지·제안을 건너뛰고 가지 직행 (FR-115B, origin=EXPRESS) */
export const ExpressBranch = z.object({
  branchType: BranchType,
  proposalId: z.string().uuid(),
});
export type ExpressBranch = z.infer<typeof ExpressBranch>;

export const SessionMessageRes = z.object({
  sessionId: z.string().uuid(),
  utteranceId: z.string().uuid(),
  axisCoverage: AxisCoverage,
  expressBranch: ExpressBranch.nullish(),
});
export type SessionMessageRes = z.infer<typeof SessionMessageRes>;
