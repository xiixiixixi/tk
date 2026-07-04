"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isValidTikTokUrl } from "@/lib/utils";

/**
 * 设置表单 — 从 server page 接收初始 settings 数据,
 * 负责所有交互(展开 / 测试 URL)。
 *
 * 安全:完整 secret key 不在这里出现,只展示 boolean + 末 4 位。
 */

interface SecretStatus {
  present: boolean;
  suffix?: string;
}

interface ScheduleInfo {
  jobId: string;
  label: string;
  configKey: string;
  intervalMinutes: number;
  description: string;
}

interface PipelineConfig {
  batchSize: number;
  concurrency: number;
}

interface SettingsSnapshot {
  env: Record<string, SecretStatus>;
  mocks: { MOCK_APIFY: boolean; MOCK_GEMINI: boolean };
  db: { tableCount: number };
  schedules: ScheduleInfo[];
  pipeline: PipelineConfig;
}

interface SettingsFormProps {
  initialSettings: SettingsSnapshot;
}

const SECRETS: ReadonlyArray<{
  key: string;
  label: string;
  hint: string;
}> = [
  { key: "OPENROUTER_API_KEY", label: "OpenRouter", hint: "统一 AI 网关,调 Gemini(画面+音频+文本)" },
  { key: "APIFY_API_KEY", label: "Apify", hint: "TikTok 元数据抓取" },
  { key: "R2_ACCESS_KEY_ID", label: "R2 Access Key", hint: "Cloudflare R2 写入权限" },
  { key: "R2_SECRET_ACCESS_KEY", label: "R2 Secret Key", hint: "同 Access Key 对应的密钥" },
];


interface PostTaskResponse {
  task_id?: string;
  error?: string;
}

// 调度间隔可选值(分钟)
const INTERVAL_OPTIONS = [
  { value: 1, label: "1 分钟" },
  { value: 5, label: "5 分钟" },
  { value: 15, label: "15 分钟" },
  { value: 30, label: "30 分钟" },
  { value: 60, label: "1 小时" },
  { value: 120, label: "2 小时" },
  { value: 360, label: "6 小时" },
  { value: 720, label: "12 小时" },
  { value: 1440, label: "24 小时" },
  { value: 2880, label: "48 小时" },
];

