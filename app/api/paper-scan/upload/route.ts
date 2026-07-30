// M-PAPER-SCAN — POST /api/paper-scan/upload (FR-401 · NFR-711)
// multipart 수신. **외부 전송 동의 없이는 보관하지 않는다** — 업로드 자체가
// 전송의 전제가 되므로, 동의는 파일보다 먼저 확인한다 (D-10 · NFR-711).
import { PaperScanUploadRes } from "@/lib/contracts";
import { getSession } from "@/lib/ai/session/store";
import { putUpload } from "../store";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED = ["image/jpeg", "image/png", "image/heic", "image/tiff", "application/pdf"];

const err = (code: string, message: string, nextAction: string, status: number) =>
  Response.json({ ok: false, error: { code, message, nextAction } }, { status });

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return err("INVALID_REQUEST", "파일을 읽지 못했습니다.", "다시 올려 주세요.", 400);
  }

  // NFR-711 — 동의가 없으면 파일을 받지 않는다
  if (form.get("transferConsent") !== "true") {
    return err(
      "TRANSFER_CONSENT_REQUIRED",
      "사진을 외부 판독 서비스로 보내는 데 동의가 필요합니다.",
      "안내를 읽고 동의에 체크해 주세요.",
      400,
    );
  }

  const intentId = String(form.get("intentId") ?? "");
  const session = await getSession(intentId);
  if (!session) {
    return err("NOT_FOUND", "해당 대화를 찾을 수 없습니다.", "대화를 먼저 시작해 주세요.", 404);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return err("INVALID_REQUEST", "파일이 없습니다.", "사진이나 PDF를 선택해 주세요.", 400);
  }
  if (file.size > MAX_BYTES) {
    return err("FILE_TOO_LARGE", "파일이 너무 큽니다.", "10MB 이하로 올려 주세요.", 413);
  }
  if (file.type && !ALLOWED.includes(file.type)) {
    return err(
      "UNSUPPORTED_TYPE",
      "지원하지 않는 형식입니다.",
      "사진(JPG·PNG) 또는 PDF로 올려 주세요.",
      415,
    );
  }

  const rec = putUpload({
    intentId: session.id,
    bytes: new Uint8Array(await file.arrayBuffer()),
    mimeType: file.type || "application/octet-stream",
    // 파일명은 저장만 하고 응답·로그에 싣지 않는다 (보안 3조)
    fileName: file.name || "upload",
    transferConsent: true,
  });

  return Response.json({
    ok: true,
    data: PaperScanUploadRes.parse({ uploadId: rec.uploadId }),
  });
}
