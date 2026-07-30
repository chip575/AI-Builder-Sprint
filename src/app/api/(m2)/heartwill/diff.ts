// 버전 간 변경 요약 (FR-111). HeartWillVersionRes.diff의 유일한 생산자다.
//
// 왜 저장소가 아니라 여기 있는가: 같은 로직을 인메모리·Supabase 두 어댑터에 심으면
// 언젠가 두 벌이 어긋난다. 어댑터는 "무엇이 저장됐나"만 답하고, "무엇이 달라졌나"는
// 순수 함수 하나가 답한다.
//
// 문단 동일성의 기준은 id가 아니라 **근거 발화**다. 버전마다 문단은 새 행이라
// id가 바뀌지만, 같은 발화에서 나온 문단은 같은 자리의 문장이기 때문이다.
import type { HeartWillVersionRes } from "@/lib/contracts";
import type { HeartWillParagraph } from "@/lib/store";

type Diff = HeartWillVersionRes["diff"];

export function diffParagraphs(
  /** 직전 버전의 본문(승인 문단만) */
  prev: HeartWillParagraph[],
  /** 새 버전의 본문(승인 문단만) */
  next: HeartWillParagraph[],
): Diff {
  // 한 발화에서 문단이 둘 이상 나올 수 있다 — 큐로 짝지어야 둘째 문단이
  // 첫째와 잘못 비교되지 않는다
  const unmatched = new Map<string, HeartWillParagraph[]>();
  for (const p of prev) {
    const queue = unmatched.get(p.sourceUtteranceId);
    if (queue) queue.push(p);
    else unmatched.set(p.sourceUtteranceId, [p]);
  }

  const diff: Diff = [];
  for (const p of next) {
    const old = unmatched.get(p.sourceUtteranceId)?.shift();
    if (!old) {
      diff.push({ paragraphId: p.id, kind: "ADDED", sourceUtteranceId: p.sourceUtteranceId });
    } else if (old.body !== p.body) {
      diff.push({ paragraphId: p.id, kind: "EDITED", sourceUtteranceId: p.sourceUtteranceId });
    }
    // 본문이 같으면 그대로 이월된 문단이다 — 변경이 아니므로 diff에 넣지 않는다.
    // 여기서 이월분까지 실으면 "diff 확인 후 승인"이라는 P1의 형식이 무의미해진다
  }

  // 새 본문이 물려받지 않은 옛 문단. paragraphId는 **직전 버전**의 id다
  for (const queue of unmatched.values()) {
    for (const old of queue) {
      diff.push({
        paragraphId: old.id,
        kind: "REMOVED",
        sourceUtteranceId: old.sourceUtteranceId,
      });
    }
  }
  return diff;
}
