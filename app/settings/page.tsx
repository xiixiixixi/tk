import { SettingsForm } from "@/components/settings/settings-form";
import { getSettingsSnapshot } from "@/app/api/settings/route";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let settings;
  try {
    settings = await getSettingsSnapshot();
  } catch {
    settings = {
      env: { OPENROUTER_API_KEY: { present: false }, APIFY_API_KEY: { present: false }, R2_ACCESS_KEY_ID: { present: false }, R2_SECRET_ACCESS_KEY: { present: false } },
      mocks: { MOCK_APIFY: false, MOCK_GEMINI: false },
      db: { tableCount: 0 },
      schedules: [],
      pipeline: { batchSize: 3, concurrency: 2 },
    };
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-10">
        <h1 className="text-sm font-medium tracking-tight text-neutral-900 dark:text-neutral-100">设置</h1>
        <p className="mt-1 text-xs text-neutral-400">API 配置 · 调度频率 · 并发控制</p>
      </div>
      <SettingsForm initialSettings={settings} />
    </div>
  );
}
