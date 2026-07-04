"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Camera,
  Clock,
  Film,
  Flame,
  Hash,
  Heart,
  Layers,
  Lightbulb,
  Megaphone,
  MessageCircle,
  Package,
  Play,
  Quote,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  User,
  Wand,
  Zap,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Divider, H2, Muted, Numeric, P } from "@/components/ui/typography";
import { cn, formatRelative, formatCount, formatDuration } from "@/lib/utils";
import type {
  AnalysisHook,
  AnalysisOutput,
  ReplicableScript,
  StoryboardSegment,
  SubtitleStructure,
  ViralPoint,
  VisualStructure,
} from "@/types";
import type { AnalysisResultRow, VideoDetail } from "@/lib/pipeline/types";

// ============================================================
// 类型
// ============================================================

interface AnalysisViewProps {
  video: VideoDetail;
  analysis: AnalysisResultRow;
}

// JSONB 字段在 DB 里是 unknown,运行期我们信任 schema 与 Gemini 输出;
// 类型断言成结构化对象方便渲染。
type ParsedAnalysis = Omit<AnalysisResultRow, "video_summary" | "video_type" | "target_audience" | "hook_0_3s" | "storyboard" | "voiceover_script" | "subtitle_structure" | "visual_structure" | "selling_points" | "viral_points" | "replicable_script" | "rewrite_suggestions" | "input_summary"> & {
  video_summary: string | null;
  video_type: string | null;
  target_audience: string | null;
  hook_0_3s: AnalysisHook | null;
  storyboard: StoryboardSegment[] | null;
  voiceover_script: AnalysisOutput["voiceover_script"] | null;
  subtitle_structure: SubtitleStructure | null;
  visual_structure: VisualStructure | null;
  selling_points: AnalysisOutput["selling_points"] | null;
  viral_points: ViralPoint | null;
  replicable_script: ReplicableScript | null;
  rewrite_suggestions: AnalysisOutput["rewrite_suggestions"] | null;
};

function parseAnalysis(row: AnalysisResultRow): ParsedAnalysis {
  return {
    ...row,
    video_summary: row.video_summary,
    video_type: row.video_type,
    target_audience: row.target_audience,
    hook_0_3s: (row.hook_0_3s as AnalysisHook | null) ?? null,
    storyboard: (row.storyboard as StoryboardSegment[] | null) ?? null,
    voiceover_script:
      (row.voiceover_script as AnalysisOutput["voiceover_script"] | null) ??
      null,
    subtitle_structure:
      (row.subtitle_structure as SubtitleStructure | null) ?? null,
    visual_structure:
      (row.visual_structure as VisualStructure | null) ?? null,
    selling_points:
      (row.selling_points as AnalysisOutput["selling_points"] | null) ?? null,
    viral_points: (row.viral_points as ViralPoint | null) ?? null,
    replicable_script:
      (row.replicable_script as ReplicableScript | null) ?? null,
    rewrite_suggestions:
      (row.rewrite_suggestions as AnalysisOutput["rewrite_suggestions"] | null) ??
      null,
  };
}

// ============================================================
// ============================================================
// 区块装饰
// ============================================================

/** 每个区块顶部的序号 + 标题 */
function SectionHeading({
  index,
  label,
  title,
  meta,
}: {
  index: string;
  label: string;
  title: string;
  meta?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex items-end justify-between gap-4">
      <div className="flex items-end gap-5">
        <Numeric className="text-4xl font-semibold text-neutral-300 dark:text-neutral-700 md:text-5xl">
          {index}
        </Numeric>
        <div className="space-y-1">
          <Muted className="font-mono uppercase tracking-[0.18em]">
            {label}
          </Muted>
          <H2 className="text-2xl md:text-3xl">{title}</H2>
        </div>
      </div>
      {meta ? <div className="shrink-0">{meta}</div> : null}
    </header>
  );
}

/** Stagger reveal:每个区块依次淡入(50ms 间隔) */
function RevealSection({
  index,
  children,
  className,
}: {
  index: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      style={{ animationDelay: `${index * 50}ms` }}
      className={cn("editorial-fade-in", className)}
    >
      {children}
    </section>
  );
}

// ============================================================
// Section 01 — 视频信息卡(Header 区域,不是 Card)
// ============================================================

