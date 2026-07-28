// M-EXTRACT — mock 추출기 (UPSTAGE_MODE=mock · NFR-707). 결정론적.
// 실제 Solar structured output이 붙어도 이 규칙(신뢰도 3단계·confirmed=false)은 동일하다.
import { randomUUID } from "node:crypto";
import type { IntentFact, IntentFactList } from "../../contracts/extract";
import type { Utterance } from "../session/store";
import { CONFIDENCE } from "./confidence";
import { parseAmount } from "./parse-amount";
import type { ExtractInput, ExtractorPort } from "./port";

/** 광역 지자체 표기 — 기부처 슬롯의 mock 사전. 법률 수치 아님 */
const REGIONS = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

/** 가지별 필수 슬롯 — 비면 missingRequired로 보고, 문서 생성은 서버가 403 (FR-102·FR-104) */
const REQUIRED_SLOTS: Record<string, string[]> = {
  DONATION_NOW: ["region", "amount"],
  HERITAGE_SUPPORT: ["orgName", "amount"],
};

/** confirm·documents가 확정 시점에 재검증할 때 쓴다 — 추출 시점 스냅숏에 의존하지 않기 위해 */
export function requiredSlotsFor(branchType: string | null): string[] {
  return branchType ? (REQUIRED_SLOTS[branchType] ?? []) : [];
}

function fact(
  key: string,
  value: string | number,
  confidence: number,
  u: Utterance,
  start: number,
  end: number,
): IntentFact {
  return {
    id: randomUUID(),
    key,
    value,
    confidence,
    sourceSpan: { utteranceId: u.id, start, end, text: u.text.slice(start, end) },
    confirmed: false, // AI 산출물은 전부 confirmed=false로 시작한다 (P1)
  };
}

export class MockExtractor implements ExtractorPort {
  async extract(input: ExtractInput): Promise<IntentFactList> {
    const facts = new Map<string, IntentFact>(); // key별 최신 발화가 이긴다 (정정 반영)

    for (const u of input.utterances) {
      const region = REGIONS.find((r) => u.text.includes(r));
      if (region) {
        const start = u.text.indexOf(region);
        facts.set(
          "region",
          fact("region", region, CONFIDENCE.HIGH, u, start, start + region.length),
        );
      }

      const amount = parseAmount(u.text);
      if (amount) {
        facts.set(
          "amount",
          fact(
            "amount",
            amount.value,
            amount.source === "EXPLICIT" ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
            u,
            amount.start,
            amount.end,
          ),
        );
      }
    }

    const required = input.branchType ? (REQUIRED_SLOTS[input.branchType] ?? []) : [];
    return {
      facts: [...facts.values()],
      missingRequired: required.filter((k) => !facts.has(k)),
    };
  }
}
