"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn, isValidTikTokUrl } from "@/lib/utils";

interface PostTaskResponse { task_id?: string; error?: string; }

export function QuickParse({ className }: { className?: string }) {
  const [url, setUrl] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setMsg(null); setErr(null);
    const t = url.trim();
    if (!t) { setErr("请粘贴 TikTok 链接"); return; }
    if (!isValidTikTokUrl(t)) { setErr("URL 格式不合法"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task_type: "analyze_video", input_value: t }) });
      const d = await res.json().catch(() => ({})) as PostTaskResponse;
      if (!res.ok || !d.task_id) { setErr(d.error ?? "提交失败"); return; }
      setMsg("已提交");
      setUrl("");
    } catch (ex) { setErr(ex instanceof Error ? ex.message : "网络错误"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className={cn(className)}>
      <form className="flex gap-3" onSubmit={handleSubmit}>
        <input
          type="text" value={url} onChange={e => setUrl(e.target.value)}
          disabled={submitting}
          placeholder="粘贴 TikTok 链接，回车解析"
          className="h-10 flex-1 border-b-2 border-neutral-300 bg-transparent px-0 text-sm placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none disabled:opacity-30 dark:border-neutral-700 dark:placeholder:text-neutral-500 dark:focus:border-neutral-100"
        />
        <button
          type="submit" disabled={submitting || !url.trim()}
          className="inline-flex h-10 items-center gap-2 bg-neutral-900 px-5 text-xs font-bold uppercase tracking-wider text-neutral-50 transition-colors hover:bg-neutral-800 disabled:opacity-30 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          解析
        </button>
      </form>
      {msg && <p className="mt-2 text-xs text-neutral-500">{msg}</p>}
      {err && <p className="mt-2 text-xs text-[hsl(var(--color-ikb))] font-medium">{err}</p>}
    </div>
  );
}
