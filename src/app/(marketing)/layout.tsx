import type { Metadata } from "next";
import "./landing.css";

export const metadata: Metadata = {
  title: "litereview — 替每一篇論文，留下硃批",
  description: "匯入、找重點、比較、辯論——本機優先的個人文獻研究工具。開源 MIT。",
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* 只有商品頁用到這組字體，App Router 下 link 會被 hoist 進 head；規則是 pages router 的告警 */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;600;700;900&family=Noto+Sans+TC:wght@400;500;700&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap"
      />
      {children}
    </>
  );
}
