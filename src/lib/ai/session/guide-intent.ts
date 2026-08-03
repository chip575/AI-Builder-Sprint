// 안내의 **세부 의도** — 같은 주제라도 묻는 것이 다르면 답도 달라야 한다.
//
// 왜 생겼나. 안내층이 "주제 하나 → 문단 하나"였다. 그래서 가지가 열린 뒤에
// "기부하면 세금 혜택이 있나요?"와 "이 약정서 나중에 취소할 수 있나요?"에
// **똑같은 기부 소개 문단**이 나왔다 (2026-08-03 실측). 게다가 그 문단은
// 대화 시작 문구라, 이미 지역·금액을 말한 사람에게는 어긋난 말이었다.
//
// 여기서 만드는 문장에는 **수치가 없다** (P3). 공제율·한도·기한은 lib/rules의 몫이고,
// 이 층은 "어디서 그 값을 보실 수 있는지"까지만 말한다.
import type { DocType } from "../../contracts/common";
import { DOC_LABEL } from "../../docs/labels";
import { revocationRule } from "../../rules/revocation";
import { referralText } from "../../referral/registry";

export type GuideIntent =
  /** "~한 상황인데 어떤 걸 작성해야 해?" — 서류를 골라 드려야 한다 */
  | "WHICH_DOC"
  /** "이 서류는 세금이 어떻게 돼?" — 서류별 세제 안내 */
  | "TAX"
  /** "나중에 취소할 수 있나요?" — 서류마다 말도 절차도 다르다 (revocation.ts) */
  | "REVOCATION"
  /** 그 밖 — 기존 주제 카드가 받는다 */
  | "GENERAL";

// ⚠ **선택을 묻는 말**만 잡는다. "어떻게 남기나요"는 방법을 묻는 것이라 여기가 아니다 —
//   처음엔 그것까지 넣었더니 "유언장은 어떻게 남기나요?"가 유언 안내 대신 서류 추천으로
//   갔다. 이미 서류를 말한 사람에게 "어떤 서류가 맞을지는…"이라고 답하는 꼴이었다.
const WHICH_DOC =
  /((어떤|무슨|어느)\s*(서류|문서|약정|양식|걸|것))|((뭘|무엇을)\s*(써야|작성|남겨야|준비))|((서류|문서)[^.]{0,8}(추천|골라|정해|고르))/;

const TAX_INTENT =
  /(세금|세제|공제|절세|비과세|면세|혜택|영수증)/;

const REVOCATION_INTENT =
  /(취소|철회|해지|무르|되돌리|없던\s*일|그만두면|해제)/;

/**
 * 이 발화가 무엇을 묻는가. 구체적인 것 먼저 — "취소하면 세금은?"은 드물고,
 * 그때는 취소가 먼저 궁금한 것이다.
 */
export function detectIntent(text: string): GuideIntent {
  if (WHICH_DOC.test(text)) return "WHICH_DOC";
  if (REVOCATION_INTENT.test(text)) return "REVOCATION";
  if (TAX_INTENT.test(text)) return "TAX";
  return "GENERAL";
}

/** 상황 → 그 상황에 맞는 서류. 서류의 **성질**로만 고른다 (법적 판정을 하지 않는다) */
const SITUATION: { pattern: RegExp; doc: DocType; why: string }[] = [
  // 사후가 먼저다 — "떠난 뒤에 기부"가 아래 기부 규칙에 먼저 걸리면 안 된다
  {
    pattern: /(사후|떠난\s*뒤|떠나면|죽은\s*뒤|죽고\s*나서|세상을\s*떠|유산|남기고\s*떠)/,
    doc: "LEGACY_GIFT_AGREEMENT",
    why: "세상을 떠난 뒤에 재산 일부가 전해지도록 생전에 맺어 두는 계약입니다.",
  },
  {
    pattern: /(문화재|문화유산|유적|사찰|고택|전통)/,
    doc: "HERITAGE_SUPPORT_PLEDGE",
    why: "지키고 싶은 문화유산에 후원 대상과 금액을 정해 약정하는 서류입니다.",
  },
  // 가족에게 재산을 물려주는 것은 기부가 아니다 — 유언의 영역이다
  {
    pattern: /(자녀|아들|딸|배우자|아내|남편|가족|자식|손자|손녀)[^.]{0,20}(주고|물려|남기|상속)/,
    doc: "HANDWRITTEN_WILL",
    why: "가족에게 재산을 물려주시려는 뜻은 유언으로 남기셔야 효력이 생깁니다. 이곳에서는 자필로 옮겨 쓰시도록 필사 가이드를 준비해 드립니다.",
  },
  {
    pattern: /(기부|후원|보태|나누고)/,
    doc: "DONATION_PLEDGE",
    why: "지금 마음이 향하는 곳에 지역과 금액을 정해 바로 체결하는 약정입니다.",
  },
  {
    pattern: /(편지|하고\s*싶은\s*말|마음을\s*남|전하고\s*싶)/,
    doc: "HEART_LETTER",
    why: "법적 효력을 갖는 서류가 아니라, 하고 싶은 말을 남겨 두는 편지입니다.",
  },
];

export interface DocSuggestion {
  docType: DocType;
  reply: string;
}

