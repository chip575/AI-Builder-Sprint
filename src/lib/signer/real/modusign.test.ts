// realSigner 테스트 — 네트워크 없이 요청 조립·응답 파싱을 검증한다.
// 픽스처는 공식 문서의 필드 구조 기준 (2026-07-30). 실측은 키 도착 후 02.3 검증 게이트.
import { describe, expect, it } from "vitest";
import { ModusignSigner } from "./modusign";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** 호출을 기록하고 정해진 응답을 돌려주는 fetch */
function stubFetch(responses: { status: number; body?: unknown }[]) {
  const calls: Call[] = [];
  let i = 0;
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({
      url: String(url),
      method: init.method!,
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body ?? {},
      text: async () => JSON.stringify(r.body ?? {}),
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const make = (fetchImpl: typeof fetch, extra: Record<string, unknown> = {}) =>
  new ModusignSigner({
    apiKey: "test-key",
    templateIds: { DONATION_PLEDGE: "tpl-123" },
    fetchImpl,
    sleep: async () => {}, // 백오프 대기 제거
    ...extra,
  });

const input = {
  templateKey: "DONATION_PLEDGE",
  draftId: "00000000-0000-4000-8000-000000000001",
  signerName: "김가상",
  signerEmail: "fake@example.com",
};

describe("realSigner — 요청 조립", () => {
  it("템플릿 요청: 경로·Basic 인증·UTF-8 · metadatas에 draftId 역참조", async () => {
    const { impl, calls } = stubFetch([{ status: 201, body: { id: "doc-1" } }]);
    const r = await make(impl).requestWithTemplate(input);

    expect(r.documentId).toBe("doc-1");
    const c = calls[0]!;
    expect(c.url).toBe("https://api.modusign.co.kr/documents/request-with-template");
    expect(c.method).toBe("POST");
    expect(c.headers.Authorization).toBe(
      // 콜론이 **앞**이다 — 조회 API로 실측했다 (2026-08-01)
      `Basic ${Buffer.from(":test-key").toString("base64")}`,
    );
    expect(c.headers["Content-Type"]).toContain("charset=utf-8");

    const body = c.body as { templateId: string; document: Record<string, any> };
    expect(body.templateId).toBe("tpl-123");
    expect(body.document.metadatas).toEqual([
      { key: "draftId", value: input.draftId },
    ]);
    expect(body.document.participantMappings[0].name).toBe("김가상");
  });

  it("템플릿 미등록 → 무엇을 설정해야 하는지 알려주며 실패", async () => {
    const { impl } = stubFetch([{ status: 201 }]);
    await expect(
      make(impl).requestWithTemplate({ ...input, templateKey: "LEGACY_GIFT_AGREEMENT" }),
    ).rejects.toThrow(/MODUSIGN_TEMPLATE_LEGACY_GIFT/ /* DocType이 아니라 서식 코드로 안내한다 */);
  });

  it("취소: message 필수(2~200자) + 경로", async () => {
    const { impl, calls } = stubFetch([{ status: 200, body: {} }]);
    await make(impl).cancel("doc-1", "내용을 수정해서 다시 보냅니다");
    expect(calls[0]!.url).toContain("/documents/doc-1/cancel");
    expect((calls[0]!.body as { message: string }).message).toContain("다시");
  });

  it("빈 사유여도 message를 비우지 않는다 (2자 미만이면 400)", async () => {
    const { impl, calls } = stubFetch([{ status: 200, body: {} }]);
    await make(impl).cancel("doc-1", "   ");
    expect((calls[0]!.body as { message: string }).message.length).toBeGreaterThan(2);
  });

  it("재발송: 본문 없이 POST", async () => {
    const { impl, calls } = stubFetch([{ status: 200, body: {} }]);
    await make(impl).resendNotification("doc-1");
    expect(calls[0]!.url).toContain("/documents/doc-1/remind-signing");
    expect(calls[0]!.body).toBeUndefined();
  });

  it("임베디드는 조용히 링크로 대체하지 않고 명시적으로 실패한다", async () => {
    const { impl } = stubFetch([{ status: 201 }]);
    await expect(make(impl).createEmbeddedDraft(input)).rejects.toThrow(/임베디드/);
  });
});

describe("realSigner — 응답 파싱 (상태 매핑)", () => {
  const doc = (over: Record<string, unknown>) => ({
    status: 200,
    body: {
      id: "doc-1",
      status: "ON_GOING",
      startedAt: "2026-07-30T00:00:00.000Z",
      requester: { name: "남기다" },
      participants: [{ id: "p1", type: "SIGNER", name: "김가상" }],
      signings: [],
      metadatas: [{ key: "draftId", value: input.draftId }],
      ...over,
    },
  });

  it("ON_GOING → REQUESTED, metadatas는 역참조로 복원된다", async () => {
    const { impl } = stubFetch([doc({})]);
    const d = (await make(impl).getDocument("doc-1"))!;
    expect(d.status).toBe("REQUESTED");
    expect(d.metadata.draftId).toBe(input.draftId);
    expect(d.parties.map((p) => p.role)).toEqual(["REQUESTER", "SIGNER"]);
    expect(d.parties[1]!.signedAt).toBeNull();
  });

  it("COMPLETED → 완료 시각은 마지막 서명 시각", async () => {
    const { impl } = stubFetch([
      doc({
        status: "COMPLETED",
        signings: [
          { participantId: "p1", signedAt: "2026-07-30T01:00:00.000Z" },
        ],
      }),
    ]);
    const d = (await make(impl).getDocument("doc-1"))!;
    expect(d.status).toBe("COMPLETED");
    expect(d.completedAt).toBe("2026-07-30T01:00:00.000Z");
    expect(d.parties[1]!.signedAt).toBe("2026-07-30T01:00:00.000Z");
  });

  it("ABORTED + REJECTION → REJECTED + 사유, 그 외 abort는 CANCELED", async () => {
    const rejected = stubFetch([
      doc({ status: "ABORTED", abort: { type: "REJECTION", message: "금액이 다릅니다" } }),
    ]);
    const a = (await make(rejected.impl).getDocument("doc-1"))!;
    expect(a.status).toBe("REJECTED");
    expect(a.rejectReason).toBe("금액이 다릅니다");

    const canceled = stubFetch([
      doc({ status: "ABORTED", abort: { type: "REQUEST_CANCELLATION", message: "취소" } }),
    ]);
    expect((await make(canceled.impl).getDocument("doc-1"))!.status).toBe("CANCELED");
  });

  it("PROCESSING_FAILED는 우리 상태를 옮기지 않는다 (리컨실러가 재확인)", async () => {
    const { impl } = stubFetch([doc({ status: "PROCESSING_FAILED" })]);
    const d = (await make(impl).getDocument("doc-1"))!;
    expect(d.status).toBe("REQUESTED"); // 폴백 — COMPLETED로 넘어가지 않는다
  });
});

describe("realSigner — 실패 처리 (02.3 §5)", () => {
  it("5xx는 재시도하고, 계속 실패하면 명시적으로 던진다", async () => {
    const { impl, calls } = stubFetch([{ status: 503 }]);
    await expect(make(impl, { maxRetries: 2 }).getDocument("doc-1")).rejects.toThrow(
      /signer:modusign/,
    );
    expect(calls).toHaveLength(3); // 최초 1 + 재시도 2
  });

  it("5xx 후 성공하면 결과를 돌려준다", async () => {
    const { impl, calls } = stubFetch([
      { status: 500 },
      { status: 200, body: { id: "doc-1", status: "COMPLETED" } },
    ]);
    const d = await make(impl).getDocument("doc-1");
    expect(d?.status).toBe("COMPLETED");
    expect(calls.length).toBeGreaterThan(1);
  });

  it("4xx는 재시도하지 않는다 — 같은 요청은 같은 결과다", async () => {
    const { impl, calls } = stubFetch([{ status: 400, body: { message: "bad" } }]);
    await expect(make(impl).requestWithTemplate(input)).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("404 조회는 null (없는 문서)", async () => {
    const { impl } = stubFetch([{ status: 404 }]);
    expect(await make(impl).getDocument("nope")).toBeNull();
  });
});
