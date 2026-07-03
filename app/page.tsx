import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <div className="space-y-6 text-center sm:text-left">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          TikTok 爆款脚本分析工作台
        </h1>
        <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
          把 TikTok 视频、博主和话题,自动分析成可复刻的短视频脚本资产。
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            开始分析 →
          </Link>
          <Link
            href="/videos"
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            查看视频库
          </Link>
        </div>
      </div>

      <div className="mt-16 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">📦 当前阶段</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <strong>Phase 1:项目初始化</strong>(进行中)— Next.js 骨架、shadcn/ui、全局布局、类型定义。
        </p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          跟着 Phase 1 完成后:API、Pipeline、前端页面、博主监控、关键词搜索。
        </p>
      </div>
    </div>
  );
}
