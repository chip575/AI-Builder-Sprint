// M-HEARTWILL 테스트 (FR-111)
//
// 고정하려는 명제는 하나다: **사용자가 고르지 않은 문장은 문서가 되지 않는다.**
// 저장소·라우트·화면 세 층에서 각각 확인한다 — 한 층만 막으면 나머지 두 층이 우회로가 된다.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { store } from "@/lib/store";
import { buildDraftParagraphs } from "./draft";
import { diffParagraphs } from "./diff";
import { POST } from "./apply/route";

const UI = "src/app/(ui)/(m2)/heartwill";

const apply = (body: unknown) =>
  POST(
    new Request("http://localhost/api/heartwill/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

/** 발화 2개 + 그것을 근거로 한 AI 초안 2문단(전부 미승인) */
async function seeded() {
  const session = await store.getOrCreateSession();
  await store.addUtterance(session.id, "아이들에게 미안했던 날이 있었다");
  await store.addUtterance(session.id, "고맙다는 말을 끝내 못 했다");
  const loaded = (await store.getSession(session.id))!;
  const drafts = buildDraftParagraphs(loaded.utterances, []);
  const head = await store.draftHeartWillParagraphs(session.id, drafts);
  return { sessionId: session.id, utterances: loaded.utterances, head };
}

describe("M-HEARTWILL — 승인한 문단만 반영된다 (FR-111 수락 기준)", () => {
  it("미승인 문단은 문서에 들어가지 않는다", async () => {
    const { sessionId, head } = await seeded();
    const chosen = head.paragraphs[0]!;
    const untouched = head.paragraphs[1]!;

    const res = await apply({ sessionId, acceptedParagraphIds: [chosen.id] });
    expect(res.status).toBe(200);

    const after = (await store.getHeartWillHead(sessionId))!;
    const body = after.paragraphs.filter((p) => p.acceptedAt !== null);
    expect(body.map((p) => p.body)).toEqual([chosen.body]);
    // 고르지 않은 문장은 사라지지도, 들어가지도 않는다 — 판단을 기다린다
    const stillPending = after.paragraphs.filter((p) => p.acceptedAt === null);
    expect(stillPending.map((p) => p.body)).toEqual([untouched.body]);
  });

  it("acceptedParagraphIds: [] → 버전이 생기지 않는다", async () => {
    const { sessionId, head } = await seeded();
    const res = await apply({ sessionId, acceptedParagraphIds: [] });
    const { data } = await res.json();

    expect(data.versionId).toBe(head.versionId); // 현재 버전 그대로
    expect(data.diff).toEqual([]);
    const after = (await store.getHeartWillHead(sessionId))!;
    expect(after.versionId).toBe(head.versionId);
    expect(after.paragraphs.every((p) => p.acceptedAt === null)).toBe(true);
  });

  it("빈 승인은 '전부 승인'의 지름길이 아니다 — 본문은 여전히 비어 있다", async () => {
    const { sessionId } = await seeded();
    await apply({ sessionId, acceptedParagraphIds: [] });
    const after = (await store.getHeartWillHead(sessionId))!;
    expect(after.paragraphs.filter((p) => p.acceptedAt !== null)).toHaveLength(0);
  });

  it("이미 본문인 문단·옛 화면의 문단 id는 거부된다 (조용히 무시하지 않는다)", async () => {
    const { sessionId, head } = await seeded();
    await apply({ sessionId, acceptedParagraphIds: [head.paragraphs[0]!.id] });

    // 같은 id를 다시 보낸다 — 버전이 바뀌었으므로 이 id는 더 이상 대기 문단이 아니다
    const res = await apply({ sessionId, acceptedParagraphIds: [head.paragraphs[0]!.id] });
    expect(res.status).toBe(422);
    const { error } = await res.json();
    expect(error.code).toBe("PARAGRAPH_STALE");
    expect(error.nextAction).toBeTruthy(); // 기술 코드 대신 다음 행동을 준다 (NFR-705)
  });

  it("문서가 없는 세션 → 404, 형식이 틀린 요청 → 400", async () => {
    expect((await apply({ sessionId: randomUUID(), acceptedParagraphIds: [] })).status).toBe(404);
    expect((await apply({ sessionId: "not-a-uuid" })).status).toBe(400);
  });
});

describe("M-HEARTWILL — 근거 발화 (FR-111)", () => {
  it("근거 발화 없는 문단은 생성되지 않는다", async () => {
    const session = await store.getOrCreateSession();
    await expect(
      store.draftHeartWillParagraphs(session.id, [
        { body: "지어낸 문장", origin: "AI_DRAFT", sourceUtteranceId: randomUUID() },
      ]),
    ).rejects.toThrow();
    expect(await store.getHeartWillHead(session.id)).toBeUndefined();
  });

  it("삭제된 발화는 근거가 되지 못한다 (소프트 삭제 — D-10)", async () => {
    const session = await store.getOrCreateSession();
    const u = await store.addUtterance(session.id, "지우고 싶은 이야기");
    await store.softDeleteUtterance(u.id);
    await expect(
      store.draftHeartWillParagraphs(session.id, [
        { body: "지운 이야기로 만든 문단", origin: "AI_DRAFT", sourceUtteranceId: u.id },
      ]),
    ).rejects.toThrow();
  });

  it("초안 생성기는 모든 문단에 근거를 단다 — 근거 없는 산출물이 나올 수 없다", async () => {
    const drafts = buildDraftParagraphs(
      [
        { id: "u1", text: "  이야기 하나  " },
        { id: "u2", text: "이야기 둘." },
        { id: "u3", text: "   " }, // 빈 발화는 문단이 되지 않는다
      ],
      [],
    );
    expect(drafts).toHaveLength(2);
    expect(drafts.every((d) => d.sourceUtteranceId !== "")).toBe(true);
    expect(drafts.every((d) => d.origin === "AI_DRAFT")).toBe(true);
    expect(drafts[0]!.body).toBe("이야기 하나."); // 끝맺음만 보태고 말을 바꾸지 않는다
    expect(drafts[1]!.body).toBe("이야기 둘.");
  });

  it("이미 문단이 있는 발화는 다시 초안이 되지 않는다 (한 이야기가 두 문단이 되지 않게)", () => {
    const drafts = buildDraftParagraphs(
      [{ id: "u1", text: "이야기 하나" }, { id: "u2", text: "이야기 둘" }],
      [{ sourceUtteranceId: "u1" }],
    );
    expect(drafts.map((d) => d.sourceUtteranceId)).toEqual(["u2"]);
  });

  it("응답의 모든 diff 항목이 근거 발화를 달고 나온다", async () => {
    const { sessionId, head, utterances } = await seeded();
    const res = await apply({
      sessionId,
      acceptedParagraphIds: head.paragraphs.map((p) => p.id),
    });
    const { data } = await res.json();
    expect(data.diff).toHaveLength(2);
    expect(data.diff.every((d: { kind: string }) => d.kind === "ADDED")).toBe(true);
    const sources = data.diff.map((d: { sourceUtteranceId: string }) => d.sourceUtteranceId);
    expect(sources.sort()).toEqual(utterances.map((u) => u.id).sort());
  });
});

describe("M-HEARTWILL — 변경 요약", () => {
  it("같은 발화의 새 문장은 EDITED, 새 발화의 문장은 ADDED, 이월분은 diff에 없다", async () => {
    const { sessionId, head, utterances } = await seeded();
    await apply({ sessionId, acceptedParagraphIds: head.paragraphs.map((p) => p.id) });

    await store.draftHeartWillParagraphs(sessionId, [
      {
        body: "미안했던 마음을, 제 말로 남깁니다.",
        origin: "USER_WRITTEN",
        sourceUtteranceId: utterances[0]!.id,
      },
    ]);
    const staged = (await store.getHeartWillHead(sessionId))!;
    const own = staged.paragraphs.find((p) => p.origin === "USER_WRITTEN")!;

    const { data } = await (await apply({
      sessionId,
      acceptedParagraphIds: [own.id],
    })).json();
    // 둘째 문단은 그대로 이월됐으므로 diff에 없다 — 바뀐 것만 보여준다
    expect(data.diff).toHaveLength(1);
    expect(data.diff[0].kind).toBe("EDITED");
    expect(data.diff[0].sourceUtteranceId).toBe(utterances[0]!.id);
  });

  it("옛 본문이 물려받아지지 않으면 REMOVED로 남는다", () => {
    const at = new Date().toISOString();
    const p = (id: string, body: string, src: string) => ({
      id,
      ord: 0,
      body,
      origin: "AI_DRAFT" as const,
      sourceUtteranceId: src,
      acceptedAt: at,
      createdAt: at,
    });
    const diff = diffParagraphs([p("a", "옛 문장", "u1")], [p("b", "새 문장", "u2")]);
    expect(diff).toEqual([
      { paragraphId: "b", kind: "ADDED", sourceUtteranceId: "u2" },
      { paragraphId: "a", kind: "REMOVED", sourceUtteranceId: "u1" },
    ]);
  });
});

describe("M-HEARTWILL — 화면 (NON_BINDING)", () => {
  const page = readFileSync(`${UI}/page.tsx`, "utf-8");
  const approval = readFileSync(`${UI}/ParagraphApproval.tsx`, "utf-8");

  it("서명 버튼도 서명 API 호출도 없다 (민법 §1066 · 절대규칙 4)", () => {
    for (const src of [page, approval]) {
      expect(src).not.toContain("/api/sign");
      expect(src).not.toMatch(/서명\s*(요청|하기)/);
    }
  });

  it("'법적 효력이 없는 문서입니다'가 영구 노출된다 — 인쇄물에서도 사라지지 않는다", () => {
    expect(page).toContain("법적 효력이 없는 문서입니다");
    // 고지를 조건부로 감싸거나 인쇄에서 숨기면 이 화면의 전제가 무너진다
    expect(page).not.toContain("print:hidden");
  });

  it("승인 기본값은 전부 꺼짐이고 '전체 선택' 지름길이 없다 (P1)", () => {
    expect(approval).toContain("useState<Set<string>>(new Set())");
    expect(approval).not.toContain("전체 선택");
  });

  it("AI 문장과 사용자 문장이 문구로도 구분된다 (색만으로 나누지 않는다 — NFR-701)", () => {
    expect(approval).toContain("AI가 옮긴 문장");
    expect(approval).toContain("직접 쓰신 문장");
    expect(approval).toContain("border-dashed"); // AI 초안의 시각 구분
  });
});
