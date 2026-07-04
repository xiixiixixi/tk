import { DashboardSummary } from "@/components/dashboard/summary";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import {
  getDashboardStats,
  listVideos,
  type DashboardStats,
} from "@/lib/supabase/queries";
import type { VideoListItem } from "@/lib/pipeline/types";

/**
 * 首页 — 工作台仪表盘
 *
 * 移除了 SubmitForm(三 Tab 提交)——单条解析移到视频库顶部,
 * 首页聚焦"汇总 + 最近活动"。
 *
 * DashboardSummary 客户端组件自带 30s 自动刷新轮询,每次采集后数据自动更新。
 */
export const dynamic = "force-dynamic";

const EMPTY_STATS: DashboardStats = {
  creator_count: 0,
  keyword_count: 0,
  video_total: 0,
  new_today: 0,
  pending_analysis: 0,
};

export default async function Home() {
  const [statsResult, recentResult] = await Promise.allSettled([
    getDashboardStats(),
    listVideos({ page: 1, pageSize: 8 }),
  ]);

  const stats = statsResult.status === "fulfilled" ? statsResult.value : EMPTY_STATS;
  const recentVideos: VideoListItem[] =
    recentResult.status === "fulfilled" ? recentResult.value.videos : [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
      {/* Hero */}
      <header className="space-y-5">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#C04A1A]">
          TikTok · 脚本拆解 · 工作台
        </p>
        <h1 className="font-serif text-5xl font-bold leading-[1.1] tracking-tight text-zinc-900 sm:text-6xl dark:text-zinc-50">
          把爆款视频,
          <br />
          <span className="text-[#C04A1A]">拆成可复刻的脚本</span>
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          订阅博主与关键词,系统自动抓取画面、字幕、口播,后台用 Gemini 拆解出钩子、分镜、爆点,
          生成你能直接复用的脚本结构。
        </p>
      </header>

      {/* 汇总工作台(30s 自动刷新,每次采集后数据自动更新) */}
      <section className="mt-16">
        <AutoRefresh intervalMs={30000}>
          <DashboardSummary stats={stats} recentVideos={recentVideos} />
        </AutoRefresh>
      </section>
    </div>
  );
}
