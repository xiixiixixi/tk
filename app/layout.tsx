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
  description: "把 TikTok 视频分析成可复刻的脚本资产。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#F5F4F0] text-neutral-900 dark:bg-[#0D0D0D] dark:text-neutral-100">
        <Navbar />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
