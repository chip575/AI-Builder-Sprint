// 진입 화면 — 트랙·카테고리 선택 UI는 존재하지 않는다 (FR-110 수락 기준).
// 진입은 한 문장이다. 실제 대화 화면은 M-SESSION-MSG(chat/SessionView)에서 연결된다.
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6">
      <h1 className="text-center text-3xl font-semibold leading-relaxed">
        무엇을 남기고 싶으세요?
      </h1>
      <p className="text-center text-stone-500">
        떠오르는 대로 이야기해 주세요. 정리는 저희가 돕겠습니다.
      </p>
      <Link
        href="/chat"
        className="rounded-full bg-stone-900 px-8 py-3 text-stone-50 transition hover:bg-stone-700"
      >
        이야기 시작하기
      </Link>
      <p className="text-sm text-stone-400">
        언제든 멈출 수 있고, 저장된 곳부터 다시 이어집니다.
      </p>
    </main>
  );
}
