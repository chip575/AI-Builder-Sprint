// Supabase 구현 — 인메모리와 **같은 스위트**를 돈다. 이게 "두 구현이 같은 규칙"의 유일한 증명.
// .env를 여기서 직접 읽는다 — vitest.config에서 전역으로 올리면 라우트 테스트까지
// 실 DB를 때려 테스트 데이터가 영구히 남는다 (vitest.config 주석 참조).
// 전제: 마이그레이션이 적용된 프로젝트.
import { existsSync, readFileSync } from "node:fs";
import { describe } from "vitest";
import { SupabaseStore } from "./supabase";
import { storeContractTests } from "./store-contract";

function fromDotEnv(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  if (!existsSync(".env")) return undefined;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0 || line.slice(0, i).trim() !== key) continue;
    return line.slice(i + 1).trim() || undefined;
  }
  return undefined;
}

const url = fromDotEnv("SUPABASE_URL") ?? fromDotEnv("NEXT_PUBLIC_SUPABASE_URL");
const key = fromDotEnv("SUPABASE_SERVICE_ROLE_KEY");

if (url && key) {
  storeContractTests("supabase", async () => new SupabaseStore(url, key));
} else {
  describe.skip("StorePort 계약 — supabase (키 없음 — 건너뜀)", () => {});
}
