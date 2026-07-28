// M-EXTRACT — POST /api/extract (FR-102)
// 세션 단위 1회 호출. 슬롯이 다 찼는지 판단(되묻기)은 M-SESSION-MSG의 책임이고,
// 여기는 확정된 대화에서 값을 뽑는다 — 두 모듈이 서로를 부르지 않는 경계.
// Intent 1건 = 세션 1건 (00.2 §7) 이므로 intentId로 세션을 조회한다.
import { ExtractReq } from "@/lib/contracts";
import { extractor } from "@/lib/ai/extract";
import { getSession } from "@/lib/ai/session/store";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = ExtractReq.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "요청 형식이 올바르지 않습니다.",
          nextAction: "intentId를 확인해 주세요.",
        },
      },
      { status: 400 },
    );
  }

  const session = getSession(parsed.data.intentId);
  if (!session) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "해당 대화를 찾을 수 없습니다.",
          nextAction: "대화를 먼저 시작해 주세요.",
        },
      },
      { status: 404 },
    );
  }

  // 가지 유형 = 최신 제안 기준 (M0은 Express 단일 제안)
  const branchType = session.proposals.at(-1)?.branchType ?? null;

  const result = await extractor.extract({
    intentId: session.id,
    branchType,
    utterances: session.utterances,
  });

  session.facts = result.facts; // 확정(confirmed) 갱신은 M-FACTS-CONFIRM 소관

  return Response.json({ ok: true, data: result });
}
