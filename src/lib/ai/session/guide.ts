// 유산 안내 층 (FR-101 확장) — 질문형 발화에 법령 근거가 붙은 안내를 답한다.
//
// **LLM을 거치지 않는다.** 법률 안내는 환각이 끼어들 자리가 없어야 하므로
// 문구는 전부 코드가 만들고, 수치·조문은 lib/rules에서 읽기만 한다 (P3).
// inheritance.ts의 선례를 따른다 — "안내 문구는 여기서 만들어 화면으로 내보낸다".
//
// express-detect와의 경계:
//   · 의사 표현("~하고 싶어요")  → EXPRESS/UNCERTAIN → 가지 제안 (저쪽 소관)
//   · 질문형("~어떻게 되나요")   → 여기. 답만 하고 아무것도 열지 않는다 (P1)
// 안내 끝의 다음 행동 제안은 사용자가 그 문장을 직접 말해야 진행된다 —
// 안내가 가지를 대신 열지 않는다.
import type { Statute } from "../../contracts/gate";
import { STATUTES } from "../../rules/validity-gate";
import { debtNoticeStatutes } from "../../rules/inheritance";

export type GuideTopic =
  | "WILL"         // 유언장 — 전자서명 무효, 필사 가이드로
  | "LEGACY_GIFT"  // 사인증여(유산기부) — 전자서명 가능 + 유류분 고지
  | "DEADLINE"     // 상속 승인·포기 기간
  | "INHERITANCE"  // 법정상속 일반
  | "DONATION";    // 생전 기부 절차

export interface GuideReply {
  topic: GuideTopic;
  /** 화면에 그대로 흐르는 본문 — 근거 줄까지 포함된 완성 문장 */
  reply: string;
  /** 구조화된 근거 — FE가 카드로 그리게 되면 이걸 쓴다 (지금은 본문에 병기) */
  statutes: Statute[];
}

/** 질문형 신호 — 이게 없으면 안내가 아니라 회상·의사 표현이다 */
const QUESTION =
  /(어떻게|어떡|무엇|뭐예요|뭔가요|궁금|알려\s*주|가능한|가능해|되나요|할\s*수\s*있|인가요|차이|절차|방법|언제까지|얼마나)/;

/** 주제 규칙 — 구체적인 것 먼저 (express-detect와 같은 원칙) */
const TOPIC_RULES: { topic: GuideTopic; pattern: RegExp }[] = [
  // "상속 포기는 언제까지"가 INHERITANCE에 먼저 걸리면 기한 답을 못 준다
  { topic: "DEADLINE", pattern: /(포기|한정승인|기한|기간|언제까지)/ },
  { topic: "WILL", pattern: /유언/ },
  // "떠나"는 활용형(떠난·떠날·떠나면)을 다 잡아야 한다 — 한글은 음절 단위라 접두 매치가 안 된다
  { topic: "LEGACY_GIFT", pattern: /(사인\s*증여|유산\s*기부|사후\s*기부|(떠나|떠난|떠날|죽|사망)[^.]{0,12}기부)/ },
  { topic: "INHERITANCE", pattern: /상속/ },
  { topic: "DONATION", pattern: /기부/ },
];

function statuteLines(statutes: Statute[]): string {
  return statutes
    .map((s) => `근거 — ${s.id} · ${s.title}: ${s.summary} (${s.verifiedAt} 확인)`)
    .join("\n");
}

/** 본문 + 근거 줄. 근거 없는 주제는 본문만 (법적 주장이 없는 절차 안내) */
function compose(body: string, statutes: Statute[]): string {
  return statutes.length > 0 ? `${body}\n\n${statuteLines(statutes)}` : body;
}

