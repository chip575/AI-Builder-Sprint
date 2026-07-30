// 회상 발화 → 문단 초안 (FR-111).
//
// 이 함수는 **말을 지어내지 않는다.** 남긴 이야기를 문단 자리에 옮겨 놓을 뿐이다.
// 마음 유언에서 "AI가 더 좋게 다듬은 문장"은 사용자의 말이 아니게 되는 순간이 있고,
// 그 경계를 코드가 아니라 사람이 정해야 하므로 지금은 원문을 그대로 옮긴다.
// (Solar로 실제 초안을 뽑는 자리는 lib/ai — BE-1 소유다. 그때도 산출물은 여기와 같이
//  전부 미승인으로 쌓이고, 문단마다 근거 발화를 달아야 한다.)
import type { HeartWillParagraphDraft, Utterance } from "@/lib/store";

/** 문장 끝으로 인정할 문자 — 이미 끝맺은 말에 마침표를 덧붙이지 않는다 */
const ENDS = [".", "!", "?", "…", "\"", "'", "”", "’", "」", "』"];

function asParagraph(text: string): string {
  const body = text.trim().replace(/\s+/g, " ");
  return ENDS.some((e) => body.endsWith(e)) ? body : `${body}.`;
}

/**
 * 아직 문단이 없는 발화만 초안으로 만든다 — 같은 이야기가 두 문단이 되지 않게.
 * 이미 승인된 문단의 근거 발화도 `existing`에 들어오므로, 사용자가 한 번 판단한
 * 이야기를 다시 승인 목록에 올리지 않는다.
 */
export function buildDraftParagraphs(
  utterances: Pick<Utterance, "id" | "text">[],
  existing: Pick<HeartWillParagraphDraft, "sourceUtteranceId">[],
): HeartWillParagraphDraft[] {
  const covered = new Set(existing.map((p) => p.sourceUtteranceId));
  return utterances
    .filter((u) => !covered.has(u.id) && u.text.trim() !== "")
    .map((u) => ({
      body: asParagraph(u.text),
      origin: "AI_DRAFT" as const,
      sourceUtteranceId: u.id, // 근거 없는 문단은 만들지 않는다 — 저장소가 다시 막는다
    }));
}
