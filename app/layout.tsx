import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EcoLens",
  description: "Taiwan and Japan waste sorting demo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
