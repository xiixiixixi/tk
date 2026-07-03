import { EmptyState } from "@/components/ui/empty-state";
import { H1, Lead, Muted } from "@/components/ui/typography";
import { Settings } from "lucide-react";

/**
 * Phase 5 占位 — 设置页
 */
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <header className="space-y-3">
        <Muted className="font-mono uppercase tracking-[0.18em]">Phase 5 · 即将推出</Muted>
        <H1 size="lg" className="text-5xl tracking-tighter">
          设置
        </H1>
        <Lead className="max-w-2xl">
          查看 API Key 配置状态、Mock 模式开关、R2 桶连接测试、手动触发抓取。
        </Lead>
      </header>

      <EmptyState
        icon={<Settings className="h-8 w-8 text-zinc-400" />}
        title="设置页开发中"
        description="Phase 5 收尾阶段会上线完整的 Mock 状态查看、手动触发、配置诊断。"
      />
    </div>
  );
}
