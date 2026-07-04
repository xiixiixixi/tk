"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isValidTikTokUrl } from "@/lib/utils";
import type { TaskType } from "@/types";

/**
 * Editorial 分栏表单 — 左 1/3 文案,右 2/3 表单。
 * 三个 Tab 各自 POST /api/tasks,带不同 task_type。
 * 成功后重置 input + 通过 window 事件通知 task-list 重新拉数据,
 * 错误显示在表单下方红色 alert,10 秒后自动消失。
 */

interface TabConfig {
  value: TaskType;
  label: string;
  placeholder: string;
  buttonLabel: string;
}

const TABS: ReadonlyArray<TabConfig> = [
  {
    value: "analyze_video",
    label: "视频链接",
    placeholder: "https://www.tiktok.com/@user/video/1234567890",
    buttonLabel: "开始分析",
  },
  {
    value: "monitor_creator",
    label: "博主主页",
    placeholder: "https://www.tiktok.com/@username",
    buttonLabel: "加入监控",
  },
  {
    value: "search_keyword",
    label: "关键词搜索",
    placeholder: "例如:护肤测评、好物推荐",
    buttonLabel: "开始搜索",
  },
];

const ERROR_DISMISS_MS = 10_000;

export function SubmitForm() {
  const [activeTab, setActiveTab] = React.useState<TaskType>("analyze_video");
  const [values, setValues] = React.useState<Partial<Record<TaskType, string>>>({
    analyze_video: "",
    monitor_creator: "",
    search_keyword: "",
  });
  const [submitting, setSubmitting] = React.useState<TaskType | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const dismissTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  function showError(message: string) {
    setError(message);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setError(null), ERROR_DISMISS_MS);
  }

  async function handleSubmit(tab: TabConfig) {
    const raw = (values[tab.value] ?? "").trim();
    if (!raw) {
      showError("请输入内容");
      return;
    }
    if (tab.value === "analyze_video" && !isValidTikTokUrl(raw)) {
      showError("请输入合法的 TikTok 视频 URL");
      return;
    }

    setSubmitting(tab.value);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_type: tab.value, input_value: raw }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        task_id?: string;
      };
      if (!res.ok) {
        showError(payload.error ?? "提交失败,请稍后再试");
        return;
      }
      // 成功:重置当前 tab 的 input + 通知 task-list 重新拉取
      setValues((prev) => ({ ...prev, [tab.value]: "" }));
      window.dispatchEvent(new CustomEvent("tasks:changed"));
    } catch (err) {
      showError(err instanceof Error ? err.message : "网络错误,请稍后再试");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="grid gap-10 md:grid-cols-3 md:gap-12">
      {/* 左 1/3 — 文案 */}
      <div className="md:col-span-1">
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-neutral-900 md:text-3xl dark:text-neutral-50">
          开始一次分析
        </h2>
        <p className="mt-3 text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
          粘贴一条 TikTok 视频,或锁定一位博主 / 一个关键词,系统会自动抓取内容、提取字幕、并用 Gemini 拆解出可复刻的脚本结构。
        </p>
      </div>

      {/* 右 2/3 — 表单 */}
      <div className="md:col-span-2">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TaskType)}
          className="w-full"
        >
          <TabsList variant="line" className="mb-6 w-full justify-start">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map((tab) => {
            const isSubmitting = submitting === tab.value;
            const disabled = submitting !== null;
            return (
              <TabsContent key={tab.value} value={tab.value}>
                <form
                  className="flex flex-col gap-3 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSubmit(tab);
                  }}
                >
                  <Input
                    type="text"
                    placeholder={tab.placeholder}
                    value={values[tab.value]}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [tab.value]: e.target.value }))
                    }
                    disabled={disabled}
                    className="h-11 flex-1 text-base"
                    aria-label={tab.label}
                  />
                  <Button
                    type="submit"
                    size="lg"
                    disabled={disabled}
                    className="h-11 min-w-[120px] sm:px-6"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        提交中
                      </>
                    ) : (
                      tab.buttonLabel
                    )}
                  </Button>
                </form>
              </TabsContent>
            );
          })}
        </Tabs>

        {error ? (
          <div
            role="alert"
            className="mt-4  border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 transition-opacity dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
          >
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}