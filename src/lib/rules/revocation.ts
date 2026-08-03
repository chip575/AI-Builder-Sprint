// 그만두기 — **문서마다 이름도 절차도 다르다** (FR-405 · 민법 §1108①)
//
// human_review: 2026-08-03 승인 — 법적 성질 판정이므로 lib/rules에 둔다 (P3).
//
// 네 단어를 한 버튼에 몰아 "철회"라고 쓰면 사용자가 자기가 무엇을 하는지 모른다.
// 정기후원에 "철회"를 누르면 이미 낸 돈이 돌아오는 줄 안다:
//
//   취소 — 서명 **전에** 그만둠. 문서 상태(CANCELED)가 받는다
//   철회 — 효력 발생 **전에** 없던 것으로. 사인증여만 (§1108① 준용)
//   해지 — 계속적 계약을 **앞으로** 끊음. 정기후원
//   회수 — 권한을 거둠. 지킴이 (CustodianStatus.REVOKED)
//
// ⚠ 여기서 정하는 것은 **말과 가능 여부**뿐이다. 실제 처리는 라우트가 하고,
//   원장 상태 전이는 lib/ledger가 한다.
import type { DocType } from "../contracts/common";

export type RevocationKind =
  /** 철회 — 원장을 REVOKED로. 통지서를 보낼 수 있다 */
  | "REVOKE"
  /** 해지 — 앞으로만 끊는다. 이미 이행된 부분은 되돌리지 않는다 */
  | "TERMINATE"
  /** 회수 — 권한을 거둔다 */
  | "WITHDRAW"
  /** 우리가 할 수 있는 일이 아니다 */
  | "NONE";

export interface RevocationRule {
  kind: RevocationKind;
  /** 화면 버튼에 그대로 쓰는 말 */
  label: string;
  /** 왜 그런지 — 사용자가 눌러도 되는지 판단할 수 있게 */
  note: string;
}

const RULES: Record<DocType, RevocationRule> = {
  // 사인증여 — 여기가 본령이다. 생전에는 언제든 철회할 수 있다
  LEGACY_GIFT_AGREEMENT: {
    kind: "REVOKE",
    label: "철회하기",
    note: "살아 계시는 동안에는 언제든 철회하실 수 있습니다. 철회하시면 기관에 알려 드릴 수 있습니다.",
  },
  // 이미 낸 돈이다. 되돌리는 것은 환불이지 철회가 아니고, 그건 기관의 일이다
  DONATION_PLEDGE: {
    kind: "NONE",
    label: "",
    note: "이미 이행된 기부는 이곳에서 되돌릴 수 없습니다. 기관에 직접 문의해 주세요.",
  },
  // 계속적 계약 — 앞으로를 끊는 것이지 지난 것을 없던 일로 하는 게 아니다
  RECURRING_CONSENT: {
    kind: "TERMINATE",
    label: "해지 안내 보기",
    note: "정기후원은 앞으로의 출금을 멈추는 해지입니다. 이미 보내신 후원금은 그대로 남습니다.",
  },
  HERITAGE_SUPPORT_PLEDGE: {
    kind: "NONE",
    label: "",
    note: "이미 이행된 후원은 이곳에서 되돌릴 수 없습니다. 기관에 직접 문의해 주세요.",
  },
  VOLUNTEER_PLEDGE: {
    kind: "TERMINATE",
    label: "그만두기",
    note: "앞으로의 참여를 멈추는 것입니다.",
  },
  // 동의 철회는 개인정보보호법의 영역이라 성격이 다르다 — 우리가 대신 처리하지 않는다
  PRIVACY_TAX_CONSENT: {
    kind: "NONE",
    label: "",
    note: "개인정보 동의 철회는 정보를 받은 기관에 요청하셔야 합니다.",
  },
  CUSTODIAN_AGREEMENT: {
    kind: "WITHDRAW",
    label: "권한 회수하기",
    note: "지킴이의 열람 권한을 거둡니다. 이미 보신 내용까지 되돌리지는 못합니다.",
  },
  // 우리가 서명하지 않는 문서다. 유언 철회는 새 유언이나 파기로 한다 (민법 §1108①)
  HANDWRITTEN_WILL: {
    kind: "NONE",
    label: "",
    note: "유언장은 새 유언을 쓰시거나 원본을 파기하시는 방법으로 철회하십니다. 손으로 하신 일이라 이곳에서 처리하지 않습니다.",
  },
  // 서명 없이 보관되는 기록이다. 그만두는 게 아니라 고치거나 지우는 것이다
  HEART_LETTER: {
    kind: "NONE",
    label: "",
    note: "마음의 편지는 언제든 고치거나 지우실 수 있습니다.",
  },
  DIGITAL_LEGACY_INSTRUCTION: {
    kind: "NONE",
    label: "",
    note: "디지털 유산 지시는 언제든 고치실 수 있습니다.",
  },
  INTENT_AFFIRMATION: {
    kind: "NONE",
    label: "",
    note: "의사 확인서는 그때의 사실을 적어 둔 기록이라 되돌리지 않습니다. 뜻이 바뀌셨으면 새로 남기시면 됩니다.",
  },
  // 철회 통지서 자체를 철회할 수는 없다 — 철회를 무르려면 새로 약정하셔야 한다
  REVOCATION_NOTICE: {
    kind: "NONE",
    label: "",
    note: "철회를 무르시려면 새로 약정을 맺으셔야 합니다.",
  },
};

/** 모르는 서류가 와도 화면이 죽지 않는다.
 *  타입은 Record<DocType>이지만 화면은 API가 준 문자열을 `as DocType`으로 캐스팅해
 *  넘긴다 — DocType이 늘고 여기 행을 빠뜨리면 `rule.kind`에서 터진다.
 *  터지는 대신 **"모른다"**로 답한다: 모르는 서류를 철회 가능으로 두는 것보다 낫다 */
export function revocationRule(docType: DocType): RevocationRule {
  return (
    RULES[docType] ?? {
      kind: "NONE",
      label: "",
      note: "이 서류를 이곳에서 그만두는 방법은 아직 안내해 드리지 못합니다.",
    }
  );
}

/** 원장을 REVOKED로 바꿔도 되는 문서인가. 이것만이 철회 API를 통과한다 */
export function canRevoke(docType: DocType): boolean {
  return RULES[docType].kind === "REVOKE";
}
