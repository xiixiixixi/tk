import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/navbar";
import { startScheduler } from "@/lib/scheduler";

startScheduler();

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "脚本分析",
  description: "把 TikTok 视频、博主和话题,自动分析成可复刻的短视频脚本资产。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#fff] text-neutral-900 dark:bg-[#0d0d0d] dark:text-neutral-100">
        <Navbar />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
