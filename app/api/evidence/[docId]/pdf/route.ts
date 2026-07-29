// M-EVIDENCE — 만료형 PDF 접근 (D-10: 15분 만료 서명 URL의 검증 지점)
// 실서비스에선 Supabase Storage signed URL이 대체한다. mock에서도 만료는 실제로 계산·거부한다.
import { verifyEvidenceUrl } from "../../sign-url";
import { store } from "@/lib/store";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ docId: string }> },
) {
  const { docId } = await ctx.params;
  const url = new URL(req.url);
  const verdict = verifyEvidenceUrl(
    docId,
    url.searchParams.get("expires"),
    url.searchParams.get("sig"),
  );

  if (verdict !== "OK") {
    return Response.json(
      {
        ok: false,
        error: {
          code: verdict === "EXPIRED" ? "URL_EXPIRED" : "URL_INVALID",
          message:
            verdict === "EXPIRED"
              ? "다운로드 링크의 유효시간이 지났습니다."
              : "유효하지 않은 다운로드 링크입니다.",
          nextAction: "증빙 화면에서 링크를 다시 발급받아 주세요.",
        },
      },
      { status: 403 },
    );
  }

  const evidence = await store.getEvidenceByDraft(docId);
  if (!evidence) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "증빙을 찾을 수 없습니다.",
          nextAction: "서명이 완료된 뒤 다시 확인해 주세요.",
        },
      },
      { status: 404 },
    );
  }

  // mock PDF — 실 연동에서는 Storage의 완료 PDF 바이트. 해시의 원천은 저장 시점(아웃박스)이다
  const body = `%PDF-1.4\n% mock evidence for ${docId}\n% sha256=${evidence.sha256}\n%%EOF\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="evidence-${docId}.pdf"`,
      "Cache-Control": "no-store", // 만료형 URL — 캐시 금지
    },
  });
}
