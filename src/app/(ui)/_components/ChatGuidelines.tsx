// 대화 화면의 사용 설명 — "이 대화는 무엇을 하고 무엇을 하지 않는가"
//
// ⚠ 소유: 화면은 FE 경로다. BE-1이 **새 파일로만** 추가 — 병합 전 FE 리뷰.
//
// 왜 필요한가. 대화창은 무엇이든 물어봐도 될 것처럼 보인다. 그래서 사용자는 세금
// 계산까지 묻고, 답이 "문의처로 가세요"면 서비스가 고장 난 줄 안다. 경계를 미리
// 말해 두면 **거절이 안내가 된다.**
//
// ⚠ 기본은 닫힘이다. 처음 오신 분께도 대화가 먼저이고 설명은 나중이다 —
//   펼쳐 두면 화면이 설명으로 뒤덮여 정작 할 말을 못 꺼낸다 (P4).
// ⚠ 문구를 여기 적지 않는다. lib/ai/session/chatbot-guide.ts가 정본이고, 그건
//   안내층이 실제로 답하는 목록과 같은 파일에서 관리된다 — 화면에 베껴 두면
//   코드가 바뀌어도 설명은 옛말로 남는다.
"use client";

import { useId, useState } from "react";
import { CHATBOT_GUIDE } from "@/lib/ai/session/chatbot-guide";

export function ChatGuidelines({ surface }: { surface: "chat" | "guide" | "write" }) {
  const g = CHATBOT_GUIDE[surface];
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <section className="rounded-2xl border border-stone-200/70 bg-white/60 p-4">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm leading-relaxed text-stone-600">{g.purpose}</p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          aria-label="이 대화 사용 설명"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-stone-300 text-xs text-stone-500 transition hover:border-stone-500 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
        >
          ?
        </button>
      </div>

      {/* 닫혀 있어도 DOM에 남긴다 — 버튼의 aria-controls가 가리킬 대상이 있어야 한다 */}
      <div id={id} hidden={!open} className="mt-3 space-y-4 text-sm leading-relaxed">
        <Block title="이렇게 쓰시면 됩니다" items={g.howTo} tone="plain" />
        <Block title="답해 드리는 것" items={g.answers} tone="ok" />
        {/* 못 하는 일을 숨기지 않는다. 왜 못 하는지까지 적어야 거절이 안내가 된다 */}
        <Block title="답하지 않는 것 (그리고 그 이유)" items={g.declines} tone="limit" />
      </div>
    </section>
  );
}

function Block({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "plain" | "ok" | "limit";
}) {
  return (
    <div>
      <p className="font-medium text-stone-800">{title}</p>
      <ul className="mt-1 space-y-1 text-stone-600">
        {items.map((t) => (
          <li key={t} className="flex gap-2">
            {/* 기호는 뜻을 담는다 — 되는 것과 안 되는 것이 눈으로 갈려야 한다.
                색만으로 구분하지 않는다 (NFR-708) */}
            <span aria-hidden="true" className="shrink-0 text-stone-400">
              {tone === "ok" ? "✓" : tone === "limit" ? "—" : "·"}
            </span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
