// M-HEARTWILL-DELIVERY — 전달 설정 (FR-112)
//
// 보관과 발송은 다른 층이다. 그래서 핵심 검사는 **"무엇이 아직 안 되는지를 응답이
// 말하는가"** 다 — 화면이 짐작하게 두면 "설정했는데 왜 안 갔죠"가 된다.
import { describe, expect, it } from "vitest";
import { DEV_USER_ID } from "@/lib/store/types";
import { store } from "@/lib/store";
import { GET, PATCH } from "./route";

async function sessionWithBody(userId = DEV_USER_ID) {
  const s = await store.getOrCreateSession(null, userId);
  const u = await store.addUtterance(s.id, "아이들에게 미안했다고 전하고 싶어요");
  await store.draftHeartWillParagraphs(s.id, [
    { body: "미안했다고 전하고 싶습니다.", origin: "AI_DRAFT", sourceUtteranceId: u.id },
  ]);
  const head = await store.getHeartWillHead(s.id);
  await store.applyHeartWill(s.id, head!.paragraphs.map((p) => p.id));
  return s.id;
}

const patch = (sessionId: string, body: unknown) =>
  PATCH(
    new Request(`http://localhost/api/heartwill/delivery?sessionId=${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("전달 설정", () => {
  it("기본은 사후 공개다 — 정하지 않았어도 상태는 있다", async () => {
    const sessionId = await sessionWithBody();
    const { data } = await (
      await GET(new Request(`http://localhost/api/heartwill/delivery?sessionId=${sessionId}`))
    ).json();
    expect(data.revealPolicy).toBe("POSTHUMOUS");
    expect(data.recipientIds).toEqual([]);
  });

  it("🔴 아직 안 되는 것을 응답이 말한다 — 화면이 짐작하지 않게", async () => {
    const sessionId = await sessionWithBody();
    const { data } = await (await patch(sessionId, { revealPolicy: "POSTHUMOUS", recipientIds: [] })).json();
    expect(data.ready).toBe(false);
    expect(data.note).toContain("준비 중");
    // 그래도 정해 두신 내용은 남는다고 말한다 — 저장이 헛일이 아님을 알려야 한다
    expect(data.note).toContain("그대로 남습니다");
  });

  it("예약은 지금 되는 경로다", async () => {
    const sessionId = await sessionWithBody();
    const { data } = await (
      await patch(sessionId, { revealPolicy: "SCHEDULED", revealAt: "2027-01-01T00:00:00.000Z", recipientIds: [] })
    ).json();
    expect(data.ready).toBe(true);
    expect(data.revealAt).not.toBeNull();
  });

  it("예약인데 날짜가 없으면 막는다 — '언제'가 비어 있다", async () => {
    const sessionId = await sessionWithBody();
    const res = await patch(sessionId, { revealPolicy: "SCHEDULED", recipientIds: [] });
    expect(res.status).toBe(400);
  });

  it("예약이 아니면 날짜를 비운다 — 남겨 두면 언제 가는지가 화면마다 갈린다", async () => {
    const sessionId = await sessionWithBody();
    await patch(sessionId, { revealPolicy: "SCHEDULED", revealAt: "2027-01-01T00:00:00.000Z", recipientIds: [] });
    const { data } = await (await patch(sessionId, { revealPolicy: "POSTHUMOUS", recipientIds: [] })).json();
    expect(data.revealAt).toBeNull();
  });

  it("🔴 주소록에 없는 사람에게는 전할 수 없다", async () => {
    const sessionId = await sessionWithBody();
    const res = await patch(sessionId, {
      revealPolicy: "POSTHUMOUS",
      recipientIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
    });
    expect(res.status).toBe(404);
  });

  it("🔴 남의 대화의 설정은 못 본다", async () => {
    const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const sessionId = await sessionWithBody(other);
    const res = await GET(new Request(`http://localhost/api/heartwill/delivery?sessionId=${sessionId}`));
    expect(res.status).toBe(404);
  });
});
