import { EmptyState } from "@/components/ui/empty-state";
import { H1, Lead, Muted } from "@/components/ui/typography";
import { Search } from "lucide-react";

/**
 * Phase 4 占位 — 关键词搜索页
 */
export default function KeywordsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <header className="space-y-3">
        <Muted className="font-mono uppercase tracking-[0.18em]">Phase 4 · 即将推出</Muted>
        <H1 size="lg" className="text-5xl tracking-tighter">
          关键词分析
        </H1>
        <Lead className="max-w-2xl">
          添加 TikTok 搜索关键词,系统会定期抓取 TikTok 搜索结果并批量分析,提炼话题脚本模板。
        </Lead>
      </header>

      <EmptyState
        icon={<Search className="h-8 w-8 text-zinc-400" />}
        title="关键词分析功能开发中"
        description="Phase 4 阶段会上线关键词添加、搜索结果列表、话题脚本模板提炼功能。"
      />
    </div>
  );
}
