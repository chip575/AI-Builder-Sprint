// 도움말 — 이 자리가 무엇을 하는 곳인지 (NFR-705 · NFR-708)
//
// ⚠ 소유: 화면은 FE 경로다. BE-2가 사람 승인 하에 **새 파일로만** 추가 — 병합 전 FE 리뷰.
//
// 처음 오신 분은 "마음 유언"·"서류 이력"·"약속" 같은 말이 무엇을 가리키는지 모른다.
// 본문에 설명을 길게 붙이면 매번 읽는 사람에게 소음이 되므로 **묻는 사람에게만** 보인다.
//
// ⚠ 기본은 닫힘이다. 열어 두면 화면이 설명으로 뒤덮이고 정작 할 일이 뒤로 밀린다.
// ⚠ `title` 속성(브라우저 툴팁)을 쓰지 않는다 — 터치 기기에서 안 뜨고, 화면 낭독기가
//   읽는 방식이 브라우저마다 다르다. 눌러서 펴는 버튼이 어디서나 같게 동작한다.
// ⚠ 설명은 **제목 줄 바깥**에 편다. 버튼 옆에 두면 좁은 칸에 눌려 못 읽는다.
"use client";

import { useId, useState } from "react";

/** 제목 + 물음표. 설명은 제목 줄 아래에 한 폭으로 펴진다 */
export function SectionHeading({
  title,
  help,
  as = "h2",
}: {
  title: string;
  help: React.ReactNode;
  /** 화면의 제목 층위에 맞춘다 — 낭독기가 목차를 만들 때 순서가 어긋나지 않게 */
  as?: "h2" | "h3";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const Tag = as;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Tag
          className={
            as === "h2"
              ? "font-serif text-lg font-semibold text-stone-900"
              : "text-stone-900"
          }
        >
          {title}
        </Tag>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          aria-label={`${title} 설명`}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-stone-300 text-xs text-stone-500 transition hover:border-stone-500 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
        >
          ?
        </button>
      </div>

      {/* 닫혀 있어도 DOM에 남긴다 — 버튼의 aria-controls가 가리킬 대상이 있어야 한다 */}
      <div
        id={id}
        hidden={!open}
        className="mt-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm leading-relaxed text-stone-600"
      >
        {help}
      </div>
    </div>
  );
}
