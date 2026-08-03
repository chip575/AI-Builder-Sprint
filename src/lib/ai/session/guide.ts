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
import type { DocType } from "../../contracts/common";
import { STATUTES } from "../../rules/validity-gate";
import { debtNoticeStatutes } from "../../rules/inheritance";
import { referralText } from "../../referral/registry";

export type GuideTopic =
  | "TAX"          // 세법 — **답하지 않는다.** 문의처로 보낸다
  | "WILL"         // 유언장 — 전자서명 무효, 필사 가이드로
  | "LEGACY_GIFT"  // 사인증여(유산기부) — 전자서명 가능 + 유류분 고지
  | "DEADLINE"     // 상속 승인·포기 기간
  | "INHERITANCE"  // 법정상속 일반
  | "DONATION"     // 생전 기부 절차
  | "LEGAL_OTHER"; // 우리 범위 밖 법률 — **답하지 않는다.** 문의처로 보낸다

export interface GuideReply {
  topic: GuideTopic;
  /** 화면에 그대로 흐르는 본문 — 근거 줄까지 포함된 완성 문장 */
  reply: string;
  /** 구조화된 근거 — FE가 카드로 그리게 되면 이걸 쓴다 (지금은 본문에 병기) */
  statutes: Statute[];
}

/** **지금 쓰는 이 서류**에 대한 질문인가. "이 약정서는 언제 효력이 생기나요?"
 *  주제어(기부·상속·유언)가 없어서 아래 표에 안 걸리는데, 작성실은 어느 서류인지
 *  이미 알고 있다. 그 앎을 안 쓰면 모델이 답하고 — 실제로 사인증여 약정을 두고
 *  **"공증 절차를 마친 후부터 효력이 발생합니다"**라는 틀린 말을 했다 (2026-08-03).
 *  법률 효력은 코드가 말한다 (P3). */
const ABOUT_THIS_DOC = /(약정서|이\s*서류|이\s*문서|이\s*계약|서명하고\s*나면|서명\s*(하면|후|뒤))/;

/** 서류 → 그 서류를 설명하는 안내 주제. 표는 위의 REPLIES를 그대로 쓴다 */
const DOC_TOPIC: Partial<Record<DocType, GuideTopic>> = {
  LEGACY_GIFT_AGREEMENT: "LEGACY_GIFT",
  DONATION_PLEDGE: "DONATION",
  HERITAGE_SUPPORT_PLEDGE: "DONATION",
  HANDWRITTEN_WILL: "WILL",
};

/** 질문형 신호 — 이게 없으면 안내가 아니라 회상·의사 표현이다 */
const QUESTION =
  // ⚠ **묻는 말이 늘 물음표로 오지 않는다.** "세금 계산을 하고 싶은데"는 질문인데
  //   예전 패턴은 못 잡았고, 그래서 안내층을 그냥 통과해 LLM이 회상 질문으로 답했다
  //   (2026-08-03 실사용). "~하고 싶은데"·"~인데"·"~좀"은 한국어에서 요청·질문의 꼴이다.
  /(어떻게|어떡|무엇|뭐예요|뭔가요|궁금|알려\s*주|가능한|가능해|되나요|할\s*수\s*있|인가요|차이|절차|방법|언제까지|얼마나|하고\s*싶은데|싶은데|알고\s*싶|좀\s*알|계산|물어|여쭤|나요|까요|는지|맞나|맞는|\?)/;

