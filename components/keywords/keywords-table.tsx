"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2 } from "lucide-react";

import type { KeywordWithStats } from "@/lib/pipeline/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

/**
 * 关键词列表 — 表格形式(与博主列表一致)
 * 每行: 关键词 / 视频数 / 已解析 / 上次采集 / 状态 / 操作(暂停/删除)
 * 点击关键词 → /keywords/[id] 详情页
 */
export function KeywordsTable({ initialKeywords }: { initialKeywords: KeywordWithStats[] }) {
  const [keywords, setKeywords] = React.useState(initialKeywords);
  const [input, setInput] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
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
    setPendingAction(id);
    try {
      await fetch(`/api/keywords/${id}`, { method: "DELETE" });
      setDeleting(null);
      await refetch();
    } finally {
      setPendingAction(null);
    }
  }

  async function handleToggle(id: string, current: string) {
    setPendingAction(id);
    try {
      await fetch(`/api/keywords/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: current === "active" ? "paused" : "active" }),
      });
      await refetch();
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* 添加关键词 */}
      <div className="flex gap-2">
        <Input
          placeholder="输入关键词"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
          disabled={adding}
          className="h-9 flex-1"
        />
        <Button onClick={handleAdd} disabled={adding || !input.trim()} size="sm" className="bg-[hsl(var(--color-ikb))] text-white hover:bg-[hsl(var(--color-ikb))]">
          {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          添加
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* 列表 */}
      {keywords.length === 0 ? (
        <EmptyState title="还没有添加关键词" description="输入关键词,系统会自动采集相关视频。" />
      ) : (
        <div className="overflow-hidden  border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900">
              <tr className="text-left text-xs text-neutral-500">
                <th className="px-4 py-2 font-medium">关键词</th>
                <th className="px-4 py-2 font-medium text-right">视频数</th>
                <th className="px-4 py-2 font-medium text-right">已解析</th>
                <th className="px-4 py-2 font-medium">上次采集</th>
                <th className="px-4 py-2 font-medium">状态</th>
                <th className="px-4 py-2 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {keywords.map(k => (
                <tr key={k.id} className="group hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/keywords/${k.id}`}
                      className="font-medium text-neutral-900 hover:text-[hsl(var(--color-ikb))] hover:underline dark:text-neutral-100"
                    >
                      {k.keyword}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-neutral-700 dark:text-neutral-300">
                    {k.video_count ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-neutral-700 dark:text-neutral-300">
                    {k.analyzed_count ?? 0}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {k.last_fetch_time ? new Date(k.last_fetch_time).toLocaleDateString("zh-CN") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={k.status === "active" ? "default" : "outline"}>
                      {k.status === "active" ? "采集中" : "已暂停"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => handleToggle(k.id, k.status)}
                        disabled={pendingAction === k.id}
                        className="rounded px-2 py-0.5 text-xs text-neutral-500 hover:text-[hsl(var(--color-ikb))] disabled:opacity-50"
                      >
                        {k.status === "active" ? "暂停" : "启用"}
                      </button>
                      <button
                        onClick={() => setDeleting(k)}
                        disabled={pendingAction === k.id}
                        className="rounded px-2 py-0.5 text-xs text-neutral-500 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="inline h-3 w-3" />
                      </button>
                    </div>
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
          if (pendingAction) return;
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
                将删除该关键词已采集的 {deleting?.video_count ?? 0} 条视频
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
              disabled={!!pendingAction}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={!!pendingAction}
              className="min-w-[96px] bg-red-600 text-white hover:bg-red-700"
            >
              {pendingAction ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
