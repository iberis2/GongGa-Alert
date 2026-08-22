import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "입주대기자 수 알리미",
  description: "마이홈 청약 공고의 입주대기자 수 변경을 기록하고 알립니다."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
