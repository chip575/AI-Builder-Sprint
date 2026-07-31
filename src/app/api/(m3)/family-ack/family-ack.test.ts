// M-FAMILY-ACK 테스트 (FR-554)
// 이 모듈에서 지켜야 하는 것은 기능이 아니라 **경계**다 —
// 가족의 거부가 본인의 뜻을 무너뜨리지 않는다는 것, 그리고 알리지 않을 자유.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { store } from "@/lib/store";
import { mockSigner } from "@/lib/signer";
import { POST as webhookPost } from "@/app/api/(m0)/webhooks/modusign/route";
import { drainOutbox } from "@/app/api/(m0)/webhooks/modusign/outbox";
import { GET, POST } from "./route";

/** 외부 이벤트를 실제 웹훅 경로로 흘려보낸다 — 아웃박스는 적재된 이벤트만 처리한다 */
async function deliver(documentId: string, event: string) {
  const payload = await mockSigner!.simulateEvent(documentId, event);
  await webhookPost(
    new Request("http://localhost/api/webhooks/modusign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  // 라우트의 드레인은 응답 후에 돈다(after) — 테스트는 요청 컨텍스트 밖이라
  // 여기서 한 번 더 명시적으로 돌려 정착시킨다. 드레인은 멱등이다
  await drainOutbox();
}

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/family-ack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

async function materialNode() {
  const session = await store.getOrCreateSession();
  const node = await store.appendLedgerNode({
    subjectId: session.id,
    materiality: "MATERIAL",
    changeSummary: { beneficiary: "장남 → 차녀" },
    changeReason: "가족과 상의한 끝에 바꿉니다.",
    draftId: randomUUID(), // 본인 확인서가 이미 있다 (순차 전제 충족)
  });
  return node;
}

describe("M-FAMILY-ACK — 알리지 않을 자유 (P4)", () => {
  it("recipientIds가 비어도 성공한다 — 요청 0건이 정상이다", async () => {
    const node = await materialNode();
    const res = await post({ ledgerNodeId: node.id, recipientIds: [] });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.requested).toBe(0);
    expect(data.acks).toEqual([]);
    // 노드 자체는 그대로 유효하다 — 통지가 유효성의 조건이 아니다
    expect((await store.getLedgerNode(node.id))!.status).toBe("ACTIVE");
  });
});

describe("M-FAMILY-ACK — 거부해도 본인 확인서는 그대로", () => {
  it("가족이 거부하면 거부 사실만 남고 노드는 ACTIVE를 유지한다", async () => {
    const node = await materialNode();
    const res = await post({ ledgerNodeId: node.id, recipientIds: [randomUUID()] });
    expect(res.status).toBe(200);

    const [ack] = await store.listFamilyAcks(node.id);
    expect(ack!.status).toBe("PENDING");

    // 가족이 거부한다 — 별도 API가 아니라 서명 웹훅으로 들어온다
    await deliver(ack!.documentId!, "document_rejected");

    const [after] = await store.listFamilyAcks(node.id);
    expect(after!.status).toBe("DECLINED");
    expect((await store.getLedgerNode(node.id))!.status).toBe("ACTIVE");
  });

  it("가족이 서명하면 ACKNOWLEDGED가 된다", async () => {
    const node = await materialNode();
    await post({ ledgerNodeId: node.id, recipientIds: [randomUUID()] });
    const [ack] = await store.listFamilyAcks(node.id);

    await deliver(ack!.documentId!, "document_all_signed");

    const [after] = await store.listFamilyAcks(node.id);
    expect(after!.status).toBe("ACKNOWLEDGED");
    expect(after!.signedAt).not.toBeNull();
  });
});

describe("M-FAMILY-ACK — 순차 보장", () => {
  it("본인 확인서 없이 실질 변경을 알리려 하면 거부한다", async () => {
    const session = await store.getOrCreateSession();
    const node = await store.appendLedgerNode({
      subjectId: session.id,
      materiality: "MATERIAL",
      changeSummary: { beneficiary: "장남 → 차녀" },
      changeReason: "아직 본인 서명 전입니다.",
      draftId: null,
    });
    const res = await post({ ledgerNodeId: node.id, recipientIds: [randomUUID()] });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("SELF_SIGN_REQUIRED");
    expect(await store.listFamilyAcks(node.id)).toHaveLength(0);
  });

  it("없는 노드 → 404", async () => {
    const res = await post({ ledgerNodeId: randomUUID(), recipientIds: [] });
    expect(res.status).toBe(404);
  });
});

describe("M-FAMILY-ACK — 조회", () => {
  it("GET이 노드별 인지 현황을 준다", async () => {
    const node = await materialNode();
    await post({ ledgerNodeId: node.id, recipientIds: [randomUUID(), randomUUID()] });
    const res = await GET(
      new Request(`http://localhost/api/family-ack?ledgerNodeId=${node.id}`),
    );
    const { data } = await res.json();
    expect(data.requested).toBe(2);
    expect(data.acks.every((a: { status: string }) => a.status === "PENDING")).toBe(true);
  });
});

describe("M-FAMILY-ACK — 동의가 아니라 인지 (FR-554)", () => {
  const sources = [
    "src/app/api/(m3)/family-ack/route.ts",
    "supabase/migrations/20260731032933_family_ack.sql",
  ].map((p) => readFileSync(p, "utf-8"));

  it("코드·스키마 어디에도 '동의' 어휘가 없다", () => {
    // "동의"라고 쓰는 순간 가족이 거부하면 뜻이 막히는 것처럼 읽힌다
    for (const src of sources) {
      // "동의가 아니다"라는 **부정 설명**만 허용한다. 그 밖의 쓰임을 막는다 —
      // 어휘를 지우는 게 목적이 아니라 "동의로 읽히는 문구"를 막는 것이다
      // 설명 주석("동의가 아니다") 한 번을 넘어서면 어딘가에서 동의로 쓰고 있다는 뜻이다
      const uses = src.split("동의").length - 1;
      expect(uses).toBeLessThanOrEqual(1);
      if (uses === 1) expect(src).toContain("아니");
    }
  });

  it("스키마 상태값이 인지·거부이지 승인·반려가 아니다", () => {
    expect(sources[1]).toContain("ACKNOWLEDGED");
    expect(sources[1]).toContain("DECLINED");
    expect(sources[1]).not.toContain("APPROVED");
  });
});
