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
  const proposals: { id: string; branchType: string; message: string }[] = [];
  let meta: unknown = null;
  for (const block of text.split("\n\n").filter(Boolean)) {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (!event || data === undefined) continue;
    if (event === "token") tokens.push(JSON.parse(data));
    if (event === "proposal") proposals.push(JSON.parse(data));
    if (event === "meta") {
      expect(meta).toBeNull(); // meta는 정확히 1회
      meta = JSON.parse(data);
    }
  }
  return { text, tokens, proposals, meta: SessionMessageRes.parse(meta) };
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

describe("🔴 M-SESSION-MSG — 회상 질문이 턴마다 바뀐다", () => {
  // 질문은행에 askedIds를 넘기지 않으면 축 순위가 그대로인 한 **같은 질문이 영원히**
  // 나온다. 실제로 사용자가 무슨 말을 해도 "가장 잘했다고 생각하는 결정은
  // 무엇인가요?"만 반복됐다 (2026-08-01). 유닛 368개가 전부 통과한 채 숨어 있었다 —
  // 한 턴만 보면 정상이고, **턴 사이의 관계**가 깨진 종류이기 때문이다.
  it("네 턴 동안 같은 질문을 두 번 하지 않는다", async () => {
    let sid: string | null = null;
    const replies: string[] = [];
    for (const text of ["안녕하세요", "그렇군요", "글쎄요", "음 잘 모르겠어요"]) {
      const r = await parseSse(await post(sid ? { sessionId: sid, text } : { text }));
      sid = r.meta.sessionId;
      replies.push(r.tokens.join(""));
    }

    // 각 응답에 어떤 은행 질문이 들어 있는지로 센다 — 응답기가 무엇을 쓰든 질문 자체를 본다
    const asked = replies.map(
      (reply) => QUESTIONS.find((q) => reply.includes(q.text))?.id ?? null,
    );
    const found = asked.filter((x): x is string => x !== null);
    expect(found.length).toBeGreaterThanOrEqual(2); // 회상 질문이 실제로 나왔는가
    expect(new Set(found).size).toBe(found.length); // 중복 0
  });

  it("건너뛰지 않은 질문은 사라지지 않는다 — 순서만 바뀐다", async () => {
    // 반대편: askedIds를 넘긴다고 질문이 고갈되면 안 된다.
    // 은행이 20문항이므로 네 턴 뒤에도 다음 질문이 남아 있어야 한다
    let sid: string | null = null;
    for (const text of ["네", "그렇죠", "맞아요", "그러네요"]) {
      const r = await parseSse(await post(sid ? { sessionId: sid, text } : { text }));
      sid = r.meta.sessionId;
    }
    const last = await parseSse(await post({ sessionId: sid!, text: "계속 해주세요" }));
    expect(last.tokens.join("").length).toBeGreaterThan(0);
  });
});

describe("🔴 M-SESSION-MSG — 규칙이 놓친 발화가 바닥으로 떨어지지 않는다", () => {
  // detectExpress는 3분기(EXPRESS/UNCERTAIN/NONE)인데 소비하는 쪽이 2분기만 알아서,
  // "부산에 기부는 어떻게 해?"처럼 **대상은 있고 의지 표현이 없는** 발화가 통째로
  // 축으로 떨어졌다. 규칙은 확신 케이스만 잡고 나머지를 넘기라고 있는 것이므로,
  // 넘길 곳(확인형 제안)이 있어야 설계가 완성된다 (FR-115A).
  it("질문형 발화는 가지로 직행하지 않고 **확인 제안**이 된다", async () => {
    const { meta, proposals } = await parseSse(await post({ text: "부산에 기부는 어떻게 해?" }));
    // 의지 표명이 아니므로 자동으로 열지 않는다
    expect(meta.expressBranch ?? null).toBeNull();
    // 대신 확인형 제안이 뜬다
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.branchType).toBe("DONATION_NOW");
    expect(proposals[0]!.message).toContain("정리해볼까요"); // 권유가 아니라 확인형
  });

  it("신호가 없는 발화에는 제안을 만들지 않는다 — 아무 말에나 카드가 뜨면 영업이다", async () => {
    const { proposals } = await parseSse(await post({ text: "요즘 날씨가 참 좋네요" }));
    expect(proposals).toHaveLength(0);
  });

  it("확신 발화는 그대로 직행한다 — 제안 단계를 거치지 않는다", async () => {
    const { meta, proposals } = await parseSse(await post({ text: "부산에 기부하고 싶어요" }));
    expect(meta.expressBranch?.branchType).toBe("DONATION_NOW");
    expect(proposals).toHaveLength(0); // 이미 갈라졌으므로 제안하지 않는다
  });

  it("같은 세션에서 같은 가지를 두 번 제안하지 않는다 (FR-113)", async () => {
    const first = await parseSse(await post({ text: "기부는 어떻게 하는 건가요?" }));
    expect(first.proposals).toHaveLength(1);
    const second = await parseSse(
      await post({ sessionId: first.meta.sessionId, text: "기부 말인데요" }),
    );
    expect(second.proposals).toHaveLength(0);
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
