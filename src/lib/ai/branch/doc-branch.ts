// 서류 → 가지 역매핑 (작성실 전용)
//
// **왜 여기인가.** 정본은 lib/rules/branch-doc.ts의 BRANCH_PRIMARY_DOC(가지 → 서류)이고
// 그건 보호 경로다(절대규칙 5). 여기서는 그 표를 **뒤집기만 한다** — 새 사실을 만들지
// 않으므로 정본은 하나로 남는다. 정본이 바뀌면 이 표도 자동으로 따라간다.
//
// **왜 필요한가.** 작성실은 사용자가 서류를 **이미 골라서** 들어온 화면이다. 그런데
// 대화 파이프라인은 가지(BranchType)로 돌아간다 — 슬롯도, 프롬프트도, 추출기도.
// 가지가 비어 있으면 대화는 축(회상 인터뷰)으로 취급되어, 기부 약정서를 쓰는 중에
// "가장 잘했다고 생각하는 결정은 무엇인가요?"가 나온다 (2026-08-03 실사용).
//
// 예전에는 첫 발화("고향에 기부하고 싶어요")를 express 규칙이 다시 읽어서 가지를
// 정했다. **화면이 아는 것을 문장으로 바꿔 놓고 도로 알아맞히는 구조**라, 규칙이
// 조사 하나에 미끄러지면 엉뚱한 가지가 열렸다. 이제 화면이 그냥 말해 준다.
import { BRANCH_PRIMARY_DOC } from "../../rules/branch-doc";
import type { BranchType, DocType } from "../../contracts/common";

const DOC_TO_BRANCH = Object.fromEntries(
  Object.entries(BRANCH_PRIMARY_DOC).map(([branch, doc]) => [doc, branch as BranchType]),
) as Partial<Record<DocType, BranchType>>;

/**
 * 이 서류를 쓰는 대화는 어느 가지인가. 대응하는 가지가 없는 서류(마음 편지 등)는 null —
 * 그런 대화는 슬롯을 모으지 않으므로 가지가 없는 것이 옳다.
 */
export function branchForDoc(docType: DocType | null | undefined): BranchType | null {
  return docType ? (DOC_TO_BRANCH[docType] ?? null) : null;
}
