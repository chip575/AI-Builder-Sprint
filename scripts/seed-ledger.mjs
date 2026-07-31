// 원장 시드 — 시연용 이력을 **몇 달 간격**으로 심는다.
//
// 왜 API가 아니라 이 스크립트인가:
//   노드의 createdAt은 DB의 now()가 정하고, 계약(LedgerNodeReq)에 날짜 필드가 없다.
//   클라이언트가 생성 시각을 정할 수 있으면 원장이 증거이길 그만두므로 그게 맞다.
//   하지만 시연에서 네 노드가 전부 같은 날이면 "뜻이 시간을 따라 변했다"가 아니라
//   "하루에 네 번 바꿨다 = 판단력 의심"으로 읽힌다 — FR-553이 방어하려던 바로 그 공격이다.
//
// buildNode가 시각을 호출자에게서 받으므로(chain.ts), 과거 날짜로 심어도 해시 체인은
// 그대로 유효하다. 시연에서 chainValid=true가 정직하게 나온다.
//
// 사용: node scripts/seed-ledger.mjs [subjectId]
//       subjectId를 주지 않으면 가장 최근 intent를 쓴다.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { buildNode } from "../src/lib/ledger/chain.ts";

function env(key) {
  const m = readFileSync(".env", "utf-8").match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
}

const url = env("SUPABASE_URL") ?? env("NEXT_PUBLIC_SUPABASE_URL");
const key = env("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error("[seed] .env에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

/** 시연 서사 — 14개월에 걸친 네 번의 변화.
 *  마지막이 ACTIVE가 되고 앞의 셋은 "지나간 뜻"으로 표시된다. */
const STORY = [
  {
    at: "2025-05-14T10:20:00.000Z",
    changeSummary: { donationTarget: "부산 지역아동센터" },
    changeReason: "진단을 받고 처음으로 남길 것을 정리했습니다. 자란 동네에 남기고 싶습니다.",
  },
  {
    at: "2025-11-02T14:05:00.000Z",
    changeSummary: { wording: "문구 다듬음" },
    changeReason: "표현이 딱딱해 읽는 사람이 편하도록 고쳤습니다.",
  },
  {
    at: "2026-03-19T09:40:00.000Z",
    changeSummary: { beneficiary: "장남 → 차녀" },
    changeReason: "큰아이와 오래 이야기한 끝에 뜻을 바꿉니다. 서운함이 아니라 형편을 본 결정입니다.",
    conditionNote: "가족 상의 후 본인이 직접 작성",
    witness: [{ name: "김가상", relation: "배우자" }],
  },
  {
    at: "2026-07-08T16:15:00.000Z",
    changeSummary: { donationTarget: "부산 지역아동센터 + 모교 장학회" },
    changeReason: "모교에서 받은 도움을 갚고 싶어 한 곳을 더 넣습니다.",
  },
];

// 실질성은 코드가 판정한다 — 시드가 등급을 손으로 정하면 그 판정을 못 보여준다
const { judgeMateriality } = await import("../src/lib/ledger/chain.ts");

const subjectId = process.argv[2] ?? (await pickLatestIntent());

async function pickLatestIntent() {
  const { data, error } = await db
    .from("intents")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data?.length) {
    console.error("[seed] intent를 찾지 못했습니다. subjectId를 인자로 주세요.");
    process.exit(1);
  }
  return data[0].id;
}

const { data: existing } = await db
  .from("intent_ledger_nodes")
  .select("seq")
  .eq("subject_id", subjectId)
  .limit(1);
if (existing?.length) {
  console.error(
    `[seed] ${subjectId}에 이미 노드가 있습니다. append-only라 덮어쓸 수 없습니다 — 새 intent를 쓰세요.`,
  );
  process.exit(1);
}

let prev;
for (const step of STORY) {
  const node = buildNode(
    prev,
    {
      subjectId,
      materiality: judgeMateriality(step.changeSummary),
      changeSummary: step.changeSummary,
      changeReason: step.changeReason,
      conditionNote: step.conditionNote ?? null,
      witness: step.witness ?? null,
      draftId: null,
    },
    { id: randomUUID(), createdAt: step.at },
  );

  const { error } = await db.from("intent_ledger_nodes").insert({
    id: node.id,
    subject_id: node.subjectId,
    seq: node.seq,
    materiality: node.materiality,
    change_summary: node.changeSummary,
    change_reason: node.changeReason,
    condition_note: node.conditionNote,
    witness: node.witness,
    draft_id: node.draftId,
    prev_hash: node.prevHash,
    node_hash: node.nodeHash,
    status: node.status,
    created_at: node.createdAt,
  });
  if (error) {
    console.error("[seed] 적재 실패:", error.message);
    process.exit(1);
  }
  console.log(`  seq ${node.seq}  ${node.materiality.padEnd(10)} ${step.at.slice(0, 10)}`);
  prev = node;
}

console.log(`\n시드 완료 — /ledger/${subjectId}`);
