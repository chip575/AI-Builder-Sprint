// M-ESTATE — POST /api/estate/assets/scan (FR-401)
//
// **판독기를 새로 만들지 않는다.** M-PAPER-SCAN의 Document Parse + Information Extract
// 포트(lib/ai/document)와 업로드 보관소를 그대로 쓴다 — 가지가 붙는다는 것은
// 파이프라인을 한 줄도 고치지 않고 재사용된다는 뜻이다.
//
// 요청 형태도 새로 만들지 않는다: 계약의 AssetUpsertReq 그대로이고,
// 이미 있는 `sourceUploadId`가 판독할 업로드를 가리킨다 (절대규칙 1).
// 판독이 채우는 것은 **값**이고, 종류(category)와 처리 지시(disposition)는 사람이 정한다 —
// 기계가 "이건 부동산입니다"라고 단정하면 그 순간 확인 없는 확정이 된다.
import { AssetUpsertReq } from "@/lib/contracts";
import { getCurrentUserId, loginRequired } from "@/lib/auth/session";
import { scanner } from "@/lib/ai/document";
import { CONFIDENCE } from "@/lib/ai/extract/confidence";
import { store } from "@/lib/store";
import { track } from "@/lib/observability/track";
import { dropUpload, takeUpload } from "@/app/api/(m1)/paper-scan/store";
import { assetParseFailure, err, findUnknownBeneficiary } from "../../guards";
import { buildInventory } from "../../inventory";

/** IE가 정규화해 주는 슬롯 이름 → 자산의 자리.
 *  모르는 슬롯은 **버린다**. 어디에 넣을지 모르는 값을 아무 칸에나 넣지 않는다 (FR-102) */
const SLOT = {
  label: ["label", "institution", "organization", "issuer", "title", "region"],
  amount: ["amount", "estimatedValue", "value", "balance"],
  identifier: ["account", "accountNumber", "identifier", "policyNumber"],
} as const;

function pick(
  fields: { key: string; value: string | number }[],
  keys: readonly string[],
): string | number | undefined {
  return fields.find((f) => keys.includes(f.key))?.value;
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const userId = await getCurrentUserId(req);
  if (!userId) return loginRequired();
  const body = await req.json().catch(() => null);
  const parsed = AssetUpsertReq.safeParse(body);
  if (!parsed.success) return assetParseFailure(body);

  const input = parsed.data;
  if (!input.sourceUploadId) {
    return err(
      "UPLOAD_REQUIRED",
      "판독할 사진이 지정되지 않았습니다.",
      "사진을 먼저 올려 주세요.",
      400,
    );
  }

  const upload = takeUpload(input.sourceUploadId);
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

  const unknown = await findUnknownBeneficiary(userId, input);
  if (unknown) {
    return err(
      "UNKNOWN_BENEFICIARY",
      "받으실 분을 찾을 수 없습니다.",
      "받으실 분을 먼저 등록해 주세요.",
      404,
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
    console.warn("[estate] 판독 실패:", (e as Error).message);
    return err(
      "SCAN_FAILED",
      "사진을 읽는 데 시간이 걸리네요.",
      "다시 시도하거나 직접 입력해 주세요.",
      502,
    );
  } finally {
    // 판독이 끝나면 원본을 메모리에서 지운다 (오래 들고 있지 않는다)
    dropUpload(input.sourceUploadId);
  }

  // 사람이 적어 둔 값이 우선이다. 판독은 **비어 있는 자리만** 채운다 —
  // 기계가 사람이 쓴 것을 덮으면 그건 도움이 아니라 정정이다
  const scannedAmount = pick(result.fields, SLOT.amount);
  const scannedLabel = pick(result.fields, SLOT.label);
  const scannedIdentifier = pick(result.fields, SLOT.identifier);

  const label = input.label.trim() || String(scannedLabel ?? "").trim();
  if (label === "") {
    // 이름을 지어내지 않는다. 뭐라고 부를지는 본인이 정한다
    return err(
      "LABEL_REQUIRED",
      "이 자산을 뭐라고 부를지 읽어내지 못했습니다.",
      "이름을 직접 적어 주세요.",
      422,
    );
  }

  await store.createAsset({
    ...input,
    label,
    estimatedValueKrw:
      input.estimatedValueKrw ??
      (typeof scannedAmount === "number" && scannedAmount >= 0 ? scannedAmount : null),
    // 원문이 무엇이든 저장소가 저장 직전에 마스킹한다 (NFR-712)
    maskedIdentifier: input.maskedIdentifier ?? (scannedIdentifier?.toString() ?? null),
    userId,
    origin: "OCR",
    // 사람이 원문을 보고 확인하는 것을 전제로 MEDIUM — 판독값은 미확인으로 시작한다 (P1)
    confidence: CONFIDENCE.MEDIUM,
  });
  track("EXTRACT", true, Date.now() - t0);

  // 판독 원문(parsedText)은 인벤토리 계약에 자리가 없다. 대신 이 건이 미확인·중신뢰로
  // 목록에 올라와 확인 화면에서 강조된다 — 사용자가 반드시 한 번은 보게 된다
  return Response.json({ ok: true, data: await buildInventory(userId) }, { status: 201 });
}
