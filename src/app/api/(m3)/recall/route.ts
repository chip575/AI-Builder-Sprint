// M-EMBEDDINGS — 세션 회상 (02.5 §3 · FR-110 · D-07)
//
//   POST /api/recall  — 적재. **세션을 떠날 때 한 번** 부른다
//   GET  /api/recall  — 검색. 재개 카드·근거 후보 제시
//
// ⚠ 적재와 검색을 한 라우트에서 나눈 이유: 대화 중에 실시간으로 임베딩을 부르면
//   발화마다 유료 호출이 붙는다 (02.5 §5 비용 가드). GET은 질의 1건만 임베딩하고
//   발화는 절대 적재하지 않는다 — 테스트가 이걸 고정한다.
import { RecallRes } from "@/lib/contracts";
import { embedder } from "@/lib/ai/embed";
import { store } from "@/lib/store";

const TOP_K = 5;

function bad(code: string, message: string, nextAction: string, status: number) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

/** 적재 — 아직 벡터가 없는 발화만 배치로 보낸다. 재적재는 같은 벡터를 다시 사는 일이다 */
export async function POST(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!sessionId) {
    return bad("INVALID_REQUEST", "대화를 지정해 주세요.", "대화 화면에서 다시 시도해 주세요.", 400);
  }

  const pending = await store.listUnembeddedUtterances(sessionId);
  if (pending.length === 0) {
    return Response.json({ ok: true, data: { indexed: 0 } });
  }

  let vectors: number[][];
  try {
    vectors = await embedder.embedPassages(pending.map((p) => p.text));
  } catch (err) {
    // 조용히 넘기지 않는다 (보안 7조). 다만 이건 부가 기능이라 대화를 막지는 않는다
    console.warn("[recall] 적재 실패:", (err as Error).message);
    return bad(
      "EMBED_FAILED",
      "이야기를 정리하지 못했습니다.",
      "다음에 들어오실 때 자동으로 다시 시도합니다.",
      503,
    );
  }

  const indexed = await store.saveEmbeddings(
    sessionId,
    pending.map((p, i) => ({ utteranceId: p.utteranceId, vector: vectors[i]! })),
  );
  return Response.json({ ok: true, data: { indexed } });
}

/** 검색 — 재개 카드와 근거 후보. 질의가 없으면 마지막 발화를 질의로 쓴다 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const q = url.searchParams.get("q");
  if (!sessionId) {
    return bad("INVALID_REQUEST", "대화를 지정해 주세요.", "대화 화면에서 다시 시도해 주세요.", 400);
  }

  const session = await store.getSession(sessionId);
  if (!session) {
    return bad("NOT_FOUND", "해당 대화를 찾을 수 없습니다.", "대화를 먼저 시작해 주세요.", 404);
  }

  // 질의가 없으면 마지막으로 하신 말을 기준으로 되짚는다 —
  // "지난번엔 어머니 이야기를 하셨어요"가 이 경로에서 나온다 (FR-110)
  const query = q ?? session.utterances.at(-1)?.text ?? "";
  if (query.trim() === "") {
    return Response.json({
      ok: true,
      data: RecallRes.parse({ summary: null, lastAxis: null, recalls: [] }),
    });
  }

  let vector: number[];
  try {
    vector = await embedder.embedQuery(query);
  } catch (err) {
    console.warn("[recall] 검색 실패:", (err as Error).message);
    return bad(
      "EMBED_FAILED",
      "지난 이야기를 불러오지 못했습니다.",
      "잠시 후 다시 시도해 주세요.",
      503,
    );
  }

  const recalls = await store.searchSimilarUtterances(sessionId, vector, TOP_K);

  return Response.json({
    ok: true,
    data: RecallRes.parse({
      // 요약 문구는 만들지 않는다 — AI가 "이런 말씀을 하셨죠"를 지어내면
      // 사용자가 하지 않은 말이 재개 카드에 뜬다 (P1). 원문을 그대로 보인다
      summary: recalls[0]?.text ?? null,
      lastAxis: null,
      recalls,
    }),
  });
}