/**
 * "~한 상황인데 어떤 걸 작성해야 해?" 에 대한 답.
 *
 * 상황을 못 읽으면 null — **아무거나 권하지 않는다.** 서류를 잘못 권하는 것은
 * 안 권하는 것보다 나쁘다. 그때는 되묻는 문장을 호출부가 만든다.
 */
export function recommendDoc(text: string): DocSuggestion | null {
  const hit = SITUATION.find((s) => s.pattern.test(text));
  if (!hit) return null;
  return { docType: hit.doc, reply: recommendDocByType(hit.doc) };
}

/** 서류가 이미 정해진 경우의 권유 문장 — 분류기가 서류를 골라 왔을 때 쓴다 */
export function recommendDocByType(doc: DocType): string {
  const hit = SITUATION.find((s) => s.doc === doc);
  const why = hit?.why ?? "";
  const label = DOC_LABEL[doc];
  // 자필 유언만 다르게 끝난다 — 여기서 서명할 수 없다는 사실을 문 앞에서 말한다 (절대규칙 4)
  const next =
    doc === "HANDWRITTEN_WILL"
      ? "유언장은 이곳에서 전자서명으로 만들 수 없습니다. 준비를 도와드릴까요?"
      : `“새 약정 준비하기”에서 ${label}를 고르시면 대화로 채워 나가실 수 있습니다.`;
  return `${label}를 쓰시면 됩니다. ${why} ${next}`.replace(/\s+/g, " ").trim();
}

/** 상황을 못 읽었을 때 — 되묻는다. 서류 이름을 나열해 고르라고 하지 않는다 */
export const WHICH_DOC_UNKNOWN =
  "어떤 서류가 맞을지는 상황에 따라 다릅니다. " +
  // ⚠ "지금"을 쓰지 않는다 — 재촉으로 읽히는 말은 안내에 넣지 않는다 (P4).
  //   guide.test의 재촉 표현 검사가 이 문장에서 걸렸다
  "남기고 싶으신 것이 재산인지 마음인지, 그리고 살아 계시는 동안 전하고 싶으신지 " +
  "세상을 떠난 뒤에 전해지길 바라시는지 말씀해 주시면 맞는 서류를 찾아 드릴게요.";

/**
 * 서류별 세제 안내.
 *
 * ⚠ **수치를 쓰지 않는다.** 공제율·한도는 lib/rules가 갖고 있고 확인 화면이 계산한다.
 *   여기서 "얼마쯤"이라고 말하는 순간 그 숫자가 사용자의 결정 기준이 된다.
 */
export function docTaxReply(docType: DocType | null | undefined): string {
  const label = docType ? DOC_LABEL[docType] : "이 서류";
  switch (docType) {
    case "DONATION_PLEDGE":
    case "HERITAGE_SUPPORT_PLEDGE":
    case "RECURRING_CONSENT":
      return (
        `${label}로 기부하신 금액은 기부금 세액공제 대상이 될 수 있습니다. ` +
        "예상 공제액은 서명 전 확인 화면에서 계산해 보여 드리니 거기서 확인해 주세요. " +
        "영수증은 기부하신 기관이 발급합니다. " +
        `그 밖의 세금 문제는 저희가 계산해 드리지 않습니다 — ${referralText("TAX")}`
      );
    case "LEGACY_GIFT_AGREEMENT":
      return (
        `${label}는 세상을 떠난 뒤에 효력이 생기는 계약이라, 세금 문제가 상속과 얽힙니다. ` +
        "그 계산은 재산의 종류와 상속인 수에 따라 달라져서 저희가 해 드리지 않습니다. " +
        `${referralText("TAX")} ` +
        "다만 기부금에 해당하는 부분의 예상 공제액은 확인 화면에서 보여 드립니다."
      );
    case "HANDWRITTEN_WILL":
      return (
        "유언으로 남기신 재산에는 상속세 문제가 따릅니다. " +
        "그 계산은 저희가 해 드리지 않습니다 — " +
        referralText("TAX")
      );
    default:
      return (
        "세금 계산은 저희가 해 드리지 않습니다. " +
        `${referralText("TAX")} ` +
        "다만 이곳에서 만드시는 기부 약정의 예상 공제액은 확인 화면에서 보여 드립니다."
      );
  }
}

/**
 * 서류별 그만두기 안내 — lib/rules/revocation.ts가 정본이다.
 *
 * 이 함수가 생기기 전에는 "이 약정서 나중에 취소할 수 있나요?"에 기부 소개 문단이
 * 나왔다. 답할 재료(revocationRule)가 이미 있는데 안내층이 쓰지 않았다.
 */
export function docRevocationReply(docType: DocType | null | undefined): string {
  const label = docType ? DOC_LABEL[docType] : "이 서류";
  if (!docType) {
    return (
      "그만두는 방법은 서류마다 다릅니다. 어떤 서류를 말씀하시는지 알려 주시면 " +
      "그 서류에 맞는 방법을 안내해 드릴게요."
    );
  }
  const rule = revocationRule(docType);
  const head = `${label}는 서명 전이라면 언제든 그만두실 수 있습니다.`;
  return rule.kind === "NONE"
    ? `${head} 서명하신 뒤에는 — ${rule.note}`
    : `${head} 서명하신 뒤에는 “${rule.label}”로 정리하실 수 있습니다. ${rule.note}`;
}
