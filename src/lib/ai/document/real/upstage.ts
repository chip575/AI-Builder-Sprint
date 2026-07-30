// real 종이 판독기 — Upstage Document Parse + Information Extract (FR-401 · D-06)
//
// 근거 문서 (2026-07-30 확인, https://console.upstage.ai/api/docs/for-agents/raw):
//  · Document Parse   POST /v1/document-digitization
//      multipart: model="document-parse", document=<file>
//      응답: { content: { markdown, text, html }, elements[] }
//  · Information Extract  POST /v1/information-extraction
//      JSON: model="information-extract",
//            messages[0].content[0] = { type:"image_url", image_url:{ url:"data:...;base64,..." } }
//            response_format = { type:"json_schema", json_schema:{ name, schema } }
//      응답: choices[0].message.content (JSON 문자열)
//      ⚠ 스키마 제약: 1차 속성은 string/integer/number/array만 (object 금지), 중첩 배열 불가
//  · 인증 Authorization: Bearer
//
// ⚠ 업로드 원본이 **외부로 전송된다** (D-10) — 화면의 전송 고지·동의가 전제다 (NFR-711).
// ⚠ fetch 주입 — 네트워크 없이 요청 조립·응답 파싱을 테스트한다.
import { parseAmount } from "../../extract/parse-amount";
import type { DocumentScannerPort, ScanInput, ScanResult } from "../port";

export const UPSTAGE_BASE = "https://api.upstage.ai/v1";

/** IE 스키마 — 1차 속성은 평면 타입만 (문서 제약) */
const IE_SCHEMA = {
  name: "paper_pledge",
  schema: {
    type: "object",
    properties: {
      donorName: { type: "string" },
      region: { type: "string" },
      amountText: { type: "string" },
      pledgedAt: { type: "string" },
    },
    required: [],
  },
} as const;

export interface UpstageScannerOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

export class UpstageScanner implements DocumentScannerPort {
  private fetchImpl: typeof fetch;
  private base: string;
  private timeoutMs: number;

  constructor(private opts: UpstageScannerOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.base = opts.baseUrl ?? UPSTAGE_BASE;
    this.timeoutMs = opts.timeoutMs ?? 60_000; // 문서 판독은 페이지당 ~0.6초
  }

  private async call(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.opts.apiKey}`, ...(init.headers ?? {}) },
        signal: controller.signal,
      });
      if (!res.ok) {
        // 조용히 mock으로 떨어지지 않는다 — 라우트가 사용자 문구로 번역한다 (보안 7조)
        throw new Error(
          `[scan:upstage] ${path} 실패: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`,
        );
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  async scan(input: ScanInput): Promise<ScanResult> {
    // 1) Document Parse — 판독 (표·손글씨 포함, markdown 출력)
    const form = new FormData();
    form.append("model", "document-parse");
    form.append(
      "document",
      new Blob([input.bytes as unknown as BlobPart], { type: input.mimeType }),
      input.fileName,
    );
    const dp = (await (
      await this.call("/document-digitization", { method: "POST", body: form })
    ).json()) as { content?: { markdown?: string; text?: string } };
    const parsedText = dp.content?.markdown ?? dp.content?.text ?? "";

    // 2) Information Extract — 구조화 (문서 입력 전용, D-06)
    const base64 = Buffer.from(input.bytes).toString("base64");
    const ie = (await (
      await this.call("/information-extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "information-extract",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: `data:${input.mimeType};base64,${base64}` },
                },
              ],
            },
          ],
          response_format: { type: "json_schema", json_schema: IE_SCHEMA },
        }),
      })
    ).json()) as { choices?: { message?: { content?: string } }[] };

    const raw = ie.choices?.[0]?.message?.content;
    if (!raw) throw new Error("[scan:upstage] IE 응답이 비었습니다");
    let parsed: Record<string, string | undefined>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("[scan:upstage] IE 응답이 JSON이 아닙니다");
    }

    return { parsedText, fields: toFields(parsed) };
  }
}

/** IE 출력 → 우리 슬롯. 금액 해석은 대화 경로와 **같은 파서**를 쓴다 */
export function toFields(
  parsed: Record<string, string | undefined>,
): ScanResult["fields"] {
  const fields: ScanResult["fields"] = [];

  if (parsed.region) {
    // "부산광역시" → "부산" (지역 표기 정규화)
    const region = parsed.region.replace(/특별시|광역시|특별자치시|도$/g, "").trim();
    if (region) fields.push({ key: "region", value: region, sourceText: parsed.region });
  }

  if (parsed.amountText) {
    const amount = parseAmount(parsed.amountText);
    if (amount) {
      fields.push({ key: "amount", value: amount.value, sourceText: parsed.amountText });
    }
  }

  return fields;
}
