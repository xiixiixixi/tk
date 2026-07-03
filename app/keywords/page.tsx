import { H1, Lead, Muted } from "@/components/ui/typography";
import { KeywordsList } from "@/components/keywords/keyword-card";
import { listKeywords } from "@/lib/supabase/queries";
import type { KeywordRow } from "@/lib/pipeline/types";

/**
 * 关键词监控页 — Editorial / 杂志风 + 服务端数据
 *
 *   - H1 + Lead(12 视觉单位间距)
 *   - 服务端 listKeywords() 拉首屏数据,避免空白闪烁
 *   - KeywordsList 客户端组件接管:toolbar / 状态筛选 / 添加 dialog / 删除 / 立即搜索
 *
 * 视觉节奏:
 *   1. 大字 H1 + Lead 一句话定位
 *   2. KeywordsList(inline 渲染 toolbar + grid + EmptyState + 添加 dialog)
 *
 * 数据流:
 *   server listKeywords() → <KeywordsList initialKeywords={keywords} />
 *   → 客户端监听 monitors:changed → refetch(GET /api/keywords)
 */

export const dynamic = "force-dynamic"; // 每次请求都拉新数据,新增关键词立即可见

export default async function KeywordsPage() {
  let keywords: KeywordRow[] = [];
  try {
    keywords = await listKeywords();
  } catch (err) {
    // 数据查询失败时,仍展示空列表 + EmptyState,避免整个页面崩溃
    console.error("[keywords/page] listKeywords 失败", err);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-12 md:py-16">
      <header className="space-y-5">
        <Muted className="font-mono uppercase tracking-[0.18em]">
          Monitors · 关键词监控
        </Muted>
        <H1 size="lg" className="text-5xl tracking-tighter md:text-6xl">
          关键词监控
        </H1>
        <Lead className="max-w-2xl text-lg leading-relaxed md:text-xl">
          添加 TikTok 搜索关键词,系统会定期抓取搜索结果并自动分析,提炼可复刻的话题脚本模板。
        </Lead>
      </header>

      <section className="mt-12 md:mt-16">
        <KeywordsList initialKeywords={keywords} />
      </section>
    </div>
  );
}