// ⚠ 문구 규칙 (P4): 재촉 표현(지금·빨리·놓치기 전에) 금지. 결정을 미룰 자유를 항상 남긴다.
//   수치는 쓰지 않는다 — 유일한 예외인 승인·포기 기간은 rules의 문장을 그대로 싣는다.
const REPLIES: Record<GuideTopic, () => GuideReply> = {
  WILL: () => {
    const statutes = [STATUTES.CIVIL_1060, STATUTES.CIVIL_1065, STATUTES.CIVIL_1066];
    return {
      topic: "WILL",
      statutes,
      reply: compose(
        "유언장은 이곳에서 전자서명으로 만들 수 없습니다. 법이 유언의 방식을 " +
          "자필증서·녹음·공정증서·비밀증서·구수증서 다섯 가지로만 인정하고 있어서, " +
          "화면의 서명으로는 효력이 생기지 않습니다. 대신 자필로 옮겨 쓰실 수 있도록 " +
          "필사 가이드를 준비해 두었습니다. 원하시면 “유언장을 준비하고 싶어요”라고 " +
          "말씀해 주세요. 서두르실 필요는 없습니다.",
        statutes,
      ),
    };
  },
  LEGACY_GIFT: () => {
    const statutes = [STATUTES.CIVIL_562, STATUTES.CIVIL_1112];
    return {
      topic: "LEGACY_GIFT",
      statutes,
      reply: compose(
        "세상을 떠난 뒤에 재산 일부를 남기는 방법으로 ‘사인증여 약정’이 있습니다. " +
          "받으실 분과 생전에 계약으로 맺어 두고, 효력은 사망 시에 생깁니다. " +
          "유언과 달리 계약이라서 여기서 전자서명으로 체결하실 수 있습니다. " +
          "다만 가족에게 법이 보장하는 몫(유류분)이 있어, 약정 전에 그 내용을 함께 " +
          "안내해 드립니다. 원하시면 “유산을 기부하고 싶어요”라고 말씀해 주세요.",
        statutes,
      ),
    };
  },
  DEADLINE: () => {
    const statutes = debtNoticeStatutes();
    return {
      topic: "DEADLINE",
      statutes,
      reply: compose(
        "상속을 받을지 정리하는 데에는 법으로 정한 기간이 있습니다. " +
          "기간의 시작점은 사망일이 아니라 ‘상속 개시를 안 날’이라 사정마다 다릅니다 — " +
          "그래서 저희는 남은 날짜를 계산해 드리지 않습니다.",
        statutes,
      ),
    };
  },
  INHERITANCE: () => {
    const statutes = [STATUTES.CIVIL_1112, ...debtNoticeStatutes()];
    return {
      topic: "INHERITANCE",
      statutes,
      reply: compose(
        "유언이나 약정이 없으면 재산은 민법이 정한 순위에 따라 상속인에게 넘어갑니다(법정상속). " +
          "남기고 싶은 곳이 따로 있으시면 생전에 사인증여 약정으로 정해 두실 수 있고, " +
          "유언장은 자필로 작성하셔야 효력이 있습니다. 상속에는 승인·포기 기간 같은 " +
          "법정 기한도 있으니, 구체적인 사정은 전문가와 상담하시기를 권합니다.",
        statutes,
      ),
    };
  },
  DONATION: () => ({
    topic: "DONATION",
    statutes: [],
    reply:
      "기부 약정은 여기서 대화로 정리하고 전자서명으로 체결하실 수 있습니다. " +
      "어느 곳에 어떤 마음을 남기고 싶으신지 말씀해 주시면 함께 정리해 드릴게요. " +
      "결정은 언제든 미루셔도 됩니다.",
  }),
};

/**
 * 질문형 발화 → 안내. 아니면 null (축·가지 대화로 진행).
 * 의사 표현은 여기 오기 전에 express-detect가 가져간다 — 라우트가 그 순서를 보장한다.
 */
export function detectGuide(text: string): GuideReply | null {
  if (!QUESTION.test(text)) return null;
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(text)) return REPLIES[rule.topic]();
  }
  return null;
}
