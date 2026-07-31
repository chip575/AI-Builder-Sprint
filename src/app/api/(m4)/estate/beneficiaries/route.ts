// M-ESTATE — POST·GET /api/estate/beneficiaries (FR-404)
//
// 명부에 연락처·주소·식별번호가 없다. 통지가 필요하면 recipientId로 참조한다 —
// 가족 인지(FamilyAckReq)와 같은 규약이다 (NFR-714 1조).
import { BeneficiaryUpsertReq } from "@/lib/contracts";
import { getCurrentUserId } from "@/lib/auth/session";
import { store } from "@/lib/store";
import { err } from "../guards";

export async function POST(req: Request) {
  const userId = await getCurrentUserId(req);
  const parsed = BeneficiaryUpsertReq.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return err(
      "INVALID_REQUEST",
      "받으실 분을 저장할 수 없습니다.",
      "이름과 관계를 확인해 주세요.",
      400,
    );
  }
  const beneficiary = await store.createBeneficiary({ ...parsed.data, userId });
  return Response.json({ ok: true, data: beneficiary }, { status: 201 });
}

export async function GET(req: Request) {
  const userId = await getCurrentUserId(req);
  return Response.json({ ok: true, data: await store.listBeneficiaries(userId) });
}
