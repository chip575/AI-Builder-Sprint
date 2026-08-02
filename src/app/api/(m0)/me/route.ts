// M-PROFILE — GET/PATCH /api/me (FR-501 · NFR-714)
//
// 마이페이지가 읽고 쓰는 곳. 여기 값은 **서식에 인쇄된다** — 성명·연락처가
// 계약서에 그대로 찍히므로, 비어 있으면 빈칸이 아니라 대체값을 채운다.
//
// ⚠ 연락처는 개인정보다. 응답에는 담되 **로그·에러 메시지에는 남기지 않는다** (보안 1조).
//   대화로 받지 않는 이유도 같다: 발화는 원문 저장되고 LLM 프롬프트로 들어간다 (보안 2조).
import { ProfilePatch, ProfileRes } from "@/lib/contracts";
import { getCurrentUser, loginRequired } from "@/lib/auth/session";
import { store } from "@/lib/store";

/** 비어 있을 때 서식에 들어갈 값 — 빈칸으로 서명되지 않게 한다 */
export function effectiveProfile(
  email: string,
  saved: { displayName: string | null; contact: string | null; orgName: string | null } | undefined,
) {
  return {
    displayName: saved?.displayName || email.split("@")[0]!,
    // 전화번호가 없으면 이메일이 연락처다 — 실재하는 연락 수단이라 거짓이 아니다.
    // (임의의 010-0000-0000을 넣으면 계약서에 없는 번호가 인쇄된다)
    contact: saved?.contact || email,
    orgName: saved?.orgName ?? null,
  };
}

export async function GET(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return loginRequired();

  const saved = await store.getProfile(user.id);
  return Response.json({
    ok: true,
    data: ProfileRes.parse({
      email: user.email,
      // 저장값을 그대로 준다 — 화면은 "비어 있음"과 "대체값이 들어감"을 구분해 보여준다.
      // 대체값을 여기서 채워 보내면 사용자는 자기가 입력한 줄로 안다
      displayName: saved?.displayName ?? null,
      contact: saved?.contact ?? null,
      orgName: saved?.orgName ?? null,
    }),
  });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return loginRequired();

  const parsed = ProfilePatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "입력하신 내용을 저장하지 못했습니다.",
          nextAction: "글자 수를 줄여 다시 시도해 주세요.",
        },
      },
      { status: 400 },
    );
  }

  // 빈 문자열은 "지움"으로 읽는다 — 폼에서 지운 것과 안 건드린 것을 구분한다
  const blankToNull = (v: string | null | undefined) =>
    v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim();

  const saved = await store.saveProfile(user.id, {
    displayName: blankToNull(parsed.data.displayName),
    contact: blankToNull(parsed.data.contact),
    orgName: blankToNull(parsed.data.orgName),
  });

  return Response.json({
    ok: true,
    data: ProfileRes.parse({
      email: user.email,
      displayName: saved.displayName,
      contact: saved.contact,
      orgName: saved.orgName,
    }),
  });
}
