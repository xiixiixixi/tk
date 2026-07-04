"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2 } from "lucide-react";

import type { KeywordWithStats } from "@/lib/pipeline/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Muted } from "@/components/ui/typography";

/**
 * 关键词列表 — 表格形式(同博主逻辑)
 * 每行: 关键词 / 视频数 / 上次采集 / 操作(删除)
 * 点击行 → /videos?sourceType=keyword_search&sourceValue=关键词
 */
export function KeywordsTable({ initialKeywords }: { initialKeywords: KeywordWithStats[] }) {
  const [keywords, setKeywords] = React.useState(initialKeywords);
  const [input, setInput] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<KeywordWithStats | null>(null);

  async function refetch() {
    const res = await fetch("/api/keywords", { cache: "no-store" });
    if (res.ok) {
      const d = await res.json();
      setKeywords(d.keywords ?? []);
    }
  }

  async function handleAdd() {
    const val = input.trim();
    if (!val) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: val }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "添加失败");
      }
      setInput("");
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "添加失败");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    const id = deleting.id;
    setPendingDelete(id);
    try {
      await fetch(`/api/keywords/${id}`, { method: "DELETE" });
      setDeleting(null);
      await refetch();
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="输入关键词"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
          disabled={adding}
          className="h-9 flex-1"
        />
        <Button onClick={handleAdd} disabled={adding || !input.trim()} size="sm" className="bg-[#C04A1A] text-white hover:bg-[#A93D15]">
          {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          添加
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {keywords.length === 0 ? (
        <EmptyState title="还没有添加关键词" description="输入关键词,系统会自动采集相关视频。" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr className="text-left text-xs text-zinc-500">
                <th className="px-4 py-2 font-medium">关键词</th>
                <th className="px-4 py-2 font-medium text-right">视频数</th>
                <th className="px-4 py-2 font-medium">上次采集</th>
                <th className="px-4 py-2 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {keywords.map(k => (
                <tr key={k.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/videos?sourceType=keyword_search&sourceValue=${encodeURIComponent(k.keyword)}`}
                      className="font-medium text-zinc-900 hover:text-[#C04A1A] hover:underline dark:text-zinc-100"
                    >
                      {k.keyword}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                    {k.video_count ?? 0}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {k.last_fetch_time ? new Date(k.last_fetch_time).toLocaleDateString("zh-CN") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setDeleting(k)}
                      disabled={pendingDelete === k.id}
                      className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="inline h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 删除确认弹窗 */}
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (pendingDelete) return;
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-xl font-semibold tracking-tight">
              取消订阅关键词「{deleting?.keyword ?? ""}」?
            </DialogTitle>
            <DialogDescription asChild>
              <Muted>
                将删除该关键词相关的 {deleting?.video_count ?? 0} 条视频
                {deleting && deleting.analyzed_count > 0
                  ? `(其中 ${deleting.analyzed_count} 条已分析)`
                  : ""}
                。不可撤销。
              </Muted>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2 gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={!!pendingDelete}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={!!pendingDelete}
              className="min-w-[96px] bg-red-600 text-white hover:bg-red-700"
            >
              {pendingDelete ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
