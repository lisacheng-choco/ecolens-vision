import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EcoLens 大阪垃圾分類 POC",
  description: "拍下物品，取得大阪市家戶垃圾的繁體中文分類步驟。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
