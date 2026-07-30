// M-PAPER-SCAN — POST /api/paper-scan/extract (FR-401 · 02.5 DP+IE)
//
// 판독 결과는 **기존 확정 흐름으로 합류**한다: IntentFact[] → FactSheet 확정 → 게이트.
// 새 확정 경로를 만들지 않는다 — P1의 확정 지점은 하나여야 한다.
import { randomUUID } from "node:crypto";
import { PaperScanExtractReq, PaperScanRes, type IntentFact } from "@/lib/contracts";
import { scanner } from "@/lib/ai/document";
import { saveFacts } from "@/lib/ai/session/store";
import { CONFIDENCE } from "@/lib/ai/extract/confidence";
import { track } from "@/lib/observability/track";
import { dropUpload, takeUpload } from "../store";

const err = (code: string, message: string, nextAction: string, status: number) =>
  Response.json({ ok: false, error: { code, message, nextAction } }, { status });

export async function POST(req: Request) {
  const t0 = Date.now();
  const parsed = PaperScanExtractReq.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return err("INVALID_REQUEST", "요청 형식이 올바르지 않습니다.", "다시 시도해 주세요.", 400);
  }

  const upload = takeUpload(parsed.data.uploadId);
  if (!upload) {
    return err(
      "UPLOAD_EXPIRED",
      "올리신 사진을 더 이상 찾을 수 없습니다.",
      "사진을 다시 올려 주세요.",
      404,
    );
  }
  // 방어선 2중화 — 업로드에서 확인했지만 여기서도 본다 (NFR-711)
  if (!upload.transferConsent) {
    return err(
      "TRANSFER_CONSENT_REQUIRED",
      "외부 판독 동의가 확인되지 않았습니다.",
      "동의 후 다시 시도해 주세요.",
      400,
    );
  }

  let result;
  try {
    result = await scanner.scan({
      bytes: upload.bytes,
      mimeType: upload.mimeType,
      fileName: upload.fileName,
    });
  } catch (e) {
    track("EXTRACT", false, Date.now() - t0);
    console.warn("[paper-scan] 판독 실패:", (e as Error).message);
    return err(
      "SCAN_FAILED",
      "사진을 읽는 데 시간이 걸리네요.",
      "다시 시도하거나 직접 입력해 주세요.",
      502,
    );
  } finally {
    // 판독이 끝나면 원본을 메모리에서 지운다 (오래 들고 있지 않는다)
    dropUpload(parsed.data.uploadId);
  }

  // 종이에서 읽은 값도 AI 산출물이다 — confirmed=false로 시작한다 (P1).
  // 근거는 대화 발화가 아니라 문서이므로 sourceSpan은 null이고, 신뢰도는
  // 사람이 원문(parsedText)을 보고 확인하는 것을 전제로 MEDIUM으로 둔다.
  const facts: IntentFact[] = result.fields.map((f) => ({
    id: randomUUID(),
    key: f.key,
    value: f.value,
    confidence: CONFIDENCE.MEDIUM,
    sourceSpan: null,
    confirmed: false,
  }));

  // 기존 확정 흐름으로 합류 — 확정된 값은 덮지 않는다 (StorePort가 보장)
  const effective = await saveFacts(upload.intentId, facts);
  track("EXTRACT", true, Date.now() - t0);

  return Response.json({
    ok: true,
    data: PaperScanRes.parse({
      parsedText: result.parsedText,
      extractedFacts: effective,
    }),
  });
}
