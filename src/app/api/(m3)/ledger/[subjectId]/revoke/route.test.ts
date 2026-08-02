// M-LEDGER-REVOKE — 철회 (FR-405 · 민법 §1108①)
//
// 철회는 되돌릴 수 없는 행위다. 그래서 검사의 무게중심이 셋에 있다:
//   ① 남의 약정을 철회할 수 있나
//   ② 철회하면 안 되는 문서까지 철회되나
//   ③ **증빙이 남나** — 철회는 삭제가 아니다 (P5)
import { beforeEach, describe, expect, it } from "vitest";
import { DEV_USER_ID } from "@/lib/store/types";
import { store } from "@/lib/store";
import { POST } from "./route";
import type { DocType } from "@/lib/contracts";

async function seed(docType: DocType, userId = DEV_USER_ID) {
  const session = await store.getOrCreateSession(null, userId);
  const draft = await store.createDraft(session.id, docType, {
    verdict: "ESIGN_OK",
    statutes: [],
  });
  await store.appendLedgerNode({
    subjectId: draft.draftId,
    changeSummary: { first: true },
    changeReason: "처음 남긴 뜻",
    materiality: "MATERIAL",
  });
  return draft;
}

const revoke = (subjectId: string, body: unknown) =>
  POST(
    new Request(`http://localhost/api/ledger/${subjectId}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ subjectId }) },
  );

describe("철회 — 되는 경우", () => {
  it("사인증여 약정을 철회하면 살아 있는 뜻이 없어진다", async () => {
    const draft = await seed("LEGACY_GIFT_AGREEMENT");
    const res = await revoke(draft.draftId, { changeReason: "받으실 곳을 바꾸기로 했습니다" });
    const { ok, data } = await res.json();

    expect(ok).toBe(true);
    // ACTIVE가 하나도 없어야 한다 — 전부 REVOKED면 유도에서 다 빠진다
    expect(data.nodes.every((n: { status: string }) => n.status === "REVOKED")).toBe(true);
    expect(data.nodes.some((n: { status: string }) => n.status === "ACTIVE")).toBe(false);
  });

  it("사유가 이력에 남는다 — 없으면 '사라졌다'는 사실만 남는다", async () => {
    const draft = await seed("LEGACY_GIFT_AGREEMENT");
    const { data } = await (
      await revoke(draft.draftId, { changeReason: "가족과 상의했습니다" })
    ).json();
    expect(
      data.nodes.some((n: { changeReason: string }) => n.changeReason === "가족과 상의했습니다"),
    ).toBe(true);
    // 처음 남긴 뜻도 지워지지 않는다 — 철회는 삭제가 아니다 (P5)
    expect(data.nodes.some((n: { changeReason: string }) => n.changeReason === "처음 남긴 뜻")).toBe(
      true,
    );
  });

  it("🔴 해시 체인이 깨지지 않는다 — status는 봉인 대상이 아니다", async () => {
    // 철회하면서 해시를 다시 계산하면 지난 노드가 전부 바뀌어 검증이 통째로 깨진다.
    // 그러면 유족 화면에 "이력이 변조되었습니다"가 뜬다
    const draft = await seed("LEGACY_GIFT_AGREEMENT");
    const { data } = await (await revoke(draft.draftId, { changeReason: "뜻이 바뀌었습니다" })).json();
    expect(data.chainValid).toBe(true);
  });

  it("🔴 문서 상태는 건드리지 않는다 — 서명된 증빙이 남아야 한다", async () => {
    const draft = await seed("LEGACY_GIFT_AGREEMENT");
    await store.markDraftRequested(draft.draftId, "mock-doc-1");
    await store.syncDraftStatus(draft.draftId, "COMPLETED");
    await revoke(draft.draftId, { changeReason: "철회합니다" });

    // COMPLETED → CANCELED는 역행 전이라 canTransition이 막는다.
    // 뚫으면 외부에서 온 COMPLETED와 매 턴 싸운다
    expect((await store.getDraft(draft.draftId))?.status).toBe("COMPLETED");
  });
});

describe("🔴 철회하면 안 되는 것", () => {
  it("남의 약정은 철회되지 않는다", async () => {
    const other = "66666666-6666-4666-8666-666666666666";
    const draft = await seed("LEGACY_GIFT_AGREEMENT", other);
    const res = await revoke(draft.draftId, { changeReason: "남의 것" });

    expect(res.status).toBe(404); // 없는 것과 같은 응답 — 구분하면 id를 탐색할 수 있다
    const nodes = await store.listLedgerNodes(draft.draftId);
    expect(nodes.every((n) => n.status !== "REVOKED")).toBe(true); // 실제로 살아 있어야 한다
  });

  it("이미 이행된 기부는 철회가 아니다 — 안내로 돌린다", async () => {
    const draft = await seed("DONATION_PLEDGE");
    const res = await revoke(draft.draftId, { changeReason: "그만두고 싶어요" });
    const { error } = await res.json();

    expect(res.status).toBe(409);
    expect(error.message).toContain("기관에 직접 문의");
    expect(await store.listLedgerNodes(draft.draftId)).toHaveLength(1); // 노드가 늘지 않는다
  });

  it("정기후원은 '해지'라고 부른다 — 한 단어로 뭉개지 않는다", async () => {
    const draft = await seed("RECURRING_CONSENT");
    const { error } = await (await revoke(draft.draftId, { changeReason: "그만" })).json();
    expect(error.message).toContain("해지");
    // "이미 보내신 후원금은 그대로 남습니다"를 알려야 오해가 없다
    expect(error.message).toContain("그대로 남습니다");
  });

  it("유언장은 이곳에서 처리하지 않는다 (민법 §1108① — 새 유언·파기)", async () => {
    const draft = await seed("HANDWRITTEN_WILL");
    const { error } = await (await revoke(draft.draftId, { changeReason: "취소" })).json();
    expect(error.message).toContain("파기");
  });

  it("두 번 눌러도 이력이 쌓이지 않는다", async () => {
    const draft = await seed("LEGACY_GIFT_AGREEMENT");
    await revoke(draft.draftId, { changeReason: "철회합니다" });
    const before = (await store.listLedgerNodes(draft.draftId)).length;
    const res = await revoke(draft.draftId, { changeReason: "또 철회" });

    expect(res.status).toBe(409);
    expect(await store.listLedgerNodes(draft.draftId)).toHaveLength(before);
  });

  it("사유 없이는 철회되지 않는다 — 정황이 남지 않는 철회는 기록이 아니다", async () => {
    const draft = await seed("LEGACY_GIFT_AGREEMENT");
    const res = await revoke(draft.draftId, { changeReason: "" });
    expect(res.status).toBe(400);
    expect((await store.listLedgerNodes(draft.draftId)).every((n) => n.status !== "REVOKED")).toBe(
      true,
    );
  });
});

describe("통지", () => {
  it("철회 시점에 보내지 않는다 — 확인 단계를 거친다", async () => {
    const draft = await seed("LEGACY_GIFT_AGREEMENT");
    const recipient = await store.upsertRecipient(DEV_USER_ID, {
      kind: "ORG",
      name: "가상재단",
      email: "org@example.org",
    });
    const { data } = await (
      await revoke(draft.draftId, {
        changeReason: "철회합니다",
        notifyRecipientId: recipient.id,
      })
    ).json();

    // 대상만 돌려준다. 실제 발송은 사용자가 확인 화면에서 한 번 더 누른다 —
    // 상대에게 무언가 보내는 일은 서명 요청과 같은 규약이다
    expect(data.notifyRecipientId).toBe(recipient.id);
  });
});

describe("문서마다 부르는 말이 다르다", () => {
  beforeEach(() => {});
  it.each([
    ["LEGACY_GIFT_AGREEMENT", "철회하기"],
    ["RECURRING_CONSENT", "해지 안내 보기"],
    ["CUSTODIAN_AGREEMENT", "권한 회수하기"],
  ] as const)("%s → %s", async (docType, label) => {
    const { revocationRule } = await import("@/lib/rules/revocation");
    expect(revocationRule(docType).label).toBe(label);
  });
});
