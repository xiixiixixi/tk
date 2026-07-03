import { EmptyState } from "@/components/ui/empty-state";
import { H1, Lead, Muted } from "@/components/ui/typography";
import { Users2 } from "lucide-react";

/**
 * Phase 4 占位 — 博主监控页
 * Editorial 风:大标题 + Lead + EmptyState 居中,避免 404
 */
export default function CreatorsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <header className="space-y-3">
        <Muted className="font-mono uppercase tracking-[0.18em]">Phase 4 · 即将推出</Muted>
        <H1 size="lg" className="text-5xl tracking-tighter">
          博主监控
        </H1>
        <Lead className="max-w-2xl">
          添加 TikTok 博主主页,系统会定期抓取该博主的新视频并自动分析。
        </Lead>
      </header>

      <EmptyState
        icon={<Users2 className="h-8 w-8 text-zinc-400" />}
        title="博主监控功能开发中"
        description="Phase 4 阶段会上线完整的博主监控列表、添加对话框、手动触发抓取按钮。"
      />
    </div>
  );
}
