// 제안 생성 (FR-115A) — AI는 가지를 열지 않는다. 제안만 한다.
//
// 세 가지가 여기서 성립한다:
//  ① 근거 발화 없는 제안은 **생성 자체가 불가능**하다 (createProposal이 던진다)
//  ② 닫은 가지는 다시 제안되지 않는다
//  ③ 문구는 고정 표에서 나온다 — 모델이 쓰지 않는다 (NFR-708 권유·설득 금지)
import { BranchProposal } from "../../contracts/branch";
import type { BranchOrigin, BranchType } from "../../contracts/common";
import { store } from "../../store";
import { BRANCH_WEIGHT } from "../../rules/branch-weight";
import { addProposal } from "../session/store";
import type { Utterance } from "../session/store";
import { detector } from "./detect";
import {
  declinedBranchTypes,
  proposedBranchTypes,
  rememberProposal,
} from "./store";

/**
 * 확인형 제안 문구 (FR-115A) — "방금 ○○ 이야기를 하셨어요. …정리해볼까요?"
 * 권유·설득·긴급성 어휘를 넣지 않는다. 사용자가 답하지 않아도 되는 문장이어야 한다.
 * 문구를 고칠 때는 branch.test.ts의 금칙어 검사를 함께 본다.
 */
const PROPOSAL_MESSAGE: Record<BranchType, string> = {
  DONATION_NOW: "방금 기부 이야기를 하셨어요. 기부 약정을 정리해볼까요?",
  HERITAGE_SUPPORT: "방금 문화유산 후원 이야기를 하셨어요. 후원 약정을 정리해볼까요?",
  LEGACY_GIFT: "방금 유산 기부 이야기를 하셨어요. 유산 기부 약정을 정리해볼까요?",
  HANDWRITTEN_WILL: "방금 유언 이야기를 하셨어요. 자필 유언 안내를 함께 볼까요?",
  ESTATE: "방금 자산 정리 이야기를 하셨어요. 자산 목록을 정리해볼까요?",
};

export interface ProposeInput {
  sessionId: string;
  userId: string;
  /** 살아있는 발화들. 마지막 원소가 방금 한 발화다 */
  utterances: Utterance[];
}

/**
 * 제안 1건 생성 — EXPRESS 직행(FR-115B)과 DETECTED 감지가 함께 쓰는 유일한 입구.
 * @throws 근거 발화 id가 없으면. 근거 없는 제안은 만들 수 있으면 안 된다 (FR-115A)
 */
export async function createProposal(args: {
  sessionId: string;
  userId: string;
  branchType: BranchType;
  origin: BranchOrigin;
  sourceUtteranceId: string;
}): Promise<BranchProposal> {
  if (!args.sourceUtteranceId) {
    throw new Error("[branch] 근거 발화 없는 제안은 만들 수 없습니다 (FR-115A).");
  }
  const record = await addProposal(
    args.sessionId,
    args.branchType,
    args.origin,
    args.sourceUtteranceId,
  );
  const proposal = BranchProposal.parse({
    id: record.id,
    branchType: record.branchType,
    origin: record.origin,
    // 등급은 코드가 정한다 — 모델도, 호출부도 정하지 않는다
    weight: BRANCH_WEIGHT[record.branchType],
    sourceUtteranceId: record.sourceUtteranceId,
    message: PROPOSAL_MESSAGE[record.branchType],
  });
  rememberProposal(proposal, args.sessionId, args.userId);
  return proposal;
}

/**
 * 대화 중 감지 → 제안. 제안할 게 없으면 빈 배열이다 (0건은 결함이 아니다).
 * 감지 실패는 호출부가 삼킨다 — 감지가 대화를 죽이지 않는다.
 */
export async function proposeBranches(input: ProposeInput): Promise<BranchProposal[]> {
  const signals = await detector.detect({ utterances: input.utterances });
  if (signals.length === 0) return [];

  // 근거는 **이 세션의 살아있는 발화**여야 한다. 모델이 지어낸 id도, 지워진 발화도 안 된다
  const liveIds = new Set(input.utterances.map((u) => u.id));
  // 닫은 가지는 **영속 기록**에서 읽는다 — 메모리에만 두면 인스턴스가 갈릴 때
  // 거절했던 가지가 되살아나고, 사용자에게는 거절이 무시된 것으로 보인다 (FR-115A)
  const closed = new Set(await store.listDeclinedBranchesByUser(input.userId));
  const seen = proposedBranchTypes(input.sessionId);

  const made: BranchProposal[] = [];
  for (const signal of signals) {
    if (!liveIds.has(signal.sourceUtteranceId)) continue; // 근거 없음 → 제안하지 않는다
    if (closed.has(signal.branchType)) continue;          // 닫은 가지 → 다시 묻지 않는다
    if (seen.has(signal.branchType)) continue;            // 이미 꺼낸 가지 → 두 번 묻지 않는다
    seen.add(signal.branchType);
    made.push(
      await createProposal({
        sessionId: input.sessionId,
        userId: input.userId,
        branchType: signal.branchType,
        origin: "DETECTED",
        sourceUtteranceId: signal.sourceUtteranceId,
      }),
    );
  }
  return made;
}
