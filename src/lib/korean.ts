// 한국어 조사 선택 — 앞말의 받침에 따라 갈린다.
//
// 왜 필요한가: 화면·응답에 "지역은(는) 부산"처럼 자리표시자가 그대로 나가면
// **서식 편지처럼 읽힌다.** 이 서비스는 사람이 건네는 말투를 전제로 하는데,
// 조사 하나가 그 전제를 깬다 (2026-08-02 배포본 실측에서 드러남).
//
// 값은 사용자가 말한 것이라 미리 알 수 없으므로 런타임에 고른다.

/** 마지막 글자에 받침이 있는가. 한글 음절이 아니면(숫자·영문) 없는 것으로 본다 */
export function hasBatchim(word: string): boolean {
  const ch = word.trim().at(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  // 한글 음절 영역 밖 — "1,000,000원"처럼 한글로 끝나면 그 글자로 판정된다
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/**
 * 앞말에 맞는 조사를 고른다.
 * @example josa("부산", "은", "는") → "은"   ·   josa("금액", "은", "는") → "은"
 */
export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  return hasBatchim(word) ? withBatchim : withoutBatchim;
}

/** 앞말 + 조사 — 가장 흔한 형태를 한 번에 */
export const eunNeun = (w: string) => `${w}${josa(w, "은", "는")}`;
export const iGa = (w: string) => `${w}${josa(w, "이", "가")}`;
export const eulReul = (w: string) => `${w}${josa(w, "을", "를")}`;
