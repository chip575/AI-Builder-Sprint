// EmbeddingPort — 임베딩 어댑터 경계 (SignerPort·ExtractorPort와 동형)
//
// Upstage는 적재용과 검색용 모델을 **나눠 쓴다**:
//   embedding-passage — 저장할 문장(발화)을 벡터로
//   embedding-query   — 찾을 문장(질의)을 벡터로
// 같은 모델로 양쪽을 하면 유사도가 떨어진다. 포트가 두 메서드를 가진 이유다.
export interface EmbeddingPort {
  /** 적재용 — 발화를 저장할 때. 세션 종료 시 배치로 부른다 (02.5 §5 비용 가드) */
  embedPassages(texts: string[]): Promise<number[][]>;
  /** 검색용 — 질의 1건 */
  embedQuery(text: string): Promise<number[]>;
}

/** 코사인 유사도. pgvector 없이도 인메모리에서 같은 순위가 나오게 하는 기준이다 */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  // 부동소수 오차로 1을 살짝 넘길 수 있다. 계약이 [0,1]을 요구하므로 자른다
  return Math.min(1, Math.max(0, dot / (Math.sqrt(na) * Math.sqrt(nb))));
}
