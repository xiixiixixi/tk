"use client";

import * as React from "react";
import { Loader2, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export interface CrawlConfig {
  max_age_months: number;
  exclude_slideshow: boolean;
  max_duration_sec: number;
  min_like_count: number;
  min_comment_count: number;
  min_play_count: number;
  min_share_count: number;
  min_collect_count: number;
}

const DEFAULTS: CrawlConfig = {
  max_age_months: 3,
  exclude_slideshow: true,
  max_duration_sec: 60,
  min_like_count: 0,
  min_comment_count: 0,
  min_play_count: 10000,
  min_share_count: 0,
  min_collect_count: 0,
};

const inputCls = "h-9 border-b-2 border-neutral-300 bg-transparent px-0 text-sm transition-colors placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:focus:border-neutral-100";

export function CrawlConfigForm({ scope }: { scope: "creator" | "keyword" }) {
  const [config, setConfig] = React.useState<CrawlConfig>(DEFAULTS);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/crawl-config?scope=${scope}`)
      .then(r => r.json())
      .then(d => { if (d.config) setConfig(d.config); })
      .finally(() => setLoading(false));
  }, [scope]);

  function update<K extends keyof CrawlConfig>(key: K, val: CrawlConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: val }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/crawl-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, ...config }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-zinc-500">加载配置中…</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4 text-[#C04A1A]" />
          全局采集配置
        </CardTitle>
        <CardDescription>
          统一控制所有{scope === "creator" ? "博主" : "关键词"}的采集条件。超出时间范围的历史视频将在每天 0 点自动清理。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs text-zinc-500">视频时间范围</span>
            <select
              value={config.max_age_months}
              onChange={e => update("max_age_months", Number(e.target.value))}
              className={inputCls + " w-full"}
            >
              <option value={1}>近 1 个月</option>
              <option value={2}>近 2 个月</option>
              <option value={3}>近 3 个月</option>
              <option value={6}>近 6 个月</option>
              <option value={12}>近 12 个月</option>
              <option value={9999}>不限</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-500">时长上限(秒)</span>
            <Input type="number" value={config.max_duration_sec} onChange={e => update("max_duration_sec", Number(e.target.value))} className="h-9" />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-500">最低播放</span>
            <Input type="number" value={config.min_play_count} onChange={e => update("min_play_count", Number(e.target.value))} className="h-9" />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-500">最低点赞</span>
            <Input type="number" value={config.min_like_count} onChange={e => update("min_like_count", Number(e.target.value))} className="h-9" />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-500">最低评论</span>
            <Input type="number" value={config.min_comment_count} onChange={e => update("min_comment_count", Number(e.target.value))} className="h-9" />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-500">最低分享</span>
            <Input type="number" value={config.min_share_count} onChange={e => update("min_share_count", Number(e.target.value))} className="h-9" />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-500">最低收藏</span>
            <Input type="number" value={config.min_collect_count} onChange={e => update("min_collect_count", Number(e.target.value))} className="h-9" />
          </label>

          <label className="flex items-end gap-2 pb-1.5">
            <input
              type="checkbox"
              checked={config.exclude_slideshow}
              onChange={e => update("exclude_slideshow", e.target.checked)}
              className="h-4 w-4 accent-[#C04A1A]"
            />
            <span className="text-xs text-zinc-600">只爬视频(排除图文)</span>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving} size="sm" className="bg-[#C04A1A] text-white hover:bg-[#A93D15]">
            {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            保存配置
          </Button>
          {saved && <span className="text-xs text-emerald-600">✓ 已保存</span>}
        </div>
      </CardContent>
    </Card>
  );
}
