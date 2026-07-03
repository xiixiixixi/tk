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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isValidTikTokUrl } from "@/lib/utils";

/**
 * 设置表单 — 从 server page 接收初始 settings 数据,
 * 负责所有交互(展开 / 触发 / 测试 URL)。
 *
 * 安全:完整 secret key 不在这里出现,只展示 boolean + 末 4 位。
 */

interface SecretStatus {
  present: boolean;
  suffix?: string;
}

interface SettingsSnapshot {
  env: Record<string, SecretStatus>;
  mocks: { MOCK_APIFY: boolean; MOCK_GEMINI: boolean };
  db: { tableCount: number };
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

type TriggerAction =
  | "process"
  | "refresh-metrics"
  | "monitor-creators"
  | "search-keywords";

interface TriggerInfo {
  action: TriggerAction;
  label: string;
  description: string;
}

const TRIGGERS: ReadonlyArray<TriggerInfo> = [
  {
    action: "process",
    label: "推进 Pipeline",
    description:
      "立刻调一次 /api/cron/process,把队列里下一个待处理视频向前推一步。链路仍由 HTTP 调用链自动接力。",
  },
  {
    action: "refresh-metrics",
    label: "刷新互动数据",
    description:
      "重新抓取所有 completed 视频的播放/点赞/评论数(暂为 stub,Apify refresh 未实现)。",
  },
  {
    action: "monitor-creators",
    label: "监控博主",
    description: "抓取所有 active 博主的新视频,新视频入 videos 表后会由 Pipeline 自动分析。",
  },
  {
    action: "search-keywords",
    label: "搜索关键词",
    description: "对每个 active 关键词跑一次 TikTok 搜索,新视频入 videos 表后由 Pipeline 自动分析。",
  },
];

interface TriggerResponse {
  action: TriggerAction;
  result: {
    error?: string;
    processed?: number;
    reason?: string;
    triggered?: boolean;
    message?: string;
  } | null;
}

interface PostTaskResponse {
  task_id?: string;
  error?: string;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [envOpen, setEnvOpen] = React.useState(false);
  const [pendingTrigger, setPendingTrigger] = React.useState<TriggerInfo | null>(null);
  const [triggering, setTriggering] = React.useState<TriggerAction | null>(null);
  const [lastResults, setLastResults] = React.useState<Record<TriggerAction, TriggerResponse | null>>({
    process: null,
    "refresh-metrics": null,
    "monitor-creators": null,
    "search-keywords": null,
  });

  const [testUrl, setTestUrl] = React.useState("");
  const [testSubmitting, setTestSubmitting] = React.useState(false);
  const [testMessage, setTestMessage] = React.useState<string | null>(null);
  const [testError, setTestError] = React.useState<string | null>(null);

  async function runTrigger(info: TriggerInfo) {
    setTriggering(info.action);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerCron: info.action }),
      });
      const data = (await res.json().catch(() => null)) as TriggerResponse | null;
      setLastResults((prev) => ({ ...prev, [info.action]: data }));
    } catch (err) {
      setLastResults((prev) => ({
        ...prev,
        [info.action]: {
          action: info.action,
          result: { error: err instanceof Error ? err.message : String(err) },
        },
      }));
    } finally {
      setTriggering(null);
      setPendingTrigger(null);
    }
  }

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
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {SECRETS.map((s) => {
                const status = initialSettings.env[s.key] ?? { present: false };
                return (
                  <li
                    key={s.key}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{s.label}</div>
                      <div className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                        {s.key}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
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

      {/* ============== 3. 手动触发 ============== */}
      <Card>
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-base">手动触发</CardTitle>
          <CardDescription>
            Vercel Hobby 不支持 Cron,这几个按钮用来手动推进 / 抓取。每个调用都会先弹确认。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0 sm:grid-cols-2">
          {TRIGGERS.map((t) => {
            const last = lastResults[t.action];
            const isPending = triggering === t.action;
            return (
              <div
                key={t.action}
                className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {t.description}
                  </div>
                  {last?.result?.error ? (
                    <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {last.result.error}
                    </div>
                  ) : last?.result?.triggered ? (
                    <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                      {last.result.message ?? "已触发,后台正在处理"}
                    </div>
                  ) : last?.result ? (
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      返回: processed={last.result.processed ?? "—"}
                      {last.result.reason ? `, reason=${last.result.reason}` : ""}
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={triggering !== null}
                  onClick={() => setPendingTrigger(t)}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      触发
                    </>
                  ) : (
                    "触发"
                  )}
                </Button>
              </div>
            );
          })}
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
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400">
              {testMessage}
            </div>
          ) : null}
          {testError ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {testError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ============== 确认 dialog ============== */}
      <Dialog
        open={pendingTrigger !== null}
        onOpenChange={(open) => {
          if (!open && triggering === null) setPendingTrigger(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认触发「{pendingTrigger?.label}」?</DialogTitle>
            <DialogDescription>{pendingTrigger?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingTrigger(null)}
              disabled={triggering !== null}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (pendingTrigger) void runTrigger(pendingTrigger);
              }}
              disabled={triggering !== null || pendingTrigger === null}
            >
              {triggering ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  触发中
                </>
              ) : (
                "确认触发"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MockField({ label, value }: { label: string; value: boolean }) {
  const on = label === "MOCK_GEMINI" ? value : value;
  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
      <span className="font-mono text-xs">{label}</span>
      <Badge variant={on ? "default" : "outline"}>{on ? "ON" : "OFF"}</Badge>
    </div>
  );
}
