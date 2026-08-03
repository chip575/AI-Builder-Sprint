// M-SESSION-MSG — 축 대화 (FR-101 · FR-110 · FR-115B)
// 응답 본문은 SSE 스트림. 스트림 종료 후 메타는 이 스키마로 내려온다.
import { z } from "zod";
import { DocType } from "./common";
import { BranchType } from "./common";

export const SessionMessageReq = z.object({
  sessionId: z.string().uuid().nullish(), // 없으면 새 세션 시작
  text: z.string().min(1),
  /** 이 대화가 **이미 어느 서류를 쓰는 중인지** (작성실). 없으면 축(회상) 대화다.
   *
   *  ⚠ 이 값이 있으면 서버는 **가지 판정·감지를 하지 않는다.** 목적지가 이미 정해진
   *    대화에서 "혹시 다른 걸 하시겠어요?"를 묻는 것은 방해다 — 실제로 기부 약정서를
   *    쓰는 중에 세금을 물었더니 "고향에 기부하고 싶으신가요?"가 떴다 (2026-08-03).
   *    작성실은 서류별 도우미이지 가지를 고르는 곳이 아니다. */
  docType: DocType.nullish(),
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
  /** 안내가 권한 서류. 화면은 이걸로 "이 서류로 시작하기" 버튼을 띄운다.
   *  말로만 권하고 끝나면 사용자가 그 서류를 직접 찾아가야 한다 — 안내가 길을
   *  알려 주고 문은 안 열어 주는 셈이다 (2026-08-03) */
  suggestedDoc: DocType.nullish(),
});
export type SessionMessageRes = z.infer<typeof SessionMessageRes>;