function Section01Header({
  video,
  analysis,
}: {
  video: VideoDetail;
  analysis: ParsedAnalysis;
}) {
  return (
    <RevealSection index={0} className="grid grid-cols-1 gap-8 md:grid-cols-[160px_1fr] md:gap-10">
      {/* 封面 160 × 284 */}
      <div className="relative aspect-[160/284] w-[160px] overflow-hidden  border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900">
        {video.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.cover_url}
            alt={video.title ?? "视频封面"}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-400">
            <Film className="h-8 w-8" />
          </div>
        )}
      </div>

      {/* 右侧文字区 */}
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {analysis.id ? (
            <span className="inline-flex items-center gap-1.5  border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400">
              <Sparkles className="h-3 w-3" />
              分析完成
            </span>
          ) : null}
          {video.duration ? (
            <span className="inline-flex items-center gap-1.5  border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-xs font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-400">
              <Clock className="h-3 w-3" />
              {formatDuration(video.duration)}
            </span>
          ) : null}
          {video.source_type ? (
            <span className="inline-flex items-center gap-1.5  border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-xs font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-400">
              {video.source_type}
            </span>
          ) : null}
        </div>

        {/* 标题 */}
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-neutral-900 md:text-4xl dark:text-neutral-50">
          {video.title ?? "未命名视频"}
        </h1>

        {/* 作者 */}
        {video.author_name ? (
          <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            <span className="inline-flex h-7 w-7 items-center justify-center  bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              <User className="h-3.5 w-3.5" />
            </span>
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              {video.author_name}
            </span>
            {video.publish_time ? (
              <>
                <span className="text-neutral-300 dark:text-neutral-700">·</span>
                <span>{formatRelative(video.publish_time)}</span>
              </>
            ) : null}
          </div>
        ) : null}

        {/* 4 个 numeric(inline grid) */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-neutral-200 pt-5 sm:grid-cols-4 dark:border-neutral-800">
          <MetricCell icon={Play} label="播放" value={formatCount(video.play_count)} />
          <MetricCell icon={Heart} label="点赞" value={formatCount(video.like_count)} />
          <MetricCell icon={MessageCircle} label="评论" value={formatCount(video.comment_count)} />
          <MetricCell icon={Share2} label="分享" value={formatCount(video.share_count)} />
        </div>

        {/* 打开视频链接 */}
        {video.video_file_url ? (
          <div className="pt-1">
            <Link
              href={video.video_file_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-700 underline-offset-4 hover:text-neutral-900 hover:underline dark:text-neutral-300 dark:hover:text-neutral-50"
            >
              打开视频文件
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : null}
      </div>
    </RevealSection>
  );
}

function MetricCell({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <Numeric className="text-xl font-semibold tabular-nums">{value}</Numeric>
    </div>
  );
}

// ============================================================
// Section 02 — 视频基础判断(紫色左侧条 accent bar)
// ============================================================

function Section02Overview({ analysis }: { analysis: ParsedAnalysis }) {
  return (
    <RevealSection index={1}>
      <SectionHeading index="02" label="Overview · 基础判断" title="这条视频讲的是什么" />

      <div className="relative overflow-hidden  border border-neutral-200 bg-white pl-6 pr-6 py-6 dark:border-neutral-800 dark:bg-neutral-950">
        {/* rust 橙左侧条 accent bar */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-1.5 bg-[hsl(var(--color-ikb))] dark:bg-[#E8855A]"
        />

        <dl className="space-y-6">
          {/* video_type chip */}
          {analysis.video_type ? (
            <div className="flex flex-wrap items-baseline gap-3">
              <dt className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
                类型
              </dt>
              <dd>
                <span className="inline-flex items-center  border border-[hsl(var(--color-ikb))]/20 bg-[hsl(var(--color-ikb))]/10 px-3 py-1 text-sm font-semibold text-[hsl(var(--color-ikb))] dark:border-[hsl(var(--color-ikb))]/40 dark:bg-[hsl(var(--color-ikb))]/20 dark:text-[#E8855A]">
                  {analysis.video_type}
                </span>
              </dd>
            </div>
          ) : null}

          {/* target_audience */}
          {analysis.target_audience ? (
            <div className="space-y-1.5">
              <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
                <Target className="h-3 w-3" />
                目标用户
              </dt>
              <dd className="text-base text-neutral-800 dark:text-neutral-200">
                {analysis.target_audience}
              </dd>
            </div>
          ) : null}

          {/* video_summary */}
          {analysis.video_summary ? (
            <div className="space-y-1.5">
              <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
                <Lightbulb className="h-3 w-3" />
                内容概述
              </dt>
              <dd className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                {analysis.video_summary}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </RevealSection>
  );
}

// ============================================================
// Section 03 — 前 3 秒钩子(橙色)
// ============================================================

function Section03Hook({ analysis }: { analysis: ParsedAnalysis }) {
  const hook = analysis.hook_0_3s;
  if (!hook) return null;
  return (
    <RevealSection index={2}>
      <SectionHeading index="03" label="Hook · 前 3 秒" title="留住用户的第一句话" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* 引用块 original */}
        <div className="relative  border border-amber-200 bg-amber-50/60 p-6 dark:border-amber-900/40 dark:bg-amber-950/20">
          <Quote
            aria-hidden
            className="absolute right-4 top-4 h-10 w-10 text-amber-200/70 dark:text-amber-900/40"
          />
          <Muted className="font-mono uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
            Original · 原文
          </Muted>
          <p className="mt-3 text-xl font-medium leading-snug text-neutral-900 md:text-2xl dark:text-neutral-50">
            {hook.original || "—"}
          </p>
          {hook.type ? (
            <div className="mt-5">
              <span className="inline-flex items-center  border border-amber-300 bg-white px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                {hook.type}
              </span>
            </div>
          ) : null}
        </div>

        {/* why_it_works + replicable_template */}
        <div className="space-y-5">
          {hook.why_it_works ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
                <Zap className="h-3 w-3" />
                为什么有效
              </div>
              <P className="text-sm leading-relaxed">{hook.why_it_works}</P>
            </div>
          ) : null}
          {hook.replicable_template ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
                <Wand className="h-3 w-3" />
                可复用模板
              </div>
              <P className="text-sm leading-relaxed">{hook.replicable_template}</P>
            </div>
          ) : null}
        </div>
      </div>
    </RevealSection>
  );
}

// ============================================================
// Section 04 — 分镜结构(表格)
// ============================================================

const SEGMENT_ACCENTS = [
  "before:bg-neutral-900",
  "before:bg-indigo-700",
  "before:bg-amber-600",
  "before:bg-emerald-700",
  "before:bg-rose-700",
  "before:bg-sky-700",
  "before:bg-violet-700",
];

function Section04Storyboard({ analysis }: { analysis: ParsedAnalysis }) {
  const segments = analysis.storyboard ?? [];
  if (segments.length === 0) return null;
  return (
    <RevealSection index={3}>
      <SectionHeading
        index="04"
        label="Storyboard · 分镜"
        title="按时间轴拆解画面"
        meta={
          <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-500">
            <Layers className="h-3 w-3" />
            共 <Numeric className="text-xs">{segments.length}</Numeric> 段
          </span>
        }
      />

      <div className="overflow-hidden  border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[120px]">时间段</TableHead>
              <TableHead>画面</TableHead>
              <TableHead className="w-[180px]">声音</TableHead>
              <TableHead className="w-[180px]">文字</TableHead>
              <TableHead className="w-[180px]">作用</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {segments.map((seg, i) => (
              <TableRow
                key={i}
                className={cn(
                  "relative before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1",
                  SEGMENT_ACCENTS[i % SEGMENT_ACCENTS.length],
                )}
              >
                <TableCell className="align-top font-mono text-xs text-neutral-700 dark:text-neutral-300">
                  {seg.segment}
                </TableCell>
                <TableCell className="align-top">
                  <span className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
                    {seg.visual}
                  </span>
                </TableCell>
                <TableCell className="align-top">
                  <span className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {seg.audio}
                  </span>
                </TableCell>
                <TableCell className="align-top">
                  <span className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {seg.text}
                  </span>
                </TableCell>
                <TableCell className="align-top">
                  <span className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {seg.purpose}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </RevealSection>
  );
}

// ============================================================
// Section 05 — 口播/字幕结构(4 列 grid)
// ============================================================

const SUBTITLE_COLUMNS: Array<{
  key: keyof SubtitleStructure;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  caption: string;
}> = [
  { key: "pain_point", label: "痛点", icon: Target, caption: "Pain Point" },
  { key: "solution", label: "方案", icon: Lightbulb, caption: "Solution" },
  { key: "proof", label: "证明", icon: Trophy, caption: "Proof" },
  { key: "cta", label: "转化", icon: Megaphone, caption: "CTA" },
];

function Section05Subtitle({ analysis }: { analysis: ParsedAnalysis }) {
  const sub = analysis.subtitle_structure;
  if (!sub) return null;
  return (
    <RevealSection index={4}>
      <SectionHeading
        index="05"
        label="Subtitle · 口播"
        title="四段式文案骨架"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SUBTITLE_COLUMNS.map(({ key, label, icon: Icon, caption }) => {
          const value = sub[key];
          if (!value) return null;
          return (
            <div
              key={key}
              className=" border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex h-7 w-7 items-center justify-center  bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <Muted className="font-mono uppercase tracking-[0.18em] text-[10px]">
                  {caption}
                </Muted>
              </div>
              <div className="mt-3 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
                {label}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
                {value}
              </p>
            </div>
          );
        })}
      </div>
    </RevealSection>
  );
}

// ============================================================
// Section 06 — 画面结构(6 grid + icons)
// ============================================================

const VISUAL_FIELDS: Array<{
  key: keyof VisualStructure;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "character", label: "人物", icon: User },
  { key: "product", label: "产品", icon: Package },
  { key: "scene", label: "场景", icon: Camera },
  { key: "camera", label: "镜头", icon: Film },
  { key: "text_overlay", label: "文字", icon: Hash },
  { key: "pace", label: "节奏", icon: TrendingUp },
];

function Section06Visual({ analysis }: { analysis: ParsedAnalysis }) {
  const visual = analysis.visual_structure;
  if (!visual) return null;
  return (
    <RevealSection index={5}>
      <SectionHeading index="06" label="Visual · 画面" title="六个画面维度的拆解" />

      <div className="grid grid-cols-1 gap-px overflow-hidden  border border-neutral-200 bg-neutral-200 sm:grid-cols-2 lg:grid-cols-3 dark:border-neutral-800 dark:bg-neutral-800">
        {VISUAL_FIELDS.map(({ key, label, icon: Icon }) => {
          const value = visual[key];
          if (!value) return null;
          return (
            <div
              key={key}
              className="flex flex-col gap-2 bg-white p-5 dark:bg-neutral-950"
            >
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </div>
              <p className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
                {value}
              </p>
            </div>
          );
        })}
      </div>
    </RevealSection>
  );
}

// ============================================================
// Section 07 — 爆点分析(左右两列)
// ============================================================

const TRIGGER_FIELDS: Array<{
  key: keyof ViralPoint;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "emotional_triggers", label: "情绪触发", icon: Heart },
  { key: "contrast_points", label: "反差点", icon: Layers },
  { key: "visual_highlights", label: "视觉亮点", icon: Sparkles },
];

const SHARE_FIELDS: Array<{
  key: keyof ViralPoint;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "comment_triggers", label: "评论触发", icon: MessageCircle },
  { key: "share_reasons", label: "分享原因", icon: Share2 },
];

function ListCard({
  label,
  icon: Icon,
  items,
  accent,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: string[];
  accent: "rose" | "neutral";
}) {
  return (
    <div className=" border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <Numeric className="text-xs text-neutral-400 dark:text-neutral-600">
          {String(items.length).padStart(2, "0")}
        </Numeric>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
            <span
              aria-hidden
              className={cn(
                "mt-1.5 h-1.5 w-1.5 shrink-0 ",
                accent === "rose"
                  ? "bg-rose-600 dark:bg-rose-400"
                  : "bg-neutral-400 dark:bg-neutral-600",
              )}
            />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section07Viral({ analysis }: { analysis: ParsedAnalysis }) {
  const viral = analysis.viral_points;
  if (!viral) return null;
  return (
    <RevealSection index={6}>
      <SectionHeading
        index="07"
        label="Viral · 爆点"
        title="情绪触发 vs 分享动力"
        meta={
          <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-500">
            <Flame className="h-3 w-3" />
            5 大爆点维度
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 左列:3 个 trigger 列表 */}
        <div className="space-y-4">
          <Muted className="font-mono uppercase tracking-[0.18em]">
            Triggers · 触发点
          </Muted>
          {TRIGGER_FIELDS.map(({ key, label, icon }) => {
            const items = viral[key] ?? [];
            if (items.length === 0) return null;
            return (
              <ListCard
                key={key}
                label={label}
                icon={icon}
                items={items}
                accent="rose"
              />
            );
          })}
        </div>

        {/* 右列:2 个 share 列表 + 1 整合卡 */}
        <div className="space-y-4">
          <Muted className="font-mono uppercase tracking-[0.18em]">
            Share · 分享动力
          </Muted>
          {SHARE_FIELDS.map(({ key, label, icon }) => {
            const items = viral[key] ?? [];
            if (items.length === 0) return null;
            return (
              <ListCard
                key={key}
                label={label}
                icon={icon}
                items={items}
                accent="neutral"
              />
            );
          })}
        </div>
      </div>
    </RevealSection>
  );
}

// ============================================================
// Section 08 — 可复刻脚本(Tabs)
// ============================================================

const TABS: Array<{
  key: keyof ReplicableScript | "shooting_tips";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "title_template", label: "标题模板", icon: Hash },
  { key: "opening", label: "开头", icon: Play },
  { key: "middle", label: "中段", icon: Layers },
  { key: "ending", label: "结尾", icon: Target },
  { key: "shooting_tips", label: "拍摄建议", icon: Camera },
];

function Section08Replicable({ analysis }: { analysis: ParsedAnalysis }) {
  const rep = analysis.replicable_script;
  if (!rep) return null;
  return (
    <RevealSection index={7}>
      <SectionHeading
        index="08"
        label="Replicable · 复刻"
        title="可复用的脚本骨架"
      />

      <Tabs defaultValue="title_template" className="w-full">
        <TabsList className="h-auto w-full justify-start gap-1  border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-800 dark:bg-neutral-900/40">
          {TABS.map(({ key, label, icon: Icon }) => (
            <TabsTrigger
              key={key}
              value={key}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* 标题模板 */}
        <TabsContent value="title_template" className="mt-6">
          <div className=" border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
            <Muted className="font-mono uppercase tracking-[0.18em]">
              Title Template · 标题公式
            </Muted>
            <p className="mt-3 text-base leading-relaxed text-neutral-900 md:text-lg dark:text-neutral-50">
              {rep.title_template || "—"}
            </p>
          </div>
        </TabsContent>

        {/* 开头 */}
        <TabsContent value="opening" className="mt-6">
          <div className=" border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
            <Muted className="font-mono uppercase tracking-[0.18em]">
              Opening · 开头钩子
            </Muted>
            <p className="mt-3 text-base leading-relaxed text-neutral-900 md:text-lg dark:text-neutral-50">
              {rep.opening || "—"}
            </p>
          </div>
        </TabsContent>

        {/* 中段 */}
        <TabsContent value="middle" className="mt-6">
          <div className=" border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
            <Muted className="font-mono uppercase tracking-[0.18em]">
              Middle · 中段结构
            </Muted>
            <p className="mt-3 text-base leading-relaxed text-neutral-900 md:text-lg dark:text-neutral-50">
              {rep.middle || "—"}
            </p>
          </div>
        </TabsContent>

        {/* 结尾 */}
        <TabsContent value="ending" className="mt-6">
          <div className=" border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
            <Muted className="font-mono uppercase tracking-[0.18em]">
              Ending · 结尾转化
            </Muted>
            <p className="mt-3 text-base leading-relaxed text-neutral-900 md:text-lg dark:text-neutral-50">
              {rep.ending || "—"}
            </p>
          </div>
        </TabsContent>

        {/* 拍摄建议 */}
        <TabsContent value="shooting_tips" className="mt-6">
          <div className=" border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
            <Muted className="font-mono uppercase tracking-[0.18em]">
              Shooting Tips · 拍摄清单
            </Muted>
            <ul className="mt-4 space-y-2.5">
              {(rep.shooting_tips ?? []).map((tip, i) => (
                <li
                  key={i}
                  className="flex gap-3 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200"
                >
                  <Numeric className="mt-0.5 shrink-0 text-xs text-neutral-400 dark:text-neutral-600">
                    {String(i + 1).padStart(2, "0")}
                  </Numeric>
                  <span>{tip}</span>
                </li>
              ))}
              {rep.shooting_tips?.length === 0 ? (
                <li className="text-sm text-neutral-500">暂无</li>
              ) : null}
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </RevealSection>
  );
}

// ============================================================
// 主组件
// ============================================================

export function AnalysisView({ video, analysis }: AnalysisViewProps) {
  const parsed = React.useMemo(() => parseAnalysis(analysis), [analysis]);

  return (
    <>
      {/* staggered reveal 用的 keyframes,挂在文档 head */}
      <style>{`
        @keyframes editorial-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .editorial-fade-in {
          opacity: 0;
          animation: editorial-fade-in 0.5s ease-out forwards;
        }
      `}</style>

      <div className="mx-auto max-w-6xl space-y-20 px-6 py-12 md:space-y-24 md:py-16">
        <Section01Header video={video} analysis={parsed} />

        <Divider />

        <Section02Overview analysis={parsed} />
        <Divider />
        <Section03Hook analysis={parsed} />
        <Divider />
        <Section04Storyboard analysis={parsed} />
        <Divider />
        <Section05Subtitle analysis={parsed} />
        <Divider />
        <Section06Visual analysis={parsed} />
        <Divider />
        <Section07Viral analysis={parsed} />
        <Divider />
        <Section08Replicable analysis={parsed} />
      </div>
    </>
  );
}