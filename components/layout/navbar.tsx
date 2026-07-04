"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 顶部导航 — 暖橙 Editor 风格
 * rust 橙 logo 块 + 衬线品牌名 + 当前页橙色高亮
 */
const NAV_ITEMS = [
  { href: "/", label: "首页" },
  { href: "/videos", label: "视频库" },
  { href: "/creators", label: "博主" },
  { href: "/keywords", label: "关键词" },
  { href: "/settings", label: "设置" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-[#FAF8F5]/85 backdrop-blur-md dark:border-zinc-800/70 dark:bg-[#1A1715]/85">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        {/* Logo + 品牌 */}
        <Link href="/" className="flex items-center gap-2.5">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-[#C04A1A] font-serif text-sm font-bold text-white">
            T
          </span>
          <span className="font-serif text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            脚本分析
          </span>
        </Link>

        {/* 导航 */}
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "rounded-md px-3 py-1.5 text-sm font-medium text-[#C04A1A]"
                    : "rounded-md px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
