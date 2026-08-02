// M-ESTATE — POST·GET /api/estate/assets (FR-401 · FR-402 · FR-404)
//
// 이 라우트는 파이프라인을 고치지 않는다. 대화·구조화·게이트·문서·체결·보관은
// 그대로 두고 가지 하나가 붙는지를 본다 — 파이프라인 수정이 필요해지는 순간
// 그건 구현 문제가 아니라 설계 결함 신호다.
//
// 검증을 UI에 맡기지 않는다: 디지털 자산에 처리 지시가 없으면 **계약 파싱에서** 막힌다
// (FR-403). 화면이 바뀌어도 규칙은 그대로다.
import { AssetUpsertReq } from "@/lib/contracts";
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
