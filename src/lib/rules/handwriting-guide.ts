// 자필증서 유언 필사 가이드 (FR-302 · 민법 §1066)
//
// ⚠ human_review: required — 법정 요건 문안이다. 에이전트 단독 변경 금지 (보안 5조).
// ⚠ 초안 본문은 **템플릿이 만든다. LLM이 생성하지 않는다.**
//    법정 요건 문장을 모델이 쓰면 한 글자 차이로 무효가 될 수 있다 — P3의 확장이다.
//    Solar는 사용자의 마음을 담은 문단(personalNote)의 문체만 다듬는다.
import type { HandwritingGuideRes } from "../contracts/handwriting";
import { STATUTES } from "./validity-gate";

/** 4대 필수요건 — 자필증서 유언 무효 원인의 대부분이 여기서 갈린다 */
export const HANDWRITING_CHECKLIST = [
  {
    id: "FULL_TEXT" as const,
    label: "전문(全文)을 직접 손으로 쓰셨나요?",
    caseNote:
      "타이핑·복사·대필은 무효입니다. 처음부터 끝까지 본인 손글씨여야 합니다 (민법 §1066).",
  },
  {
    id: "DATE" as const,
    label: "연·월·일을 모두 쓰셨나요?",
    caseNote:
      "“○년 ○월 길일”처럼 날짜가 특정되지 않으면 무효입니다. 연·월·일을 모두 적어야 합니다.",
  },
  {
    id: "ADDRESS" as const,
    label: "주소를 직접 손으로 쓰셨나요?",
    caseNote:
      "대법원은 주소를 자서하지 않으면 유언자를 특정할 수 있어도 무효라고 보았습니다 (2014. 10. 6. 선고).",
  },
  {
    id: "NAME_SEAL" as const,
    label: "성명을 쓰고 날인(도장 또는 지장)하셨나요?",
    caseNote:
      "날인이 없는 유언장은 무효입니다 (대법원 2006다25103·25110). 지장도 날인으로 인정됩니다.",
  },
];

/** 최상단 고정 문구 — 화면·인쇄물 모두에 반드시 나온다 (FR-302 수락 기준) */
export const HANDWRITING_NOTICE =
  "이 문서는 손으로 옮겨 적어야 효력이 있습니다. 인쇄물에 서명하거나 전자서명을 해도 유언으로서 효력이 생기지 않습니다 (민법 제1066조).";

/** 공정증서 유언 대안 — 장단점을 함께 제시한다 (FR-302 수락 기준) */
export const NOTARIAL_ALTERNATIVE = {
  title: "공정증서 유언(공증)이라는 방법도 있습니다",
  pros: [
    "공증인이 방식을 확인하므로 형식 흠결로 무효가 될 위험이 낮습니다",
    "원본을 공증사무소가 보관해 분실·훼손 위험이 적습니다",
  ],
  cons: ["증인 2명이 필요하고 비용이 듭니다", "공증사무소를 직접 방문해야 합니다"],
};

export interface DraftInput {
  /** 확정된 사실만 들어온다 — 미확정 값으로 유언 초안을 만들지 않는다 (P1) */
  facts: { key: string; value: unknown }[];
  /** 사용자가 남긴 마음 문단 (있으면). 문체 다듬기는 이 부분에만 적용된다 */
  personalNote?: string | null;
}

const DATE_BLANK = "____년 ____월 ____일";

/**
 * 자필 유언 초안 본문. 사용자가 **손으로 옮겨 적을** 원고다.
 * 날짜·주소·성명은 일부러 빈칸으로 둔다 — 그 자리를 본인이 자서해야 효력이 생긴다.
 */
export function buildDraftText(input: DraftInput): string {
  const get = (key: string) => input.facts.find((f) => f.key === key)?.value;
  const region = get("region");
  const amount = get("amount");

  const lines: string[] = ["유언장", ""];

  if (input.personalNote?.trim()) lines.push(input.personalNote.trim(), "");

  if (region && typeof amount === "number") {
    lines.push(
      `나는 내가 사망한 때에 ${String(region)}에 금 ${amount.toLocaleString("ko-KR")}원을 기부한다.`,
      "",
    );
  } else if (region) {
    lines.push(`나는 내가 사망한 때에 ${String(region)}에 기부할 것을 유언한다.`, "");
  }

  lines.push(
    "위 내용은 나의 진정한 뜻이며, 자유로운 의사에 따라 스스로 작성하였다.",
    "",
    // 아래 세 줄은 본인이 손으로 채워야 하는 자리다 (민법 §1066)
    `작성일   ${DATE_BLANK}`,
    "주소     ____________________________________________",
    "성명     ______________________          (인)",
  );

  return lines.join("\n");
}

/** 가이드 전체 — 라우트는 이 결과를 그대로 계약으로 내보낸다 */
export function buildHandwritingGuide(input: DraftInput): HandwritingGuideRes {
  return {
    draftText: buildDraftText(input),
    checklist: HANDWRITING_CHECKLIST.map((c) => ({ ...c, checked: false })),
    // 화면에 조문을 그대로 노출한다 (P3 — 모든 주장에는 근거가 붙는다)
    statutes: [
      STATUTES.CIVIL_1060,
      STATUTES.CIVIL_1066,
      STATUTES.SCC_2006DA25103,
      STATUTES.SCC_2014_ADDRESS,
    ],
  };
}
