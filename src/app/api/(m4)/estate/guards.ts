// 자산 라우트 공통 — 오류 응답과 소유 검사.
// 라우트가 셋(등록·판독·수증자)이고 같은 규칙을 세 번 쓰면 언젠가 하나만 달라진다.
import type { AssetUpsertReq } from "@/lib/contracts";
import { store } from "@/lib/store";

/** 기술 오류 코드를 그대로 노출하지 않는다. nextAction은 "다음에 할 행동"이다 (NFR-705) */
export function err(code: string, message: string, nextAction: string, status: number) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

/** 파싱 실패의 이유를 사용자 말로 옮긴다 — 무엇이 틀렸는지 모르면 고칠 수 없다 (NFR-705).
 *  디지털 자산의 처리 지시 누락은 계약이 막고(FR-403), 여기서는 그 사실을 설명만 한다 */
export function assetParseFailure(body: unknown) {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (raw.category === "DIGITAL" && raw.disposition == null) {
    return err(
      "DISPOSITION_REQUIRED",
      "디지털 자산은 어떻게 할지 함께 정해야 합니다.",
      "삭제·보존·물려주기 중 하나를 골라 주세요.",
      400,
    );
  }
  return err(
    "INVALID_REQUEST",
    "입력하신 내용을 저장할 수 없습니다.",
    "종류와 이름을 다시 확인해 주세요.",
    400,
  );
}

/**
 * 요청이 가리키는 수증자가 **본인의 명부에 있는가** (D-18 소유 필터).
 * 남의 수증자 id를 적어 넣으면 그 사람의 이름이 내 인벤토리에 나타난다 —
 * 존재 검사만으로는 못 막고 소유 검사여야 막힌다.
 * 디지털 자산의 이전 대상(disposition.toBeneficiaryId)도 같은 검사를 받는다.
 * @returns 명부에 없는 id. 전부 정상이면 null
 */
export async function findUnknownBeneficiary(
  userId: string,
  input: AssetUpsertReq,
): Promise<string | null> {
  const referenced = [
    input.beneficiaryId,
    input.category === "DIGITAL" && input.disposition.action === "TRANSFER"
      ? input.disposition.toBeneficiaryId
      : null,
  ].filter((id): id is string => typeof id === "string");
  if (referenced.length === 0) return null;

  const mine = new Set((await store.listBeneficiaries(userId)).map((b) => b.id));
  return referenced.find((id) => !mine.has(id)) ?? null;
}