/** 주제 규칙 — 구체적인 것 먼저 (express-detect와 같은 원칙) */
const TOPIC_RULES: { topic: GuideTopic; pattern: RegExp }[] = [
  // 세법이 **맨 앞이다.** "상속세 신고 기한은?"이 DEADLINE에 걸리면 민법 조문을 답하게
  // 되고, 묻지도 않은 상속 포기 기간을 세금 질문의 답인 양 내놓는다.
  // ⚠ 여기에 "공제"를 넣지 않는다 — 우리 서식의 기부 공제는 확인 화면이 계산하는
  //   우리 일이다. 넣으면 기부 대화가 통째로 "문의하세요"로 끝난다
  // ⚠ "세금 계산"·"세액공제 얼마"가 빠져 있어 실사용에서 통째로 새어 나갔다 (2026-08-03).
  //   다만 **우리 서식이 계산하는 기부 공제**는 여기로 보내지 않는다 — 아래 DONATION이
  //   받아 "확인 화면에서 계산해 드린다"고 답한다. 그 경계가 이 두 줄이다.
  {
    topic: "TAX",
    pattern:
      /(상속세|증여세|양도소득세|취득세|세무|절세|세율|세금[이은는]?\s*(얼마|계산|어떻게)|세금\s*계산|세액\s*계산)/,
  },
  // "상속 포기는 언제까지"가 INHERITANCE에 먼저 걸리면 기한 답을 못 준다
  { topic: "DEADLINE", pattern: /(포기|한정승인|기한|기간|언제까지)/ },
  { topic: "WILL", pattern: /유언/ },
  // "떠나"는 활용형(떠난·떠날·떠나면)을 다 잡아야 한다 — 한글은 음절 단위라 접두 매치가 안 된다
  { topic: "LEGACY_GIFT", pattern: /(사인\s*증여|유산\s*기부|사후\s*기부|(떠나|떠난|떠날|죽|사망)[^.]{0,12}기부)/ },
  { topic: "INHERITANCE", pattern: /상속/ },
  { topic: "DONATION", pattern: /기부/ },
  // **맨 마지막 그물.** 위 주제에 안 걸린 법률 질문이 여기서 걸린다.
  // 없을 때는 "이혼 재산분할은 어떻게 되나요?"에 회상 질문("가장 고마운 사람은?")이
  // 돌아왔다 (2026-08-03 실측). 우리 일이 아니라고 말하는 것과 못 들은 척하는 것은 다르다.
  // 순서가 곧 규칙이다 — 우리 서류의 주제가 먼저 걸러진 뒤에만 여기 온다
  {
    topic: "LEGAL_OTHER",
    pattern:
      /(이혼|재산\s*분할|위자료|소송|고소|고발|재판|변호사|등기|후견|친권|양육권|채무|빚|파산|회생|명의\s*신탁|법[적으로]|합법|불법|권리)/,
  },
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
          // ⚠ 철회 가능 고지는 **빼면 안 되는 단서**다 (legal-basis §1 표·§4.1).
          //   대법원 2022. 7. 28. 2017다245330이 민법 §1108①(유증 철회)을 사인증여에
          //   준용된다고 판시했다. 이걸 안 알리면 사용자는 "한 번 서명하면 끝"으로 읽고,
          //   기관은 구속력 있는 확약으로 오해한다. 둘 다 사실과 다르다.
          //   조문(§1108①)을 근거 줄에 싣는 것은 STATUTES 추가가 필요해 사람 리뷰 대기다
          //   (절대규칙 5 — validity-gate 보호 경로).
          "체결하신 뒤에도 살아 계시는 동안에는 언제든 철회하실 수 있습니다. " +
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
          "그래서 저희는 남은 날짜를 계산해 드리지 않습니다. " +
          referralText("INHERITANCE_LAW"),
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
          "법정 기한도 있으니, 구체적인 사정은 전문가와 상담하시기를 권합니다. " +
          // "상담하시기를 권합니다"로 끝나면 거절만 남는다 — 어디로 가라는 말이 있어야
          // 사용자가 다음 행동을 할 수 있다 (NFR-705 nextAction과 같은 정신)
          referralText("INHERITANCE_LAW"),
        statutes,
      ),
    };
  },
  // 세법 — **답을 만들지 않는다.** 조문도 붙이지 않는다: 근거를 달면 답처럼 읽힌다.
  // 상속세는 재산 종류·공제·상속인 수에 따라 달라져서, 여기서 어림잡는 순간 그 숫자가
  // 사용자의 결정 기준이 된다. 우리 서식이 계산하는 것(기부 공제)과는 다른 층이다
  TAX: () => ({
    topic: "TAX",
    statutes: [],
    reply:
      "세금은 저희가 계산해 드리지 않습니다. 상속세·증여세는 재산의 종류와 상속인 수에 " +
      "따라 크게 달라져서, 어림으로 말씀드리면 오히려 판단을 그르치게 합니다. " +
      `${referralText("TAX")} ` +
      "다만 이 서비스에서 만드시는 기부 약정의 예상 공제액은 확인 화면에서 계산해 보여 드립니다.",
  }),
  // 우리 범위 밖 법률 — **답을 만들지 않는다.** 조문도 붙이지 않는다(근거를 달면 답처럼 읽힌다).
  // 변호사법 §109의 선을 넘지 않으려면 "우리 서류에 관한 안내"에서 멈춰야 한다.
  LEGAL_OTHER: () => ({
    topic: "LEGAL_OTHER",
    statutes: [],
    reply:
      "죄송합니다. 그 문제는 저희가 안내해 드릴 수 있는 범위를 넘습니다. " +
      "저희는 이곳에서 만드시는 서류(기부·유산 약정, 유언장 준비)에 관한 것만 " +
      `안내해 드리고 있습니다. ${referralText("INHERITANCE_LAW")} ` +
      "이곳에서 남기고 싶은 것이 있으시면 그건 언제든 함께 정리해 드릴게요.",
  }),
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
/** 질문 모양인가 — 안내 커버리지를 재는 데 쓴다.
 *  "질문인데 우리가 주제를 모른다"가 카드로 만들 목록이지, 모든 미스가 그렇지는 않다 */
export function isQuestionShaped(text: string): boolean {
  return QUESTION.test(text);
}

export function detectGuide(text: string, docType?: DocType | null): GuideReply | null {
  if (!QUESTION.test(text)) return null;
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(text)) return REPLIES[rule.topic]();
  }
  // 주제어가 없어도 **"이 서류"를 묻는 것**이면 작성실이 아는 서류로 답한다.
  // 마지막에 두는 이유: "이 약정서 말고 상속세는요?"는 위에서 세법이 먼저 가져가야 한다
  const topic = docType ? DOC_TOPIC[docType] : undefined;
  if (topic && ABOUT_THIS_DOC.test(text)) return REPLIES[topic]();
  return null;
}
