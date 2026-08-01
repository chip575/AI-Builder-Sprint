// 갱신 도래 시드 — 운영 화면(FR-604)의 "갱신이 다가오는 약속" 목록을 채운다.
//
// 왜 시드가 필요한가:
//   이 약속은 정기후원 문서가 **완료될 때** 12개월 뒤로 생성된다 (webhooks/outbox.ts).
//   즉 실제로 채우려면 12개월을 기다리거나 시간을 당겨야 한다. 화면은 정상인데
//   데이터가 없어 빈 표가 뜨는 상태이고, 그건 코드로는 영영 안 잡힌다 —
//   정적 분석으로도 HTTP 200으로도 드러나지 않는다. 그래서 "고칠 것"이 아니라 "심을 것"이다.
//
// 원장 시드와 같은 원칙: 가상 인물, 실재하는 draft에 붙이고, 날짜를 벌린다.
// 표시명은 화면이 문서 꼬리 4자로 만들므로 여기서 이름을 넣지 않는다 (NFR-714).
//
// 사용: node scripts/seed-obligations.mjs
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

/** .env.local이 .env를 덮는다 (Next 규칙) — 우선순위 순서대로 읽는다 */
function env(key) {
  for (const file of [".env.local", ".env"]) {
    try {
      const v = readFileSync(file, "utf-8")
        .match(new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*([^\\r\\n]*)`, "m"))?.[1]
        ?.trim();
      if (v) return v;
    } catch {
      /* 파일이 없을 수 있다 */
    }
  }
  return undefined;
}

const url = env("SUPABASE_URL") ?? env("NEXT_PUBLIC_SUPABASE_URL");
const key = env("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error("[seed] .env에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// 기준일은 인자로 받는다 — 스크립트가 자기 시계를 만들면 실행 시점마다 결과가 달라진다
const baseArg = process.argv[2];
const base = baseArg ? new Date(baseArg) : new Date();
if (Number.isNaN(base.getTime())) {
  console.error("[seed] 기준일 형식이 올바르지 않습니다. 예: node scripts/seed-obligations.mjs 2026-08-01");
  process.exit(1);
}

/** 며칠 뒤 — 골고루 벌린다. 전부 같은 날이면 "목록"이 아니라 "한 건"으로 읽힌다 */
const OFFSETS_DAYS = [13, 34, 61, 128];

const { data: drafts, error: draftErr } = await db
  .from("document_drafts")
  .select("id")
  .limit(OFFSETS_DAYS.length);
if (draftErr) {
  console.error("[seed] document_drafts 조회 실패:", draftErr.message);
  process.exit(1);
}

const { data: existing } = await db
  .from("obligations")
  .select("id")
  .eq("kind", "RECURRING_RENEWAL")
  .is("fired_at", null);
if (existing?.length) {
  console.log(`[seed] 미발화 갱신 약속이 이미 ${existing.length}건 있습니다. 추가하지 않습니다.`);
  process.exit(0);
}

const rows = OFFSETS_DAYS.map((days, i) => {
  const due = new Date(base);
  due.setUTCDate(due.getUTCDate() + days);
  return {
    kind: "RECURRING_RENEWAL",
    // 실재하는 draft에 붙인다. 없으면 새 uuid — 화면은 꼬리 4자만 쓰므로 표시는 동일하다
    subject_id: drafts?.[i]?.id ?? randomUUID(),
    due_at: due.toISOString(),
    fired_at: null,
  };
});

const { error } = await db.from("obligations").insert(rows);
if (error) {
  console.error("[seed] 적재 실패:", error.message);
  process.exit(1);
}

for (const r of rows) {
  console.log(`  ${r.due_at.slice(0, 10)}  …${r.subject_id.slice(-4)}`);
}
console.log(`\n시드 완료 — ${rows.length}건. /org 의 "갱신이 다가오는 약속"에서 확인하세요.`);
