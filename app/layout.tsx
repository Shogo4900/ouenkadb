import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "応援歌DB",
  description: "NPB 応援歌データベース",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
