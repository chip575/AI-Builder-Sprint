import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// ⚠ 여기서 .env를 process.env로 올리지 않는다 — 의도된 설계다.
// 올리면 라우트 테스트까지 실 DB를 때려서 ① 인메모리 전제(FK 없음·객체 참조)로 쓴
// 테스트가 깨지고 ② `pnpm test`가 실 DB에 테스트 데이터를 영구히 쓴다
// (utterances는 물리 삭제 불가라 되돌릴 수도 없다).
//
// 분리 원칙:
//   pnpm test → 라우트·유닛은 인메모리(빠르고 격리됨) + 공유 계약 스위트만
//               .env를 직접 읽어 실 DB 검증 (lib/store/supabase.contract.test.ts)
//   pnpm e2e  → dev 서버(Next가 .env 자동 로드)로 풀스택 실 DB 관통
export default defineConfig({
  test: {
    // 실 DB 왕복은 기본 5초를 넘긴다
    testTimeout: 30_000,
  },
  resolve: {
    // tsconfig paths("@/*")와 동일하게 — 라우트 핸들러를 직접 import해 테스트한다
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
