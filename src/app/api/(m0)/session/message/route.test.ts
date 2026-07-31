// M-SESSION-MSG 테스트 — FR-115B 수락 기준 3케이스를 라우트 레벨에서 검증.
// 라우트 핸들러를 직접 호출해 SSE 스트림을 파싱한다 (meta는 항상 마지막 이벤트).
import { describe, expect, it } from "vitest";
import { SessionMessageRes } from "@/lib/contracts";
import { QUESTIONS } from "@/lib/rules/question-bank";
import { POST } from "./route";

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/session/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** SSE 본문 → { tokens, meta } */
async function parseSse(res: Response) {
  const text = await res.text();
  const tokens: string[] = [];
  let meta: unknown = null;
  for (const block of text.split("\n\n").filter(Boolean)) {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (!event || data === undefined) continue;
    if (event === "token") tokens.push(JSON.parse(data));
    if (event === "meta") {
      expect(meta).toBeNull(); // meta는 정확히 1회
      meta = JSON.parse(data);
    }
  }
  return { text, tokens, meta: SessionMessageRes.parse(meta) };
}

describe("M-SESSION-MSG — FR-115B 수락 기준", () => {
  it('"부산에 기부하고 싶어요" → EXPRESS 직행, 회상 질문 없음', async () => {
    const res = await post({ text: "부산에 기부하고 싶어요" });
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const { tokens, meta } = await parseSse(res);
    expect(meta.expressBranch?.branchType).toBe("DONATION_NOW");
    expect(meta.expressBranch?.proposalId).toBeTruthy();
    // 회상 인터뷰 질문이 아니라 슬롯 수집으로 시작한다
    const reply = tokens.join("");
    // 🔴 방금 말한 것을 다시 묻지 않는다 — 되물으면 듣지 않은 것이 된다.
    //    코드가 아는 값(region=부산)을 응답기에 넘기지 않으면 여기서 깨진다
    expect(reply).toContain("부산");
    expect(reply).not.toContain("어느 지역");
    // 비어 있는 슬롯(금액)을 묻는다
    expect(reply).toContain("얼마");
  });

  it('"유언장을 준비하고 싶어요" → EXPRESS + 고지, 재촉 문구 없음', async () => {
    const { tokens, meta } = await parseSse(
      await post({ text: "유언장을 준비하고 싶어요" }),
    );
    expect(meta.expressBranch?.branchType).toBe("HANDWRITTEN_WILL");
    const reply = tokens.join("");
    expect(reply).toContain("자필");            // 효력 고지
    expect(reply).toContain("다음에 하셔도");    // 오늘/다음에 선택
    for (const banned of ["지금", "빨리", "놓치기"]) {
      expect(reply).not.toContain(banned);      // 긴급성 금지 (P4 · NFR-708)
    }
  });

  it('"뭔가 남기고 싶어요" → Express 아님, 축(회상 인터뷰) 시작', async () => {
    const { tokens, meta } = await parseSse(await post({ text: "뭔가 남기고 싶어요" }));
    expect(meta.expressBranch ?? null).toBeNull();
    // 축 세션의 질문은 **질문은행**이 정한다 — 응답기가 지어내면 매번 달라져
    // 사용자가 이야기를 이어갈 수 없다 (FR-301)
    const reply = tokens.join("");
    const fromBank = QUESTIONS.some((q) => reply.includes(q.text));
    expect(fromBank).toBe(true);
    // 가지 슬롯 질문이 축 세션에 섞이지 않는다
    expect(reply).not.toContain("얼마를 보내고");
  });
});

describe("M-SESSION-MSG — 프로토콜 규칙", () => {
  it("meta는 스트림의 마지막 이벤트다", async () => {
    const res = await post({ text: "부산에 기부하고 싶어요" });
    const text = await res.clone().text();
    const blocks = text.split("\n\n").filter(Boolean);
    expect(blocks[blocks.length - 1]).toContain("event: meta");
  });

  it("Express 판정은 첫 발화에만 — 같은 세션 두 번째 발화는 직행하지 않는다", async () => {
    const first = await parseSse(await post({ text: "안녕하세요" }));
    const second = await parseSse(
      await post({ sessionId: first.meta.sessionId, text: "부산에 기부하고 싶어요" }),
    );
    expect(second.meta.sessionId).toBe(first.meta.sessionId);
    expect(second.meta.expressBranch ?? null).toBeNull(); // DETECTED 제안은 M-BRANCH-DETECT(M2) 소관
  });

  it("형식 오류 → 400 envelope (SSE 아님)", async () => {
    const res = await post({ text: "" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.nextAction).toBeTruthy();
  });
});
