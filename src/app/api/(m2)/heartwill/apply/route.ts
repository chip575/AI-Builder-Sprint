// M-HEARTWILL — POST /api/heartwill/apply (FR-111)
//
// 승인한 문단만 문서에 들어간다. 이 라우트에 "전부 승인" 같은 지름길은 없다 —
// 승인의 단위는 문단이고, 단위를 넓히는 순간 P1이 형식만 남는다.
//
// ⚠ 이 문서는 NON_BINDING이다. 서명 경로를 만들지 않는다 (민법 §1066 · 절대규칙 4).
import { HeartWillApplyReq, HeartWillVersionRes } from "@/lib/contracts";
import { store } from "@/lib/store";
import { diffParagraphs } from "../diff";

function err(status: number, code: string, message: string, nextAction: string) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = HeartWillApplyReq.safeParse(body);
  if (!parsed.success) {
    return err(
      400,
      "INVALID_REQUEST",
      "요청 형식이 올바르지 않습니다.",
      "대화를 다시 열어 주세요.",
    );
  }
  const { sessionId, acceptedParagraphIds } = parsed.data;

  try {
    const head = await store.getHeartWillHead(sessionId);
    if (!head) {
      return err(
        404,
        "NOT_FOUND",
        "아직 정리할 문장이 없습니다.",
        "회상 대화에서 이야기를 먼저 남겨 주세요.",
      );
    }

    // 승인 대상은 **미승인 문단**뿐이다. 이미 본문인 문단의 id를 보내도 여기서 걸린다.
    // 문단 id는 버전이 바뀌면 새로 발급되므로, 오래된 화면에서 온 요청도 여기서 멈춘다 —
    // 조용히 무시하면 사용자는 승인했다고 믿고 우리는 반영하지 않은 상태가 된다
    const pending = new Set(
      head.paragraphs.filter((p) => p.acceptedAt === null).map((p) => p.id),
    );
    const stale = acceptedParagraphIds.filter((id) => !pending.has(id));
    if (stale.length > 0) {
      return err(
        422,
        "PARAGRAPH_STALE",
        "선택하신 문장 중 일부가 지금 목록과 다릅니다.",
        "화면을 새로 고친 뒤 다시 골라 주세요.",
      );
    }

    // 빈 승인은 "전부 승인"이 아니라 "갱신 없음"이다 — 현재 버전을 그대로 돌려준다.
    // 저장소도 같은 판단을 하지만(null), 빈 배열로 저장소를 호출하지 않는 편이 의도가 분명하다
    const result =
      acceptedParagraphIds.length > 0
        ? await store.applyHeartWill(sessionId, acceptedParagraphIds)
        : null;
    if (!result) {
      return Response.json({
        ok: true,
        data: HeartWillVersionRes.parse({ versionId: head.versionId, diff: [] }),
      });
    }

    // diff는 **본문끼리** 비교한다. 다음 버전으로 유예된 미승인 초안은 문서가 아니다
    const nextBody = result.version.paragraphs.filter((p) => p.acceptedAt !== null);
    return Response.json({
      ok: true,
      data: HeartWillVersionRes.parse({
        versionId: result.version.versionId,
        diff: diffParagraphs(result.previousParagraphs, nextBody),
      }),
    });
  } catch {
    // 저장소 실패를 조용히 성공으로 만들지 않는다. 원인 메시지는 밖으로 내보내지 않는다 (NFR-705)
    return err(
      503,
      "STORE_UNAVAILABLE",
      "지금은 문장을 저장할 수 없습니다.",
      "잠시 후 다시 시도해 주세요. 남기신 이야기는 그대로 있습니다.",
    );
  }
}
