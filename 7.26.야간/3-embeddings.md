브랜치: m3

M-EMBEDDINGS 구현 (02.5 §3) — 세션 회상 검색.

## 왜 만드는가
축의 세션 간격은 며칠~몇 달이다. 간격이 벌어질수록 "지난번엔 어머니
이야기를 하셨어요"(FR-110)와 마음 유언 문단의 근거 발화 연결(FR-111)이
최근 N개 요약으로는 불가능해진다. 기간 무관 관리를 기술적으로
성립시키는 장치다 (D-07).

## 스키마 (파일 작성만, db push 금지)
supabase/migrations/<타임스탬프>_embeddings.sql
- create extension if not exists vector;
- utterance_embeddings: utterance_id FK, intent_id, embedding vector(차원은
  Upstage 문서 확인 후 결정 — 주석에 근거 URL·확인일 남길 것), created_at
- 유사도 검색용 인덱스 (ivfflat 또는 hnsw)
- enable row level security, 정책 없음 (D-18)
- 파일 끝에 select public.assert_rls_enabled();

## 구현
- EmbeddingPort — SignerPort·ExtractorPort와 동형
  - mock: 결정론적 더미 벡터 (같은 입력 → 같은 벡터, 테스트 가능)
  - real: embedding-passage(적재) / embedding-query(검색)
  - UPSTAGE_MODE=real인데 키 없으면 명시적 실패 (조용한 폴백 금지)
- 적재 시점: 세션 종료 시 배치 (대화 중 실시간 호출 금지 — 비용 가드 02.5 §5)
- 검색 1: 세션 재개 시 top-k 관련 발화 → 재개 카드
- 검색 2: 마음 유언 문단 편집 시 근거 발화 후보 제시 (FR-111)
- 인메모리 구현은 코사인 유사도 직접 계산 (pgvector 없이도 테스트 가능)

## 테스트
1. mock 벡터가 결정론적인지 (같은 입력 2회 → 동일)
2. top-k가 유사도 내림차순인지
3. 세션 종료 전에는 적재가 일어나지 않는지 (비용 가드)
4. 키 없이 real 모드 → 명시적 실패
5. 소프트 삭제된 발화가 검색 결과에서 제외되는지

## 금지
- db push / 계약 변경 / lib/rules 수정
- 대화 중 실시간 임베딩 호출

## 완료 조건
pnpm test && pnpm typecheck && pnpm gate:check 통과 → 커밋
하나라도 실패하면 커밋하지 말고 종료
