// 한국어 금액 표현 파싱 — 언어 처리이지 법률 수치가 아니다. 그래서 lib/rules가 아니라 여기다.
// (lib/rules의 정체성은 법률 수치 — 여기 섞이면 "rules에 있으니 법적 근거"라는 착각이 생긴다)
// 만/억 곱셈 테이블은 국어 수사이지 법령 값이 아니므로 gate:check 3번 대상도 아니다.

export interface ParsedAmount {
  value: number;
  /** EXPLICIT = 숫자가 원문에 명시 ("100만원") / PARSED = 수사·어림 표현을 해석 ("한 십만원쯤") */
  source: "EXPLICIT" | "PARSED";
  /** 원문 위치 — sourceSpan용 */
  start: number;
  end: number;
  text: string;
}

const SMALL: Record<string, number> = { 십: 10, 백: 100, 천: 1000 };
const BIG: Record<string, number> = { 만: 10_000, 억: 100_000_000 };
const DIGIT: Record<string, number> = {
  일: 1, 한: 1, 이: 2, 두: 2, 삼: 3, 세: 3, 사: 4, 네: 4,
  오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9,
};

/** 어림 표현 — 값은 뽑되 EXPLICIT로 치지 않는다 */
const HEDGE = /쯤|정도|어림|대충|약\s/;

// 숫자 표기: "100만원" "1,000,000원" "20만 원"
const NUMERIC = /([0-9][0-9,]*)\s*(십|백|천)?\s*(만|억)?\s*원/;
// 수사 표기: "한 십만원" "삼십만원" "백만원" "이천만원"
const KOREAN = /(일|한|이|두|삼|세|사|네|오|육|칠|팔|구)?\s*(십|백|천)?\s*(만|억)\s*원/;

/**
 * 발화에서 금액 1건을 파싱한다. 없으면 null.
 * "한 십만원쯤" → { value: 100000, source: "PARSED" } — 확인 화면에서 반드시 사용자 확정.
 */
export function parseAmount(utterance: string): ParsedAmount | null {
  const hedged = HEDGE.test(utterance);

  const num = NUMERIC.exec(utterance);
  if (num) {
    const [, digits, small, big] = num;
    const value =
      Number(digits!.replaceAll(",", "")) *
      (small ? SMALL[small]! : 1) *
      (big ? BIG[big]! : 1);
    if (Number.isFinite(value) && value > 0) {
      return {
        value,
        source: hedged ? "PARSED" : "EXPLICIT",
        start: num.index,
        end: num.index + num[0].length,
        text: num[0],
      };
    }
  }

  const kor = KOREAN.exec(utterance);
  if (kor) {
    const [, digit, small, big] = kor;
    const value =
      (digit ? DIGIT[digit]! : 1) * (small ? SMALL[small]! : 1) * BIG[big!]!;
    return {
      value,
      source: "PARSED", // 수사 해석은 항상 PARSED — 사용자 확인을 거친다
      start: kor.index,
      end: kor.index + kor[0].length,
      text: kor[0],
    };
  }

  return null;
}
