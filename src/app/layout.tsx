import type { Metadata } from "next";
import { Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";
import "./globals.css";

// 한글 두 벌 — 본문·UI는 고딕, 질문문·회상 본문은 명조. 대비가 설계다.
//
// ⚠ next/font/google의 subsets 목록에 korean이 없다 (cyrillic·latin·latin-ext·vietnamese뿐).
//   "korean"을 넣으면 빌드가 깨지므로 latin만 선언한다. 한글 글리프는 Google이 내려주는
//   unicode-range 청크에 들어 있고, 브라우저가 한글을 만났을 때만 그 청크를 받아 간다.
//   그래서 preload는 끈다 — 켜면 쓰지도 않을 latin 청크를 매 페이지 선반입한다.
//   display: "swap"이라 폰트가 도착하기 전에도 글자는 먼저 보인다 (빈 화면 없음).
//
// 두 폰트 모두 variable을 지원하므로 weight를 열거하지 않는다 — 파일 수가 줄고
// 400·700을 포함한 전 구간을 쓸 수 있다.
const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  preload: false,
  display: "swap",
  variable: "--font-noto-sans-kr",
});

const notoSerifKr = Noto_Serif_KR({
  subsets: ["latin"],
  preload: false,
  display: "swap",
  variable: "--font-noto-serif-kr",
});

export const metadata: Metadata = {
  title: "남기다",
  description:
    "남기려는 마음을 대화로 정리하고, 법이 인정하는 방식으로만 서명하는 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // 변수만 얹는다 — 기본 글꼴 지정은 globals.css의 @theme가 한다.
    // (여기서 font-sans를 직접 걸면 화면이 font-serif로 고르는 자리를 덮는다)
    <html lang="ko" className={`${notoSansKr.variable} ${notoSerifKr.variable}`}>
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        {children}
      </body>
    </html>
  );
}
