"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";

import { cn, isValidTikTokUrl } from "@/lib/utils";

/**
 * 视频库顶部「单条解析」输入框
 *
 *   粘贴一条 TikTok 视频 URL → POST /api/tasks { task_type: 'analyze_video', input_value: url }
 *   成功后只显示「已提交解析」提示,不跳转(VideoTable 的轮询会自动把新视频带出来)。
 *
 *   走 rust 橙 #C04A1A 品牌色按钮,与暖橙 Editor 设计系统一致。
 */

interface PostTaskResponse {
  task_id?: string;
  error?: string;
}

export function QuickParse({ className }: { className?: string }) {
  const [url, setUrl] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError("请粘贴一条 TikTok 视频链接");
      return;
    }
    if (!isValidTikTokUrl(trimmed)) {
      setError("URL 格式不合法,请用 https://www.tiktok.com/@... 形式");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_type: "analyze_video", input_value: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as PostTaskResponse;
      if (!res.ok || !data.task_id) {
        setError(data.error ?? "提交失败,请稍后再试");
        return;
      }
      setMessage("已提交解析,完成后会自动出现在列表中");
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <form className="flex flex-col gap-2.5 sm:flex-row" onSubmit={handleSubmit}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={submitting}
          placeholder="粘贴 TikTok 视频 URL 解析"
          aria-label="TikTok 视频 URL"
          className={cn(
            "h-10 flex-1 rounded-md border border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 transition-colors",
            "placeholder:text-zinc-400",
            "focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-600 dark:focus:ring-zinc-800"
          )}
        />
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold text-white shadow-sm transition-colors",
            "bg-[#C04A1A] hover:bg-[#C04A1A]/90",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "dark:bg-[#C04A1A] dark:hover:bg-[#C04A1A]/90"
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              提交中
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              解析
            </>
          )}
        </button>
      </form>

      {message ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
