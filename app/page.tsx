import { SubmitForm } from "@/components/tasks/submit-form";
import { TaskList } from "@/components/tasks/task-list";

/**
 * 首页 — 暖橙 Editor
 * 衬线大标题(其中一个词 rust 橙强调)+ 提交表单 + 最近任务
 */
export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
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
          粘贴一条 TikTok 视频链接,AI 自动抓取画面、字幕、口播,拆解出钩子、分镜、爆点,
          生成你能直接复用的脚本结构。
        </p>
      </header>

      {/* 提交区 */}
      <section className="mt-16">
        <SubmitForm />
      </section>

      <div className="my-16 h-px bg-zinc-200 dark:bg-zinc-800" />

      {/* 最近任务 */}
      <section>
        <TaskList />
      </section>
    </div>
  );
}
