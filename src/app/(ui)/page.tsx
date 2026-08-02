// 진입 화면 — 서류 작성실(/write)이 메인이다 (2026-08-02 팀 피벗).
// 회상 대화(/chat)는 보조 문으로 남는다 — 지우지 않는다, 마음 유언 축은 그대로다.
//
// FR-110 주의: 여기서 금지된 것은 **진입 시 트랙·카테고리 선택**이다.
// 이 화면은 여전히 문이 하나(작성실)이고, 문서 선택은 /write 안에서 일어난다 —
// 그 선택이 FR-110과 긴장 관계라는 점은 PM 검토 대상으로 남긴다 (PR #5).
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6">
      {/* 이 화면은 Shell을 쓰지 않으므로 제목 명조가 자동으로 오지 않는다 — 직접 건다 */}
      <h1 className="text-center font-serif text-3xl font-semibold leading-relaxed">
        남기실 것들, 여기서 돌봅니다
      </h1>
      {/* 정체성은 관리다 — 자산은 시간이 지나며 바뀌고, 남긴 뜻은 때가 되면 되짚는다.
          서류 작성은 그 관리 중에 일어나는 행위라 대문이 아니라 안쪽 문이다 (2026-08-02) */}
      <p className="text-center font-serif text-stone-500">
        자산과 남기신 뜻을 시간이 지나도 관리합니다. 서명은 법이 인정하는
        방식으로만 합니다.
      </p>
      <Link
        href="/estate"
        className="rounded-full bg-stone-900 px-8 py-3 text-stone-50 transition hover:bg-stone-700"
      >
        내 유산 정리 시작하기
      </Link>
      <div className="flex flex-col items-center gap-2">
        <Link
          href="/write"
          className="text-sm text-stone-600 underline underline-offset-4 hover:text-stone-800"
        >
          바로 약정서를 준비할래요
        </Link>
        <Link
          href="/chat"
          className="text-sm text-stone-500 underline underline-offset-4 hover:text-stone-700"
        >
          마음 이야기를 먼저 하고 싶어요
        </Link>
      </div>
      <p className="text-sm text-stone-400">
        언제든 멈출 수 있고, 저장된 곳부터 다시 이어집니다.
      </p>
      {/* FR-110이 금지한 것은 **진입 시 트랙·카테고리 선택**이다. 이건 사용자 여정의
          선택지가 아니라 다른 역할(P4 기관 담당자)의 입구라 그 범주가 아니다. */}
      <Link
        href="/org"
        className="mt-4 text-sm text-stone-400 underline underline-offset-4 hover:text-stone-600"
      >
        기관 담당자이신가요?
      </Link>
    </main>
  );
}
