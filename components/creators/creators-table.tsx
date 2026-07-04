"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2 } from "lucide-react";

import type { CreatorWithStats } from "@/lib/pipeline/types";
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
import { normalizeCreatorInput } from "@/lib/apify/client";
import { cn } from "@/lib/utils";

/**
 * 博主列表 — 表格形式
 * 每行: @用户名 / 视频数 / 已解析 / 上次采集 / 状态 / 操作(暂停/删除)
 * 点击行 → /videos?author=用户名
 */
export function CreatorsTable({ initialCreators }: { initialCreators: CreatorWithStats[] }) {
  const [creators, setCreators] = React.useState(initialCreators);
  const [input, setInput] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<CreatorWithStats | null>(null);

  async function refetch() {
    const res = await fetch("/api/creators", { cache: "no-store" });
    if (res.ok) {
      const d = await res.json();
      setCreators(d.creators ?? []);
    }
  }

  async function handleAdd() {
    const val = input.trim();
    if (!val) return;
    const normalized = normalizeCreatorInput(val);
    if (!normalized) {
      setError("无法识别,请输入 @username 或 TikTok 主页 URL");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator_url: normalized }),
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
      await fetch(`/api/creators/${id}`, { method: "DELETE" });
      setDeleting(null);
      await refetch();
    } finally {
      setPendingAction(null);
    }
  }

  async function handleToggle(id: string, current: string) {
    setPendingAction(id);
    try {
      await fetch(`/api/creators/${id}`, {
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
      {/* 添加博主 */}
      <div className="flex gap-2">
        <Input
          placeholder="@username 或 TikTok 主页 URL"
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

      {/* 列表 */}
      {creators.length === 0 ? (
        <EmptyState title="还没有添加博主" description="输入 @username 添加博主,系统会自动采集视频。" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr className="text-left text-xs text-zinc-500">
                <th className="px-4 py-2 font-medium">博主</th>
                <th className="px-4 py-2 font-medium text-right">视频数</th>
                <th className="px-4 py-2 font-medium text-right">已解析</th>
                <th className="px-4 py-2 font-medium">上次采集</th>
                <th className="px-4 py-2 font-medium">状态</th>
                <th className="px-4 py-2 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {creators.map(c => {
                const handle = c.creator_name || c.creator_url?.match(/@([\w._-]+)/)?.[1] || c.creator_url?.slice(-20) || "?";
                return (
                  <tr key={c.id} className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/videos?author=${encodeURIComponent(handle)}`}
                        className="font-medium text-zinc-900 hover:text-[#C04A1A] hover:underline dark:text-zinc-100"
                      >
                        @{handle}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                      {c.video_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                      {c.analyzed_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {c.last_fetch_time ? new Date(c.last_fetch_time).toLocaleDateString("zh-CN") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={c.status === "active" ? "default" : "outline"}>
                        {c.status === "active" ? "采集中" : "已暂停"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleToggle(c.id, c.status)}
                          disabled={pendingAction === c.id}
                          className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:text-[#C04A1A] disabled:opacity-50"
                        >
                          {c.status === "active" ? "暂停" : "启用"}
                        </button>
                        <button
                          onClick={() => setDeleting(c)}
                          disabled={pendingAction === c.id}
                          className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 className="inline h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
              取消订阅 @{creatorHandle(deleting)}?
            </DialogTitle>
            <DialogDescription asChild>
              <Muted>
                将删除该博主已采集的 {deleting?.video_count ?? 0} 条视频
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

// 从 CreatorWithStats 抽出显示用的 @handle
function creatorHandle(c: CreatorWithStats | null): string {
  if (!c) return "";
  return (
    c.creator_name ||
    c.creator_url?.match(/@([\w._-]+)/)?.[1] ||
    c.creator_url?.slice(-20) ||
    "?"
  );
}
