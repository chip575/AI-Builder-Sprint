// mock 임베딩 — 키 없이 회상 검색 전체가 돈다 (NFR-707).
// 결정론이 핵심이다: 같은 문장은 언제나 같은 벡터여야 테스트가 성립한다.
import type { EmbeddingPort } from "./port";

/** 실제 차원(4096)을 쓸 이유가 없다 — mock은 순위만 맞으면 된다.
 *  차원을 키우면 테스트가 느려지기만 한다 */
const DIM = 64;

/** 문자열 → 결정론적 벡터. 문자 코드를 차원에 분산시켜 누적한다.
 *  같은 어휘가 겹치는 문장끼리 유사도가 높아지므로 "관련 발화 찾기"를 흉내낸다 */
export function mockVector(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  const tokens = text.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    let h = 0;
    for (let i = 0; i < token.length; i += 1) {
      h = (h * 31 + token.charCodeAt(i)) >>> 0;
    }
    v[h % DIM] = (v[h % DIM] ?? 0) + 1;
    // 인접 차원에도 약하게 실어 어휘가 조금만 달라도 완전히 직교하지 않게 한다
    v[(h + 1) % DIM] = (v[(h + 1) % DIM] ?? 0) + 0.5;
  }
  return v;
}

export class MockEmbedder implements EmbeddingPort {
  async embedPassages(texts: string[]): Promise<number[][]> {
    return texts.map(mockVector);
  }
  async embedQuery(text: string): Promise<number[]> {
    return mockVector(text);
  }
}
