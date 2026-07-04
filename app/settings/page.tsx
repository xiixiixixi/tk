import { H1, Lead, Muted } from "@/components/ui/typography";
import { SettingsForm } from "@/components/settings/settings-form";
import { getSettingsSnapshot } from "@/app/api/settings/route";

/**
 * 设置页 — Editorial 杂志风 + 服务端数据
 *
 *   - 不 fetch 自己(避免 SSR 阶段多绕一道 HTTP),直接 import getSettingsSnapshot()
 *   - compact 布局:max-w-5xl(比其他页窄,适合设置类表单密度)
 *   - SettingsForm 全权负责交互:展开 / 触发 / 测试 URL
 *
 * 安全:服务端拿到的数据已是 masked 后的(present + suffix),传到客户端 component
 *   时已经满足"不暴露完整 key"的硬约束。
 */

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let settings;
  try {
    settings = await getSettingsSnapshot();
  } catch (err) {
    console.error("[settings/page] getSettingsSnapshot failed:", err);
    // DB 查不到/失败时的安全兜底 — mocks & env 仍然可读(它们是 process.env)
    settings = {
      env: {
        OPENROUTER_API_KEY: { present: false },
        APIFY_API_KEY: { present: false },
        R2_ACCESS_KEY_ID: { present: false },
        R2_SECRET_ACCESS_KEY: { present: false },
      },
      mocks: { MOCK_APIFY: false, MOCK_GEMINI: false },
      db: { tableCount: 0 },
      schedules: [],
      pipeline: { batchSize: 3, concurrency: 2 },
    };
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 md:py-16">
      <header className="space-y-5">
        <Muted className="font-mono uppercase tracking-[0.18em]">
          Settings · 系统配置
        </Muted>
        <H1 size="lg" className="text-5xl tracking-tighter md:text-6xl">
          设置
        </H1>
        <Lead className="max-w-2xl text-lg leading-relaxed md:text-xl">
          查看 API Key 配置状态、Mock 模式开关、数据库可用性,并手动触发 cron 抓取。
          完整密钥永远不离开服务端。
        </Lead>
      </header>

      <section className="mt-12 md:mt-16">
        <SettingsForm initialSettings={settings} />
      </section>
    </div>
  );
}
