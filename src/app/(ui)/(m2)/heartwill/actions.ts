// 마음 유언 화면의 쓰기 동작 (FR-111).
//
// 왜 서버 액션인가: 문단 목록을 실어 보낼 계약이 lib/contracts에 없다. 없는 계약을
// 임의로 만들어 주고받는 대신(절대규칙 1), 목록은 서버가 직접 읽어 렌더하고 쓰기도
// 서버에서 끝낸다. 계약이 있는 경로(POST /api/heartwill/apply)만 네트워크로 나간다.
//
// 두 액션의 공통 규칙: 무엇을 만들든 **미승인**으로 쌓인다. 문서를 바꾸는 것은
// 승인뿐이다 (P1).
"use server";

import { revalidatePath } from "next/cache";
import { buildDraftParagraphs } from "@/app/api/(m2)/heartwill/draft";
import { store } from "@/lib/store";

const PATH = "/heartwill";

/** 회상에서 남긴 이야기를 문단 자리로 옮긴다. "문서에 넣는다"가 아니라 "고를 거리를 만든다" */
export async function draftFromRecall(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  const session = await store.getSession(sessionId);
  if (!session) return;

  const head = await store.getHeartWillHead(sessionId);
  const drafts = buildDraftParagraphs(session.utterances, head?.paragraphs ?? []);
  if (drafts.length > 0) await store.draftHeartWillParagraphs(sessionId, drafts);
  revalidatePath(PATH);
}

/** 본인이 직접 쓴 문장. AI 초안과 같은 규칙을 받는다 — 근거 발화가 있어야 하고,
 *  쓴다고 문서에 들어가지 않는다. 저장소가 근거를 다시 검사하고, 없으면 던진다 */
export async function addOwnSentence(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const sourceUtteranceId = String(formData.get("sourceUtteranceId") ?? "");
  if (!body || !sourceUtteranceId) return;

  await store.draftHeartWillParagraphs(sessionId, [
    { body, origin: "USER_WRITTEN", sourceUtteranceId },
  ]);
  revalidatePath(PATH);
}
