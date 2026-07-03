import { Divider, H1, Lead, Muted } from "@/components/ui/typography";
import { SubmitForm } from "@/components/tasks/submit-form";
import { TaskList } from "@/components/tasks/task-list";

/**
 * Editorial / 杂志风首页 — 纯 zinc + generous 留白。
 * Server component,只在子组件 submit-form / task-list 标 "use client"。
 *
 * 视觉节奏:
 *   1. 大字 H1 + Lead(12 视觉单位间距)
 *   2. SubmitForm(左 1/3 文案 + 右 2/3 表单)
 *   3. Divider 分割
 *   4. TaskList(下方)
 */
export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      {/* Hero */}
      <header className="space-y-6">
        <Muted className="font-mono uppercase tracking-[0.18em]">
          TikTok · 脚本拆解 · 工作台
        </Muted>
        <H1 size="lg" className="text-6xl tracking-tighter md:text-7xl">
          TikTok 爆款脚本分析工作台
        </H1>
        <Lead className="max-w-2xl text-lg leading-relaxed md:text-xl">
          把 TikTok 视频、博主和话题,自动分析成可复刻的短视频脚本资产。
        </Lead>
      </header>

      {/* Submit region */}
      <section className="mt-20 md:mt-24">
        <SubmitForm />
      </section>

      <Divider className="my-20 md:my-24" />

      {/* Recent tasks */}
      <section>
        <TaskList />
      </section>
    </div>
  );
}