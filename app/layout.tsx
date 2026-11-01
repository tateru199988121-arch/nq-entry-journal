import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NQ 交易紀律日誌",
  description: "記錄進場 SOP、當下情緒與出場後的交易心得。",
  robots: { index: false, follow: false, nocache: true },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
