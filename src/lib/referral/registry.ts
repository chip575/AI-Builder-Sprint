// 문의처 — **우리가 답하지 않기로 한 물음을 어디로 보내는가** (NFR-705 · P3)
//
// 왜 필요한가: 지금까지 법률·세무 질문에 "전문가와 상담하시기를 권합니다"로 끝났다.
// 그 문장은 맞지만 **어디로 가라는 말이 없다.** 사용자는 거절만 받고 끝난다.
//
// 왜 코드인가: 모델이 전화번호를 지어낸다. 그럴듯한 번호는 진짜보다 나쁘다 — 사용자가
// 실제로 건다. 그래서 번호는 여기에만 있고, 프롬프트는 이 문자열을 **그대로 옮기라고만**
// 시킨다 (asset-readback과 같은 문법).
//
// ⚠ 여기 값을 고치려면 `source`를 다시 확인하고 `verifiedAt`을 갱신한다. 재확인 없이
//   고치지 않는다 — 틀린 번호는 "안내가 없는 것"보다 나쁘다.

export type ReferralTopic =
  /** 상속 분쟁·유류분·법정상속분 등 법률 판단 */
  | "INHERITANCE_LAW"
  /** 상속세·증여세 등 세법 — 우리 서류의 공제 계산은 여기가 아니라 확인 화면 소관 */
  | "TAX"
  /** 고향사랑기부제 제도 자체에 대한 문의 */
  | "HOMETOWN_DONATION";

export interface Referral {
  /** 기관 이름 — 사용자가 전화를 걸 때 누구에게 거는지 알아야 한다 */
  label: string;
  /** 어떤 물음을 여기로 보내는가 — 화면·프롬프트가 이 말을 그대로 쓴다 */
  scope: string;
  /** 대표번호. **확인하지 못했으면 null** — 그럴듯한 번호를 채우지 않는다 */
  phone: string | null;
  url: string;
  /** 이 값을 확인한 곳과 날짜 */
  source: { url: string; verifiedAt: string };
}

export const REFERRALS: Record<ReferralTopic, Referral> = {
  INHERITANCE_LAW: {
    label: "대한법률구조공단",
    scope: "상속 분쟁, 유류분, 상속인 범위처럼 법으로 따져야 하는 문제",
    phone: "132",
    url: "https://www.klac.or.kr",
    source: { url: "https://www.klac.or.kr/legalstruct/telephoneConsultation.do", verifiedAt: "2026-08-03" },
  },
  TAX: {
    label: "국세상담센터",
    scope: "상속세·증여세처럼 세액을 따져야 하는 문제",
    phone: "126",
    url: "https://call.nts.go.kr",
    source: { url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=6694&cntntsId=8104", verifiedAt: "2026-08-03" },
  },
  HOMETOWN_DONATION: {
    label: "고향사랑e음",
    scope: "고향사랑기부제 제도와 답례품에 대한 문의",
    // 포털 본문에서 대표번호를 확인하지 못했다. 확인될 때까지 사이트만 안내한다 —
    // 검색 요약에서 본 번호를 그대로 옮기면 확인한 값과 구분되지 않는다
    phone: null,
    url: "https://www.ilovegohyang.go.kr",
    source: { url: "https://www.ilovegohyang.go.kr", verifiedAt: "2026-08-03" },
  },
};

/** 한 곳을 사람 말로. 번호가 없으면 번호 자리를 비우지 않고 **문장에서 뺀다** */
export function referralText(topic: ReferralTopic): string {
  const r = REFERRALS[topic];
  const how = r.phone ? `전화 ${r.phone} 또는 ${r.url}` : r.url;
  return `${r.scope}는 ${r.label}(${how})에 문의해 주세요.`;
}

/** 프롬프트·화면에 함께 싣는 전체 목록 */
export function allReferralText(): string {
  return (Object.keys(REFERRALS) as ReferralTopic[]).map(referralText).join(" ");
}
