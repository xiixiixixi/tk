"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn, isValidTikTokUrl } from "@/lib/utils";

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
    if (!trimmed) { setError("请粘贴 TikTok 视频链接"); return; }
    if (!isValidTikTokUrl(trimmed)) { setError("URL 格式不合法"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_type: "analyze_video", input_value: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as PostTaskResponse;
      if (!res.ok || !data.task_id) { setError(data.error ?? "提交失败"); return; }
      setMessage("已提交");
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={cn(className)}>
      <form className="flex gap-2" onSubmit={handleSubmit}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={submitting}
          placeholder="粘贴 TikTok 链接,回车解析"
          className={cn(
            "h-9 flex-1 border-b border-neutral-200 bg-transparent px-0 text-sm outline-none transition-colors",
            "placeholder:text-neutral-300",
            "focus:border-neutral-900",
            "disabled:opacity-40",
            "dark:border-neutral-800 dark:placeholder:text-neutral-600 dark:focus:border-neutral-100"
          )}
        />
        <button
          type="submit"
          disabled={submitting || !url.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3.5 text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-30 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          解析
        </button>
      </form>
      {message && <p className="mt-1.5 text-xs text-neutral-500">{message}</p>}
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  );
}
