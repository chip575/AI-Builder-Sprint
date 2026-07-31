// 상속 관련 법정 기간 (FR-402)
//
// human_review: 2026-07-31 PM 승인 — 법률 수치이므로 lib/rules에 둔다 (P3).
// 이 값을 LLM 프롬프트에 넣지 않는다. 안내 문구는 여기서 만들어 화면으로 내보낸다.
//
// ⚠ 제약 둘이 이 모듈의 형태를 정했다:
//   [1] 기산점은 **"상속개시 있음을 안 날"**이지 사망일이 아니다. 우리는 그 날을
//       알 수 없으므로 **D-day를 계산하지 않는다.** 남은 일수를 보여주는 순간
//       틀린 날짜로 사람이 상속 결정을 그르칠 수 있다.
//   [2] 특별한정승인 등 예외가 있다. 기간과 조문만 알리고 **전문가 상담을 권한다.**
//       유류분에서 금액 계산을 하지 않기로 한 것(Q-4)과 같은 선이다.
import type { Statute } from "../contracts/gate";

export const RENUNCIATION_PERIOD = {
  months: 3,
  statute: "민법 제1019조 제1항",
  sourceUrl: "https://www.law.go.kr/법령/민법/제1019조",
  verifiedAt: "2026-07-31",
} as const;

/** 채무가 있는 인벤토리에 붙는 안내 (FR-402).
 *  날짜가 아니라 **기간과 조문**만 말한다 — 기산점을 우리가 모르기 때문이다. */
export function debtNoticeStatutes(): Statute[] {
  return [
    {
      id: RENUNCIATION_PERIOD.statute,
      title: "상속의 승인·포기 기간",
      summary:
        `상속 개시가 있음을 안 날부터 ${RENUNCIATION_PERIOD.months}개월 이내에 ` +
        "한정승인 또는 상속포기를 할 수 있습니다. 기간이 지나면 단순승인으로 보아 " +
        "채무도 함께 승계됩니다. 기산점과 예외(특별한정승인 등)는 사정에 따라 다르므로 " +
        "전문가와 상담하시기를 권합니다.",
      verifiedAt: RENUNCIATION_PERIOD.verifiedAt,
    },
  ];
}
