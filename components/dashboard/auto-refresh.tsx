"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * 自动刷新 wrapper
 * 包裹在页面外层,每 30s 调 router.refresh() 让服务端重新渲染。
 * 用于首页仪表盘:每次采集后数据自动更新,不需要手动刷新浏览器。
 */
export function AutoRefresh({ intervalMs = 30000, children }: { intervalMs?: number; children: React.ReactNode }) {
  const router = useRouter();

  React.useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return <>{children}</>;
}
