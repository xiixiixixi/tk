"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/videos", label: "视频库" },
  { href: "/creators", label: "博主" },
  { href: "/keywords", label: "关键词" },
  { href: "/settings", label: "设置" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/80 backdrop-blur-sm dark:border-neutral-800 dark:bg-[#0d0d0d]/80">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-6">
        <Link href="/videos" className="text-sm font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
          脚本分析
        </Link>

        <nav className="flex items-center gap-4">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/videos"
                ? pathname === "/videos"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "text-xs font-medium text-neutral-900 dark:text-neutral-100"
                    : "text-xs text-neutral-400 transition-colors hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300"
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
