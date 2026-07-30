// M-GATE-COUNTER — GET /api/admin/gate-stats (FR-509)
// 게이트가 무효 서명 시도를 몇 건 막았는가. 판정은 lib/rules가 하고,
// 기록은 호출 지점이 하며, 여기는 집계만 읽는다.
import { GateStatsRes } from "@/lib/contracts";
import { store } from "@/lib/store";

export async function GET() {
  const stats = await store.getGateStats();
  return Response.json({ ok: true, data: GateStatsRes.parse(stats) });
}
