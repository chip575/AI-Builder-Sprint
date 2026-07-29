// StorePort 선택 — SUPABASE_URL(+service key) 있으면 Supabase, 없으면 인메모리.
// 인메모리 폴백은 NFR-707의 명시 요구다 (예선 에이전트는 키가 없다) — 조용한 폴백이
// 아니라 아래 로그 1줄로 선언한다 (보안 7조 정합, D-18).
import { InMemoryStore } from "./memory";
import type { StorePort } from "./port";
import { SupabaseStore } from "./supabase";

const g = globalThis as unknown as { __namgidaStore?: StorePort };

function select(): StorePort {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    console.log("[store] DATA_MODE=supabase");
    return new SupabaseStore(url, key);
  }
  console.log("[store] DATA_MODE=memory — no SUPABASE_URL (NFR-707 폴백)");
  return new InMemoryStore();
}

// 선택·로그는 정확히 1회 (globalThis 캐시 — HMR 중복 출력은 무해하므로 막지 않는다)
export const store: StorePort = (g.__namgidaStore ??= select());

export type { StorePort } from "./port";
export * from "./types";
