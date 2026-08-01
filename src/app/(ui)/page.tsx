// 진입 화면 — 트랙·카테고리 선택 UI는 존재하지 않는다 (FR-110 수락 기준).
// 진입은 한 문장이다. 실제 대화 화면은 M-SESSION-MSG(chat/SessionView)에서 연결된다.
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6">
      {/* 이 화면은 Shell을 쓰지 않으므로 제목 명조가 자동으로 오지 않는다 — 직접 건다.
          서비스가 건네는 말(제목·부제)만 명조고, 아래 버튼·안내문은 고딕 그대로다 */}
      <h1 className="text-center font-serif text-3xl font-semibold leading-relaxed">
        무엇을 남기고 싶으신가요
      </h1>
      <p className="text-center font-serif text-stone-500">
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
      {/* FR-110이 금지한 것은 **진입 시 트랙·카테고리 선택**이다. 이건 사용자 여정의
          선택지가 아니라 다른 역할(P4 기관 담당자)의 입구라 그 범주가 아니다.
          "운영 화면"이 아니라 역할을 묻는 문구를 쓴다 — P2 시니어 사용자가
          "나한테 하는 말이 아니구나"를 즉시 알고 지나갈 수 있어야 한다 */}
      <Link
        href="/org"
        className="mt-4 text-sm text-stone-400 underline underline-offset-4 hover:text-stone-600"
      >
        기관 담당자이신가요?
      </Link>
    </main>
  );
}
