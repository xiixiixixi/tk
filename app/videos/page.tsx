import { H1, Lead, Muted } from "@/components/ui/typography";
import { QuickParse } from "@/components/videos/quick-parse";
import { VideoTable } from "@/components/videos/video-table";
import { listVideos } from "@/lib/supabase/queries";

/**
 * 视频库 — Editorial 杂志风格:
 *   - 大标题 + 留白 + 表格紧贴下方
 *   - 服务端 fetch 首屏数据(避免空白闪烁)
 *   - 客户端组件 VideoTable 接管筛选 / 分页 / 轮询
 *
 * 视觉节奏:
 *   1. H1 "视频库" + Lead 一句话定位
 *   2. 12 单位间距
 *   3. VideoTable(inline 渲染 toolbar + 表格 + 分页)
 */

export const dynamic = "force-dynamic"; // 每次请求都拉新数据,确保新增视频立即可见

const PAGE_SIZE = 20;

export default async function VideosPage() {
  const { videos, total } = await listVideos({ page: 1, pageSize: PAGE_SIZE });

  return (
    <div className="mx-auto max-w-7xl px-6 py-12 md:py-16">
      <header className="space-y-5">
        <Muted className="font-mono uppercase tracking-[0.18em]">
          Library · 视频档案
        </Muted>
        <H1 size="lg" className="text-5xl tracking-tighter md:text-6xl">
          视频库
        </H1>
        <Lead className="max-w-2xl text-lg leading-relaxed md:text-xl">
          所有已分析的 TikTok 视频,按时间倒序。
        </Lead>
      </header>

      {/* 单条解析:粘贴 TikTok URL 立即提交一个 analyze_video 任务 */}
      <QuickParse className="mt-10 md:mt-12" />

      <section className="mt-8 md:mt-10">
        <VideoTable
          initialVideos={videos}
          initialTotal={total}
          pageSize={PAGE_SIZE}
        />
      </section>
    </div>
  );
}
