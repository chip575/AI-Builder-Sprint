// M-OBSERVABILITY — GET /api/admin/pipeline-stats (NFR-709)
// 6단계 실행 지표. 계측은 각 라우트가 track()으로 하고, 여기는 집계만 읽는다.
import { PipelineStatsRes } from "@/lib/contracts";
import { store } from "@/lib/store";

export async function GET() {
  const stages = await store.getPipelineStats();
  return Response.json({
    ok: true,
    data: PipelineStatsRes.parse({
      stages,
      totalRecords: stages.reduce((n, s) => n + s.success + s.fail, 0),
    }),
  });
}
