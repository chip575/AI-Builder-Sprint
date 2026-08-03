// M-RECIPIENT — 알릴 상대 (FR-405 · FR-112 · NFR-714)
//
// **계약 곳곳이 이미 이 실체를 가리키고 있었다.** 만들지 않은 채로:
//   Beneficiary.recipientId · Custodian.recipientId
//   FamilyAckReq.recipientIds · DeliveryPatch.recipientIds
// 넷이 존재하지 않는 대상을 참조하고 있었고, 그래서 통지가 필요한 기능
// (철회 통지·마음 유언 전달·가족 확인)이 전부 앞에서 멈췄다.
//
// 왜 한 테이블인가: 기관·유가족·지킴이는 역할이 다르지만 **우리가 쓰는 방식은 같다** —
// 이름과 이메일이 있고, 무언가를 보낸다. 셋으로 쪼개면 발송 코드가 셋이 되고
// 마스킹 규칙도 셋이 되어, 한 곳만 빠뜨리는 순간 개인정보가 샌다.
//
// ⚠ 이메일은 개인정보다 (보안 1조). 저장은 하되 로그·에러 메시지·LLM 프롬프트에
//   원문을 남기지 않는다.
//   화면은 **두 가지로 갈린다**: 목록은 마스킹하고, **발송 직전 확인 화면은 전체를 보여준다.**
//   전부 가리면 사용자가 오타를 못 잡는데, 통지서에는 이름과 약정 내용이 실린다 —
//   틀린 주소로 가는 순간 그게 곧 유출이다. 확인할 기회를 주는 쪽이 더 안전하다.
// ⚠ 여기에 주민등록번호·주소·계좌를 담지 않는다. Beneficiary가 "연락처·주소·식별번호를
//   담지 않는다"고 못박은 이유와 같다 — 통지에 필요한 최소치만 갖는다.
import { z } from "zod";

/** 무엇으로 부르는 사람인가. 역할이 화면 문구와 접근 권한을 가른다 */
export const RecipientKind = z.enum([
  /** 수증 기관 — 약정 상대. 철회 통지가 여기로 간다 */
  "ORG",
  /** 유가족 — 사후에 마음 유언·확인을 받는다 */
  "FAMILY",
  /** 지킴이 — 열람 권한을 나눠 받는 사람 (Custodian) */
  "CUSTODIAN",
]);
export type RecipientKind = z.infer<typeof RecipientKind>;

export const Recipient = z.object({
  id: z.string().uuid(),
  kind: RecipientKind,
  /** 기관명 또는 사람 이름. 화면·통지서에 그대로 인쇄된다 */
  name: z.string().min(1).max(60),
  /** 통지가 실제로 도달하는 곳. 없으면 통지를 보낼 수 없다 */
  email: z.string().email().max(120),
  /** "장녀", "조카" — 사람일 때만. 법정상속분 판정에 쓰지 않는다 (Beneficiary와 같은 규약) */
  relation: z.string().max(20).nullish(),
  createdAt: z.string().datetime(),
});
export type Recipient = z.infer<typeof Recipient>;

/** 등록·수정 입력. id가 있으면 수정, 없으면 새로 만든다 */
export const RecipientUpsertReq = Recipient.omit({ id: true, createdAt: true }).extend({
  id: z.string().uuid().nullish(),
});
export type RecipientUpsertReq = z.infer<typeof RecipientUpsertReq>;

/** 목록 응답. 등록·삭제도 같은 것을 돌려준다 —
 *  화면이 목록을 따로 계산하지 않게 한다 (인벤토리와 같은 규약) */
export const RecipientListRes = z.object({
  recipients: z.array(Recipient),
});
export type RecipientListRes = z.infer<typeof RecipientListRes>;
