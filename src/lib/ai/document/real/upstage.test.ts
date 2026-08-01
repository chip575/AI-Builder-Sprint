// UpstageScanner 테스트 — 네트워크 없이 요청 조립·응답 파싱을 검증한다.
//
// 이 파일이 생긴 이유: 실 호출에서 판독문이 조용히 사라지고 있었다 (2026-08-01).
// Document Parse 2.0은 output_formats를 안 주면 content.html만 채우고
// markdown·text는 **빈 문자열**로 돌려준다. ??는 ""를 통과하므로 parsedText가 ""가 되고,
// 라우트는 그대로 200을 냈다. mock 판독기는 항상 픽스처를 주므로 드러나지 않았다.
import { describe, expect, it } from "vitest";
import { UpstageScanner } from "./upstage";

interface Call {
  path: string;
  form?: FormData;
}

/** 1번째 호출 = Document Parse, 2번째 = Information Extract */
function stub(dpContent: unknown, ieFields: Record<string, string> = {}) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const path = String(url);
    calls.push({ path, form: init.body instanceof FormData ? init.body : undefined });
    const body = path.includes("document-digitization")
      ? { content: dpContent }
      : { choices: [{ message: { content: JSON.stringify(ieFields) } }] };
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => "",
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const input = {
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "application/pdf",
  fileName: "p.pdf",
};

const make = (impl: typeof fetch) => new UpstageScanner({ apiKey: "up_test", fetchImpl: impl });

describe("UpstageScanner — 판독문 확보", () => {
  it("output_formats를 명시해서 요청한다 (안 주면 markdown이 빈다)", async () => {
    const { impl, calls } = stub({ markdown: "# 기부 약정서", text: "", html: "<h1>" });
    await make(impl).scan(input);
    const dp = calls.find((c) => c.path.includes("document-digitization"))!;
    expect(String(dp.form?.get("output_formats"))).toContain("markdown");
  });

  it("markdown이 비고 text만 있으면 text를 쓴다 — ??는 빈 문자열을 통과시킨다", async () => {
    const { impl } = stub({ markdown: "", text: "기부 약정서 본문", html: "<h1>제목</h1>" });
    const r = await make(impl).scan(input);
    expect(r.parsedText).toBe("기부 약정서 본문");
  });

  it("markdown·text가 모두 비면 조용히 넘기지 않고 실패한다 (보안 7조)", async () => {
    // 실 응답 모양 그대로 — 키는 있는데 값이 빈 문자열이고 html에만 내용이 있다
    const { impl } = stub({ markdown: "", text: "", html: "<h1>기 부 약 정 서</h1>" });
    await expect(make(impl).scan(input)).rejects.toThrow(/판독 결과가 비었습니다/);
  });
});

describe("UpstageScanner — 구조화", () => {
  it("빈 양식이면 항목이 없다 — 없는 값을 지어내지 않는다", async () => {
    const { impl } = stub({ markdown: "# 기부 약정서\n\n| 기부자 성명 |\n| --- |" }, {});
    const r = await make(impl).scan(input);
    expect(r.fields).toEqual([]);
    expect(r.parsedText).toContain("기부 약정서"); // 판독문은 남는다
  });

  it("채워진 양식은 대화 경로와 같은 파서로 금액을 해석한다", async () => {
    const { impl } = stub(
      { markdown: "# 기부 약정서" },
      { region: "부산광역시", amountText: "금 삼십만원정 (300,000원)" },
    );
    const r = await make(impl).scan(input);
    expect(r.fields).toContainEqual(
      expect.objectContaining({ key: "region", value: "부산" }), // 표기 정규화
    );
    expect(r.fields).toContainEqual(expect.objectContaining({ key: "amount", value: 300_000 }));
  });
});
