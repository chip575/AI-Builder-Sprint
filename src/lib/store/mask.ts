// 식별번호 마스킹 (NFR-712)
//
// ⚠ human_review: required — 마스킹 코드는 사람 리뷰 후 병합한다 (AGENTS.md 보안 5조).
//
// **저장 계층에 둔다.** 라우트에 두면 "마스킹을 부르지 않은 라우트"가 언젠가 하나 생기고,
// 그때 원문이 DB에 앉는다. 어댑터가 저장 직전에 부르면 호출부가 무엇을 보내든
// 표에는 마스킹된 값만 남는다 — 규칙을 지키는 자리가 하나뿐이어야 지켜진다.
//
// 규칙: 숫자를 뒤에서 4자리만 남기고 전부 가린다. 구분자(-·공백·문자)는 그대로 둔다 —
// 본인이 "내 계좌구나"를 알아보는 데 필요한 최소한이고, 그 이상은 남길 이유가 없다.
// 숫자가 4자리 이하면 남기지 않는다 (그 자체가 번호 전체이기 때문이다).

const KEEP_TAIL = 4;

export function maskIdentifier(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const value = raw.trim();
  if (value === "") return null;

  const digitCount = (value.match(/\d/g) ?? []).length;
  if (digitCount === 0) return value; // 숫자가 없으면 식별번호가 아니다 ("○○은행" 등)
  const keep = digitCount > KEEP_TAIL ? KEEP_TAIL : 0;

  let seen = 0;
  const masked: string[] = [];
  for (let i = value.length - 1; i >= 0; i--) {
    const ch = value[i]!;
    if (ch >= "0" && ch <= "9") {
      seen += 1;
      masked.push(seen <= keep ? ch : "*");
    } else {
      masked.push(ch);
    }
  }
  return masked.reverse().join("");
}
