// M-EVIDENCE — 15분 만료 서명 URL (D-10 · FR-505)
// mock에서도 만료를 실제로 계산한다 — 실서비스에선 Supabase Storage signed URL이
// 이 역할을 대체한다(교체 지점은 이 파일 하나).
import { createHmac, timingSafeEqual } from "node:crypto";

export const EVIDENCE_URL_TTL_MS = 15 * 60 * 1000;

// mock 전용 서명 키 — Storage 전환 시 제거. 시크릿이되 유출 시 피해가 mock URL 위조뿐이라 기본값 허용
const urlSecret = () => process.env.EVIDENCE_URL_SECRET ?? "dev-evidence-url-secret";

function sig(draftId: string, expires: number): string {
  return createHmac("sha256", urlSecret()).update(`${draftId}:${expires}`).digest("hex");
}

/** 발급 — origin 기준 상대 라우트로, 만료 시각과 서명을 쿼리에 싣는다 */
export function issueEvidenceUrl(
  origin: string,
  draftId: string,
  ttlMs: number = EVIDENCE_URL_TTL_MS,
): string {
  const expires = Date.now() + ttlMs;
  return `${origin}/api/evidence/${draftId}/pdf?expires=${expires}&sig=${sig(draftId, expires)}`;
}

/** 검증 — 만료 또는 서명 불일치면 사유 반환 (상수 시간 비교) */
export function verifyEvidenceUrl(
  draftId: string,
  expires: string | null,
  provided: string | null,
): "OK" | "EXPIRED" | "INVALID" {
  const exp = Number(expires);
  if (!Number.isFinite(exp) || !provided) return "INVALID";
  const a = Buffer.from(sig(draftId, exp));
  const b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "INVALID";
  if (Date.now() > exp) return "EXPIRED";
  return "OK";
}
