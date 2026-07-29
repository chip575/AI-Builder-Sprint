// Supabase 구현 — SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 있을 때만 같은 스위트를 돈다.
// 마이그레이션 0001·0002가 적용된 프로젝트가 전제다.
import { describe } from "vitest";
import { SupabaseStore } from "./supabase";
import { storeContractTests } from "./store-contract";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (url && key) {
  storeContractTests("supabase", async () => new SupabaseStore(url, key));
} else {
  describe.skip("StorePort 계약 — supabase (SUPABASE_URL 없음 — 건너뜀)", () => {});
}
