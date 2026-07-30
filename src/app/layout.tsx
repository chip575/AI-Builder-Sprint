import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "남기다",
  description:
    "남기려는 마음을 대화로 정리하고, 법이 인정하는 방식으로만 서명하는 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        {children}
      </body>
    </html>
  );
}
