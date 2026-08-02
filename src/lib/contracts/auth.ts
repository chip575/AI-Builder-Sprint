// M-AUTH — Supabase Auth 위임 (02.4 §1). 클라이언트는 userId를 보내지 않는다.
import { z } from "zod";

export const AuthReq = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type AuthReq = z.infer<typeof AuthReq>;

export const SessionRes = z.object({
  userId: z.string().uuid(),
  expiresAt: z.string().datetime(),
});
export type SessionRes = z.infer<typeof SessionRes>;

/** M-PROFILE — 마이페이지 (FR-501 · NFR-714)
 *
 *  왜 대화가 아니라 폼인가: 연락처는 개인정보라 대화로 받으면 발화 원문이 저장되고
 *  다음 턴부터 LLM 프롬프트에 통째로 들어간다 (보안 1조·2조). 폼은 그 경로를 안 탄다.
 *  기관명은 개인정보가 아니라 대화로도 받지만, 자주 쓰는 곳은 저장해 반복을 던다.
 *
 *  이 값들은 **계약서에 인쇄된다.** 서명된 문서의 값은 그 문서가 들고 있고,
 *  여기 값을 나중에 고쳐도 이미 서명된 것은 바뀌지 않는다.
 */
export const ProfileRes = z.object({
  email: z.string().email(),
  /** 서식의 성명 칸. 없으면 이메일 앞부분을 쓴다 */
  displayName: z.string().nullish(),
  /** 서식의 연락처 칸. 비우면 이메일이 대신 들어간다 — 빈칸으로 서명되지 않게 */
  contact: z.string().nullish(),
  /** 자주 쓰는 기관명 */
  orgName: z.string().nullish(),
});
export type ProfileRes = z.infer<typeof ProfileRes>;

/** 부분 수정 — 보내지 않은 항목은 그대로 둔다 */
export const ProfilePatch = z.object({
  displayName: z.string().max(40).nullish(),
  contact: z.string().max(60).nullish(),
  orgName: z.string().max(60).nullish(),
});
export type ProfilePatch = z.infer<typeof ProfilePatch>;
