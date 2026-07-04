import { DashboardSummary } from "@/components/dashboard/summary";
import { SubmitForm } from "@/components/tasks/submit-form";
import {
  getDashboardStats,
  listVideos,
  type DashboardStats,
} from "@/lib/supabase/queries";
import type { VideoListItem } from "@/lib/pipeline/types";

/**
 * 首页 — 暖橙 Editor / 工作台风格。
 *
 * 结构(从上到下):
 *   1. Hero 标题区(衬线大字 + rust 橙强调)
 *   2. 工作台汇总(5 个统计卡 + 最近采集 8 条)
 *   3. 快速解析单条视频入口(降为次要 — 复用 SubmitForm)
 *
 * 服务端渲染:首页要反映最新数据,关掉所有缓存。
 * 数据库异常降级为空对象,保证首页始终可访问。
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
  // 服务端并行拉取统计 + 最近 8 条视频,失败降级为空,不让首页炸掉
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

      {/* 汇总工作台 */}
      <section className="mt-16">
        <DashboardSummary stats={stats} recentVideos={recentVideos} />
      </section>

      <div className="my-16 h-px bg-zinc-200 dark:bg-zinc-800" />

      {/* 快速解析 — 单条视频链接的次要入口 */}
      <section aria-label="快速解析单条视频">
        <SubmitForm />
      </section>
    </div>
  );
}