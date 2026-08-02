// M-HEARTWILL-DOC — 마음 유언을 서류로 (FR-111)
//
// 이 문서는 **서명하지 않는다.** 그래서 검사의 무게중심이 "만들어지나"가 아니라
// "무엇으로 만들어지나"에 있다 — NON_BINDING이 아니면 서명 버튼이 붙는다 (FR-104).
import { describe, expect, it } from "vitest";
import { DEV_USER_ID } from "@/lib/store/types";
import { store } from "@/lib/store";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/heartwill/document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

async function sessionWithBody(userId = DEV_USER_ID, approve = true) {
  const s = await store.getOrCreateSession(null, userId);
  const u = await store.addUtterance(s.id, "아이들에게 미안했다고 전하고 싶어요");
  await store.draftHeartWillParagraphs(s.id, [
    { body: "아이들에게 미안했다고 전하고 싶습니다.", origin: "AI_DRAFT", sourceUtteranceId: u.id },
  ]);
  const head = await store.getHeartWillHead(s.id);
  if (approve) await store.applyHeartWill(s.id, head!.paragraphs.map((p) => p.id));
  return s.id;
}

describe("서류로 남기기", () => {
  it("승인된 문단이 있으면 HEART_LETTER 문서가 생긴다", async () => {
    const sessionId = await sessionWithBody();
    const { ok, data } = await (await post({ sessionId })).json();
    expect(ok).toBe(true);
    expect(data.created).toBe(true);

    const draft = await store.getDraft(data.draftId);
    expect(draft?.docType).toBe("HEART_LETTER");
    // 🔴 서명하지 않는 문서다 — 판정이 바뀌면 화면에 서명 버튼이 붙는다
    expect(draft?.verdict.verdict).toBe("NON_BINDING");
  });

  it("두 번 눌러도 같은 문서다 — 서랍에 같은 것이 쌓이지 않는다", async () => {
    const sessionId = await sessionWithBody();
    const a = (await (await post({ sessionId })).json()).data;
    const b = (await (await post({ sessionId })).json()).data;
    expect(b.draftId).toBe(a.draftId);
    expect(b.created).toBe(false);
  });

  it("🔴 승인이 하나도 없으면 문서를 만들지 않는다 (P1)", async () => {
    // 빈 문서를 만들어 두면 CLM에 '마음 편지'가 뜨는데 열면 아무것도 없다
    const sessionId = await sessionWithBody(DEV_USER_ID, false);
    const res = await post({ sessionId });
    expect(res.status).toBe(409);
    const mine = await store.listDocumentsByUser(DEV_USER_ID, { docType: "HEART_LETTER" });
    expect(mine.some((d) => d.intentId === sessionId)).toBe(false);
  });

  it("🔴 남의 대화로 문서를 만들 수 없다", async () => {
    const other = "77777777-7777-4777-8777-777777777777";
    const sessionId = await sessionWithBody(other);
    const res = await post({ sessionId });
    expect(res.status).toBe(404);
  });
});
