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