const CONCURRENCY_OPTIONS = [1, 2, 3, 5, 8, 10];
const BATCH_OPTIONS = [1, 3, 5, 10, 15, 20];

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小时`;
  return `${Math.round(minutes / 1440)} 天`;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [envOpen, setEnvOpen] = React.useState(false);

  // ---- 调度状态 ----
  const [schedules, setSchedules] = React.useState(initialSettings.schedules);
  const [pipeline, setPipeline] = React.useState(initialSettings.pipeline);
  const [scheduleSaving, setScheduleSaving] = React.useState(false);
  const [scheduleMsg, setScheduleMsg] = React.useState<string | null>(null);
  const [scheduleErr, setScheduleErr] = React.useState<string | null>(null);

  // init 变化时同步(如页面刷新)
  React.useEffect(() => {
    setSchedules(initialSettings.schedules);
    setPipeline(initialSettings.pipeline);
  }, [initialSettings.schedules, initialSettings.pipeline]);

  // ---- 测试提交 ----
  const [testUrl, setTestUrl] = React.useState("");
  const [testSubmitting, setTestSubmitting] = React.useState(false);
  const [testMessage, setTestMessage] = React.useState<string | null>(null);
  const [testError, setTestError] = React.useState<string | null>(null);

  async function submitTestUrl(e: React.FormEvent) {
    e.preventDefault();
    setTestMessage(null);
    setTestError(null);
    const url = testUrl.trim();
    if (!url) {
      setTestError("请粘贴一条 TikTok 视频链接");
      return;
    }
    if (!isValidTikTokUrl(url)) {
      setTestError("URL 格式不合法,请用 https://www.tiktok.com/@... 形式");
      return;
    }
    setTestSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_type: "analyze_video", input_value: url }),
      });
      const data = (await res.json().catch(() => ({}))) as PostTaskResponse;
      if (!res.ok || !data.task_id) {
        setTestError(data.error ?? "提交失败");
        return;
      }
      setTestMessage(
        `已创建任务 (id: ${data.task_id.slice(0, 8)}…),前往首页查看进度`,
      );
      setTestUrl("");
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setTestSubmitting(false);
    }
  }

  const presentCount = Object.values(initialSettings.env).filter((s) => s.present).length;

  // ---- 保存调度间隔 ----
  async function saveSchedule(configKey: string, intervalMinutes: number) {
    setScheduleMsg(null);
    setScheduleErr(null);
    setScheduleSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updateSchedules: { [configKey]: intervalMinutes } }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      setSchedules((prev) =>
        prev.map((s) =>
          s.configKey === configKey ? { ...s, intervalMinutes } : s
        )
      );
      setScheduleMsg("已保存,5 分钟内生效");
      setTimeout(() => setScheduleMsg(null), 3000);
    } catch (err) {
      setScheduleErr(err instanceof Error ? err.message : "保存失败");
      setTimeout(() => setScheduleErr(null), 5000);
    } finally {
      setScheduleSaving(false);
    }
  }

  // ---- 保存 Pipeline 并发配置 ----
  async function savePipeline(update: { batchSize?: number; concurrency?: number }) {
    setScheduleMsg(null);
    setScheduleErr(null);
    setScheduleSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updatePipeline: update }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      setPipeline((prev) => ({ ...prev, ...update }));
      setScheduleMsg("已保存");
      setTimeout(() => setScheduleMsg(null), 3000);
    } catch (err) {
      setScheduleErr(err instanceof Error ? err.message : "保存失败");
      setTimeout(() => setScheduleErr(null), 5000);
    } finally {
      setScheduleSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ============== 1. API Key 配置状态 ============== */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">API Key 配置</CardTitle>
            <CardDescription>
              已配置 {presentCount} / {SECRETS.length} 项。完整密钥永远不会发回前端。
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEnvOpen((v) => !v)}
            aria-expanded={envOpen}
          >
            {envOpen ? "收起" : "展开"}
          </Button>
        </CardHeader>
        {envOpen ? (
          <CardContent className="pt-0">
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {SECRETS.map((s) => {
                const status = initialSettings.env[s.key] ?? { present: false };
                return (
                  <li
                    key={s.key}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{s.label}</div>
                      <div className="mt-0.5 font-mono text-xs text-neutral-500 dark:text-neutral-400">
                        {s.key}
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        {s.hint}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {status.present ? (
                        <Badge variant="default" className="font-mono">
                          {status.suffix}
                        </Badge>
                      ) : (
                        <Badge variant="outline">未配置</Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        ) : null}
      </Card>

      {/* ============== 2. Mock 模式状态(read-only) ============== */}
      <Card>
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-base">Mock 模式</CardTitle>
          <CardDescription>
            当前生效的 Mock 开关(由 .env.local 决定,运行时无法修改)。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 pt-0">
          <MockField label="MOCK_APIFY" value={initialSettings.mocks.MOCK_APIFY} />
          <MockField label="MOCK_GEMINI" value={initialSettings.mocks.MOCK_GEMINI} />
        </CardContent>
      </Card>

      {/* ============== 3. 定时调度(可编辑) ============== */}
      <Card>
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-base">定时调度</CardTitle>
          <CardDescription>
            修改后即时保存,调度器每 5 分钟自动重载配置。所有时间单位为分钟。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {schedules.map((s) => (
            <div
              key={s.configKey}
              className="flex items-center justify-between gap-3  border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{s.label}</div>
                <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {s.description}
                </div>
              </div>
              <select
                className="h-9  border border-neutral-200 bg-white px-2.5 text-sm font-mono tabular-nums dark:border-neutral-700 dark:bg-neutral-900"
                value={s.intervalMinutes}
                disabled={scheduleSaving}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (Number.isFinite(v)) saveSchedule(s.configKey, v);
                }}
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {scheduleMsg ? (
            <div className=" border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400">
              {scheduleMsg}
            </div>
          ) : null}
          {scheduleErr ? (
            <div className=" border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {scheduleErr}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ============== 3.5 Pipeline 并发设置 ============== */}
      <Card>
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-base">Pipeline 并发</CardTitle>
          <CardDescription>
            每次 process 取多少视频(批量),以及同时处理几个(并发)。增大可加速积压清理,但会同时占用更多 API 调用。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
          <div className="flex items-center justify-between  border border-neutral-200 p-3 dark:border-neutral-800">
            <div>
              <div className="text-sm font-medium">批量大小</div>
              <div className="text-xs text-neutral-500">每次取 N 个待处理视频</div>
            </div>
            <select
              className="h-9  border border-neutral-200 bg-white px-2.5 text-sm font-mono dark:border-neutral-700 dark:bg-neutral-900"
              value={pipeline.batchSize}
              disabled={scheduleSaving}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) savePipeline({ batchSize: v });
              }}
            >
              {BATCH_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between  border border-neutral-200 p-3 dark:border-neutral-800">
            <div>
              <div className="text-sm font-medium">并发数</div>
              <div className="text-xs text-neutral-500">同时处理几个视频</div>
            </div>
            <select
              className="h-9  border border-neutral-200 bg-white px-2.5 text-sm font-mono dark:border-neutral-700 dark:bg-neutral-900"
              value={pipeline.concurrency}
              disabled={scheduleSaving}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) savePipeline({ concurrency: v });
              }}
            >
              {CONCURRENCY_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* ============== 4. 测试粘贴 TikTok URL ============== */}
      <Card>
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-base">测试提交</CardTitle>
          <CardDescription>
            粘贴一条 TikTok 视频链接,创建一条 analyze_video 任务。
            Pipeline 会从 HTTP 调用链的第一站开始自动推进。
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={submitTestUrl}>
            <Input
              type="text"
              placeholder="https://www.tiktok.com/@user/video/1234567890"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              disabled={testSubmitting}
              className="h-11 flex-1 text-base"
              aria-label="TikTok URL"
            />
            <Button
              type="submit"
              size="lg"
              disabled={testSubmitting}
              className="h-11 min-w-[120px]"
            >
              {testSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  提交中
                </>
              ) : (
                "创建任务"
              )}
            </Button>
          </form>
          {testMessage ? (
            <div className="mt-3  border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400">
              {testMessage}
            </div>
          ) : null}
          {testError ? (
            <div className="mt-3  border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {testError}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function MockField({ label, value }: { label: string; value: boolean }) {
  const on = label === "MOCK_GEMINI" ? value : value;
  return (
    <div className="flex items-center justify-between  border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
      <span className="font-mono text-xs">{label}</span>
      <Badge variant={on ? "default" : "outline"}>{on ? "ON" : "OFF"}</Badge>
    </div>
  );
}
