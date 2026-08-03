// 안내 분류기 — **규칙이 놓친 질문을 모델이 라벨로만 건져 올린다.**
//
// 왜 이런 모양인가.
//
//  · 정규식만으로는 유연하지 않다. 실측에서 "이거 연말정산에 쓸 수 있어요?"(세제),
//    "마음이 바뀌면 어떻게 하죠?"·"서명하고 후회하면요?"(철회), "재산을 사회에
//    환원하고 싶은데 어떻게 시작하죠?"(서류 추천)가 전부 빠져나갔다 (2026-08-03).
//    표현을 계속 더하는 것으로는 못 따라간다.
//
//  · 그렇다고 모델에게 **답을 쓰게 하면 안 된다.** 두 가지 이유가 겹친다:
//    ① 실측에서 모델이 사인증여를 두고 "공증 절차를 마친 후부터 효력이 발생합니다"라는
//       틀린 말을 했다. ② 안내 문단에는 조문과 기간이 들어 있어, 그것을 프롬프트에 넣는
//       순간 절대규칙 2(법률 수치를 프롬프트에 넣지 않는다)를 어긴다 — gate:check가 잡는다.
//
//  그래서 **모델은 라벨만 고르고, 문장은 코드가 낸다.** 법령 문장은 프롬프트에도,
//  모델 출력에도 존재하지 않는다. 환각이 낄 자리가 구조적으로 없다.
//
// 부르는 시점: 질문형인데 규칙이 못 잡았을 때만 (라우트의 `[guide] MISS` 자리).
// 그래서 보통 대화에는 호출도, 지연도 붙지 않는다.
import type { DocType } from "../../contracts/common";

/** 모델이 고를 수 있는 것 전부. 닫힌 집합이라 엉뚱한 값이 오면 버린다 */
export const GUIDE_LABELS = [
  "WHICH_DOC", // 어떤 서류를 써야 하는가
  "DOC_TAX", // 이 서류의 세금·공제
  "DOC_REVOKE", // 그만두기·철회
  "WILL",
  "LEGACY_GIFT",
  "DEADLINE",
  "INHERITANCE",
  "TAX",
  "DONATION",
  "LEGAL_OTHER",
  "NONE", // 안내할 것이 없다 — 대화로 흘려보낸다
] as const;
export type GuideLabel = (typeof GUIDE_LABELS)[number];

/** WHICH_DOC일 때 함께 고르는 서류. 못 고르면 null — 되묻는 답이 나간다 */
export const SITUATION_DOCS = [
  "DONATION_PLEDGE",
  "HERITAGE_SUPPORT_PLEDGE",
  "LEGACY_GIFT_AGREEMENT",
  "HANDWRITTEN_WILL",
  "HEART_LETTER",
] as const;

export interface GuideClassification {
  label: GuideLabel;
  /** WHICH_DOC에서 고른 서류 */
  doc: DocType | null;
}

export interface GuideClassifierPort {
  classify(text: string, docType: DocType | null): Promise<GuideClassification | null>;
}

/**
 * mock — **항상 null.** 규칙만으로 판정하던 때와 똑같이 동작한다.
 *
 * 분류기가 mock에서 라벨을 지어내면 유닛테스트가 "규칙이 잡았는지"와 "분류기가
 * 메웠는지"를 구분하지 못한다. 결정론을 지키는 쪽이 훨씬 값지다.
 */
export class MockGuideClassifier implements GuideClassifierPort {
  async classify(): Promise<null> {
    return null;
  }
}

const SYSTEM = [
  "너는 분류기다. 사용자의 말이 무엇을 묻는지 라벨 하나만 고른다.",
  "**답을 쓰지 마라.** 설명도 하지 마라. 아래 JSON만 출력한다.",
  '{"label":"<라벨>","doc":"<서류 또는 null>"}',
  "",
  "라벨:",
  "- WHICH_DOC: 어떤 서류를 써야 할지 묻는다 (상황을 말하며 무엇을 준비할지 묻는 경우 포함)",
  "- DOC_TAX: 세금·공제·연말정산·기부금 영수증에 관해 묻는다",
  "- DOC_REVOKE: 취소·철회·해지, 마음이 바뀌면 어떻게 되는지 묻는다",
  "- WILL: 유언장에 관해 묻는다",
  "- LEGACY_GIFT: 세상을 떠난 뒤 재산을 남기는 방법에 관해 묻는다",
  "- DEADLINE: 상속 승인·포기 기간에 관해 묻는다",
  "- INHERITANCE: 법정상속 일반에 관해 묻는다",
  "- TAX: 상속세·증여세 등 세액 자체를 묻는다",
  "- DONATION: 기부 절차에 관해 묻는다",
  "- LEGAL_OTHER: 이혼·소송 등 우리 서류와 무관한 법률 문제를 묻는다",
  "- NONE: 위 어디에도 해당하지 않는다. **확신이 없으면 NONE을 고른다.**",
  "",
  "doc은 label이 WHICH_DOC일 때만 고른다. 그 밖에는 null이다.",
  "doc 후보: DONATION_PLEDGE(지금 기부), HERITAGE_SUPPORT_PLEDGE(문화유산 후원),",
  "LEGACY_GIFT_AGREEMENT(사후에 재산 남김), HANDWRITTEN_WILL(가족에게 상속·유언),",
  "HEART_LETTER(마음·편지). 상황을 못 읽으면 null.",
].join("\n");

export interface SolarGuideClassifierOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  model?: string;
}

/** 응답을 기다리는 한계. 안내 한 번 놓치는 것이 대화가 멎는 것보다 낫다 */
const TIMEOUT_MS = 6_000;

export class SolarGuideClassifier implements GuideClassifierPort {
  private fetchImpl: typeof fetch;
  private base: string;
  private model: string;

  constructor(private opts: SolarGuideClassifierOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.base = opts.baseUrl ?? "https://api.upstage.ai/v1";
    this.model = opts.model ?? "solar-pro3";
  }

  async classify(text: string, docType: DocType | null): Promise<GuideClassification | null> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(`${this.base}/chat/completions`, {
        signal: ctl.signal,
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          reasoning_effort: "minimal",
          temperature: 0,
          messages: [
            { role: "system", content: SYSTEM },
            // 지금 쓰는 서류는 맥락으로만 준다 — 라벨 선택에 쓰이고 답에는 안 실린다
            {
              role: "user",
              content: docType ? `[작성 중인 서류: ${docType}]\n${text}` : text,
            },
          ],
        }),
      });
      if (!res.ok) return null; // 분류 실패는 대화를 죽이지 않는다. 규칙만으로 진행한다
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return parseLabel(body.choices?.[0]?.message?.content ?? "");
    } catch {
      // 타임아웃·네트워크 실패도 마찬가지 — 없는 셈 치고 넘어간다.
      // ⚠ 여기서 임의의 라벨로 대체하지 않는다. 틀린 안내는 침묵보다 나쁘다
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * 모델 출력 → 라벨. **닫힌 집합 밖의 값은 버린다.**
 * 모델이 새 라벨을 지어내도 안내가 새로 생기지 않는다.
 */
export function parseLabel(raw: string): GuideClassification | null {
  const match = /\{[\s\S]*\}/.exec(raw);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const obj = parsed as { label?: unknown; doc?: unknown };
  const label = GUIDE_LABELS.find((l) => l === obj.label);
  if (!label || label === "NONE") return null;
  const doc = SITUATION_DOCS.find((d) => d === obj.doc) ?? null;
  return { label, doc: (doc as DocType | null) ?? null };
}
