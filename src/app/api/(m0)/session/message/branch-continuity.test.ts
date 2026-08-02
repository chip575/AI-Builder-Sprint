// M-SESSION-MSG — 가지 대화가 턴을 넘어 유지되는가 (FR-115B)
//
// 왜 별도 파일인가: 이 결함은 **한 턴만 보면 정상**이다. 첫 턴은 슬롯을 정확히 묻고,
// 둘째 턴에서야 회상 질문으로 샌다. 턴 사이의 관계를 재는 검사가 없으면 안 잡힌다 —
// 실제로 385개 테스트가 전부 통과하는 채로 배포까지 갔다 (2026-08-02 실측).
import { describe, expect, it } from "vitest";
import { getSession } from "@/lib/ai/session/store";
import { QUESTIONS } from "@/lib/rules/question-bank";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/session/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

async function parse(res: Response) {
  const text = await res.text();
  const tokens: string[] = [];
  let meta: Record<string, unknown> = {};
  for (const b of text.split("\n\n").filter(Boolean)) {
    const ev = /^event: (.+)$/m.exec(b)?.[1];
    const d = /^data: (.+)$/m.exec(b)?.[1];
    if (!ev || d === undefined) continue;
    if (ev === "token") tokens.push(JSON.parse(d));
    if (ev === "meta") meta = JSON.parse(d);
  }
  return { reply: tokens.join(""), meta };
}

/** 회상 은행의 질문이 섞여 나왔는가 — 가지 대화에서는 나오면 안 된다 */
const hasRecallQuestion = (reply: string) => QUESTIONS.some((q) => reply.includes(q.text));

describe("🔴 가지 대화는 둘째 턴에도 가지 대화다", () => {
  it("금액을 물어놓고 답하면 회상 질문으로 새지 않는다", async () => {
    const t1 = await parse(await post({ text: "부산에 기부하고 싶어요" }));
    const sid = t1.meta.sessionId as string;
    expect(t1.reply).toContain("얼마"); // 슬롯을 묻는다
    expect(hasRecallQuestion(t1.reply)).toBe(false);

    const t2 = await parse(await post({ sessionId: sid, text: "백만원이요" }));
    // 답한 값을 되읽고 다음 단계로 — 다른 주제를 꺼내지 않는다
    expect(t2.reply).toContain("1,000,000");
    expect(hasRecallQuestion(t2.reply)).toBe(false);

    const t3 = await parse(await post({ sessionId: sid, text: "네 맞아요" }));
    expect(hasRecallQuestion(t3.reply)).toBe(false);
  });

  it("가지를 이어가는 턴은 제안을 새로 만들지 않는다", async () => {
    // openBranch까지 제안 생성에 묶으면 발화 1건당 행 1개가 쌓인다
    const t1 = await parse(await post({ text: "부산에 기부하고 싶어요" }));
    const sid = t1.meta.sessionId as string;
    for (const text of ["백만원이요", "네", "그렇게 할게요"]) {
      await post({ sessionId: sid, text });
    }
    const s = await getSession(sid);
    expect(s!.proposals).toHaveLength(1);
    expect(s!.proposals[0]!.status).toBe("OPENED"); // 직행은 여는 행위다
  });

  it("무거운 가지는 직행해도 열리지 않는다 — 숙려를 거친다 (FR-115B)", async () => {
    // 반대편: 상태를 남기는 것과 **아무거나 여는 것**은 다르다
    const t1 = await parse(await post({ text: "유언장을 준비하고 싶어요" }));
    const s = await getSession(t1.meta.sessionId as string);
    expect(s!.proposals).toHaveLength(1);
    expect(s!.proposals[0]!.status).toBe("PENDING_RECONFIRM");
  });

  it("가지가 없으면 회상 질문이 정상이다 — 가지 대화만 예외다", async () => {
    const t1 = await parse(await post({ text: "뭔가 남기고 싶어요" }));
    expect(t1.meta.expressBranch ?? null).toBeNull();
    expect(hasRecallQuestion(t1.reply)).toBe(true);
  });
});
