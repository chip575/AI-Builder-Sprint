// M-MOCK — GET /api/dev/documents (NFR-707 데모·E2E 도구)
// mock signer의 외부 문서 목록 — webhook-sim에 넣을 documentId를 찾는 용도.
// 실 모드에선 존재 이유가 없다 (모두싸인 콘솔이 그 역할).
import { NextResponse } from "next/server";
import { mockSigner } from "@/lib/signer";

export async function GET() {
  if (!mockSigner) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "MOCK_ONLY",
          message: "이 도구는 mock 모드에서만 사용할 수 있습니다.",
          nextAction: "MODUSIGN_MODE=mock으로 전환한 뒤 다시 시도하세요.",
        },
      },
      { status: 403 },
    );
  }

  const docs = await mockSigner.listDocuments();
  return NextResponse.json({
    ok: true,
    data: docs.map((d) => ({
      documentId: d.documentId,
      status: d.status,
      draftId: d.metadata.draftId ?? null,
    })),
  });
}
