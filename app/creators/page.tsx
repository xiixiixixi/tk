import { H1, Lead, Muted } from "@/components/ui/typography";
import { CreatorsList } from "@/components/creators/creator-card";
import { listCreators } from "@/lib/supabase/queries";
import type { CreatorRow } from "@/lib/pipeline/types";

/**
 * 博主监控页 — Editorial / 杂志风 + 服务端数据
 *
 *   - H1 + Lead(12 视觉单位间距)
 *   - 服务端 listCreators() 拉首屏数据,避免空白闪烁
 *   - CreatorsList 客户端组件接管:toolbar / 状态筛选 / 添加 dialog / 删除 / 立即抓取
 *
 * 视觉节奏:
 *   1. 大字 H1 + Lead 一句话定位
 *   2. CreatorsList(inline 渲染 toolbar + grid + EmptyState + 添加 dialog)
 *
 * 数据流:
 *   server listCreators() → <CreatorsList initialCreators={creators} />
 *   → 客户端监听 monitors:changed → refetch(GET /api/creators)
 */

export const dynamic = "force-dynamic"; // 每次请求都拉新数据,新增博主立即可见

export default async function CreatorsPage() {
  let creators: CreatorRow[] = [];
  try {
    creators = await listCreators();
  } catch (err) {
    // 数据查询失败时,仍展示空列表 + EmptyState,避免整个页面崩溃
    console.error("[creators/page] listCreators 失败", err);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-12 md:py-16">
      <header className="space-y-5">
        <Muted className="font-mono uppercase tracking-[0.18em]">
          Monitors · 博主监控
        </Muted>
        <H1 size="lg" className="text-5xl tracking-tighter md:text-6xl">
          博主监控
        </H1>
        <Lead className="max-w-2xl text-lg leading-relaxed md:text-xl">
          添加 TikTok 博主主页,系统会定期抓取新视频并自动分析,沉淀为可复刻的脚本资产。
        </Lead>
      </header>

      <section className="mt-12 md:mt-16">
        <CreatorsList initialCreators={creators} />
      </section>
    </div>
  );
}