// M-EMBEDDINGS 테스트 (02.5 §3 · D-07 · D-10)
// 지켜야 할 것 셋: 결정론(테스트 가능) · 비용 가드(대화 중 적재 금지) ·
// 삭제권(지운 이야기는 검색으로 되살아나지 않는다).
import { describe, expect, it } from "vitest";
import { cosine } from "@/lib/ai/embed/port";
import { mockVector, MockEmbedder } from "@/lib/ai/embed/mock-embedder";
import { store } from "@/lib/store";
import { GET, POST } from "./route";

const index = (sessionId: string) =>
  POST(new Request(`http://localhost/api/recall?sessionId=${sessionId}`, { method: "POST" }));

const search = (sessionId: string, q?: string) =>
  GET(
    new Request(
      `http://localhost/api/recall?sessionId=${sessionId}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    ),
  );

async function sessionWith(texts: string[]) {
  const s = await store.getOrCreateSession();
  const ids: string[] = [];
  for (const t of texts) ids.push((await store.addUtterance(s.id, t)).id);
  return { sessionId: s.id, ids };
}

describe("M-EMBEDDINGS — mock은 결정론적이다", () => {
  it("같은 문장은 언제나 같은 벡터", () => {
    expect(mockVector("어머니 이야기")).toEqual(mockVector("어머니 이야기"));
  });

  it("어휘가 겹치면 유사도가 높다", async () => {
    const e = new MockEmbedder();
    const [mother, dog] = await e.embedPassages(["어머니와 보낸 시간", "강아지 산책 이야기"]);
    const q = await e.embedQuery("어머니와 보낸 시간이 그립습니다");
    expect(cosine(q, mother!)).toBeGreaterThan(cosine(q, dog!));
  });

  it("코사인은 [0,1] 안에 있다 — 계약이 그렇게 요구한다", () => {
    const a = mockVector("가");
    expect(cosine(a, a)).toBeLessThanOrEqual(1);
    expect(cosine(a, mockVector("나"))).toBeGreaterThanOrEqual(0);
  });
});

describe("M-EMBEDDINGS — 비용 가드 (02.5 §5)", () => {
  it("검색만 해서는 적재가 일어나지 않는다", async () => {
    const { sessionId } = await sessionWith(["부산에 기부하고 싶어요"]);
    await search(sessionId, "기부");
    // 적재 전이므로 대상이 그대로 남아 있어야 한다
    expect(await store.listUnembeddedUtterances(sessionId)).toHaveLength(1);
  });

  it("적재는 명시적 호출로만 일어나고, 두 번 불러도 다시 사지 않는다", async () => {
    const { sessionId } = await sessionWith(["어머니 이야기를 하고 싶어요"]);
    const first = await (await index(sessionId)).json();
    expect(first.data.indexed).toBe(1);
    const second = await (await index(sessionId)).json();
    expect(second.data.indexed).toBe(0); // 재적재 없음
  });
});

describe("M-EMBEDDINGS — 검색", () => {
  it("유사도 내림차순 top-k", async () => {
    const { sessionId } = await sessionWith([
      "어머니와 보낸 시간이 가장 소중합니다",
      "강아지와 산책하던 기억",
      "어머니께 못 한 말이 있어요",
    ]);
    await index(sessionId);
    const { data } = await (await search(sessionId, "어머니")).json();
    expect(data.recalls.length).toBeGreaterThan(0);
    const scores = data.recalls.map((r: { score: number }) => r.score);
    expect([...scores].sort((a: number, b: number) => b - a)).toEqual(scores);
    expect(data.recalls[0].text).toContain("어머니");
  });

  it("요약을 지어내지 않는다 — 원문을 그대로 보인다 (P1)", async () => {
    const { sessionId } = await sessionWith(["고향에 남기고 싶습니다"]);
    await index(sessionId);
    const { data } = await (await search(sessionId, "고향")).json();
    expect(data.summary).toBe("고향에 남기고 싶습니다");
  });

  it("없는 대화 → 404", async () => {
    const res = await search("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});

describe("M-EMBEDDINGS — 삭제권 (D-10)", () => {
  it("지운 발화는 검색 결과에서 빠진다", async () => {
    const { sessionId, ids } = await sessionWith([
      "어머니 이야기입니다",
      "어머니께 드리는 말입니다",
    ]);
    await index(sessionId);

    await store.softDeleteUtterance(ids[0]!);

    const { data } = await (await search(sessionId, "어머니")).json();
    const found = data.recalls.map((r: { utteranceId: string }) => r.utteranceId);
    // 지운 이야기가 검색으로 되살아나면 삭제권이 무의미해진다
    expect(found).not.toContain(ids[0]);
  });

  it("지운 발화는 적재 대상에서도 빠진다", async () => {
    const { sessionId, ids } = await sessionWith(["지울 이야기", "남길 이야기"]);
    await store.softDeleteUtterance(ids[0]!);
    const pending = await store.listUnembeddedUtterances(sessionId);
    expect(pending.map((p) => p.utteranceId)).not.toContain(ids[0]);
  });
});
