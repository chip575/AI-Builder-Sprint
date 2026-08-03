// M-ESTATE — POST·GET /api/estate/assets (FR-401 · FR-402 · FR-404)
//
// 이 라우트는 파이프라인을 고치지 않는다. 대화·구조화·게이트·문서·체결·보관은
// 그대로 두고 가지 하나가 붙는지를 본다 — 파이프라인 수정이 필요해지는 순간
// 그건 구현 문제가 아니라 설계 결함 신호다.
//
// 검증을 UI에 맡기지 않는다: 디지털 자산에 처리 지시가 없으면 **계약 파싱에서** 막힌다
// (FR-403). 화면이 바뀌어도 규칙은 그대로다.
import { AssetPatchReq, AssetUpsertReq } from "@/lib/contracts";
import { getCurrentUserId, loginRequired } from "@/lib/auth/session";
import { store } from "@/lib/store";
import { assetParseFailure, err, findUnknownBeneficiary } from "../guards";
import { buildInventory } from "../inventory";

export async function POST(req: Request) {
  const userId = await getCurrentUserId(req);
  if (!userId) return loginRequired();
  const body = await req.json().catch(() => null);
  const parsed = AssetUpsertReq.safeParse(body);
  if (!parsed.success) return assetParseFailure(body);

  const unknown = await findUnknownBeneficiary(userId, parsed.data);
  if (unknown) {
    return err(
      "UNKNOWN_BENEFICIARY",
      "받으실 분을 찾을 수 없습니다.",
      "받으실 분을 먼저 등록해 주세요.",
      404,
    );
  }

  // 본인이 직접 쓴 값이다 — origin=MANUAL이고 신뢰도는 없다.
  // confirmed는 여기서 정하지 않는다: 출처가 정하고 저장소가 소유한다 (P1)
  await store.createAsset({ ...parsed.data, userId, origin: "MANUAL", confidence: null });

  // 등록 응답도 인벤토리 한 벌 — 화면이 목록을 따로 계산하지 않게 한다
  return Response.json({ ok: true, data: await buildInventory(userId) }, { status: 201 });
}

export async function GET(req: Request) {
  const userId = await getCurrentUserId(req);
  if (!userId) return loginRequired();
  return Response.json({ ok: true, data: await buildInventory(userId) });
}

/**
 * 이미 있는 자산 고치기 (FR-401 · FR-403 · P1).
 *
 * 지금까지 자산은 **만들기만 되고 고칠 수가 없었다.** 그래서 두 가지가 막혀 있었다:
 *   · 디지털 자산의 처리 방식을 정할 길이 없었다 (FR-403)
 *   · 화면이 "확인해 주세요"라고 말하는데 **누를 곳이 없었다** (P1 확인 유도)
 *
 * ⚠ 확정은 올리기만 한다. 내리는 것은 값이 바뀔 때 서버가 하는 일이다 —
 *   사용자 손으로 확정을 되돌리면 "확인했다"는 기록이 사라진다.
 */
export async function PATCH(req: Request) {
  const userId = await getCurrentUserId(req);
  if (!userId) return loginRequired();

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return err("INVALID_REQUEST", "어느 자산인지 알 수 없습니다.", "목록에서 다시 골라 주세요.", 400);
  }
  const parsed = AssetPatchReq.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return err("INVALID_REQUEST", "입력하신 내용을 저장하지 못했습니다.", "다시 확인해 주세요.", 400);
  }

  // 넘겨받을 사람이 실제로 있는지는 계약이 못 본다 — 없는 사람에게 넘기라는 지시가
  // 남으면 남은 사람은 그 줄에서 멈춘다
  const d = parsed.data.disposition;
  const wants =
    d?.action === "TRANSFER" ? d.toBeneficiaryId : (parsed.data.beneficiaryId ?? null);
  if (wants) {
    const known = new Set((await store.listBeneficiaries(userId)).map((b) => b.id));
    if (!known.has(wants)) {
      return err(
        "UNKNOWN_BENEFICIARY",
        "받으실 분을 찾을 수 없습니다.",
        "받으실 분을 먼저 등록해 주세요.",
        404,
      );
    }
  }

  const updated = await store.updateAsset(userId, id, parsed.data);
  if (!updated) {
    // 없는 것과 남의 것을 같은 응답으로 — 구분해 주면 남의 id를 탐색할 수 있다
    return err("NOT_FOUND", "해당 자산을 찾을 수 없습니다.", "목록을 새로 불러와 주세요.", 404);
  }
  // 인벤토리 한 벌 — 화면이 목록을 따로 계산하지 않게 한다 (등록과 같은 규약)
  return Response.json({ ok: true, data: await buildInventory(userId) });
}
