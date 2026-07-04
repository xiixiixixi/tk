"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AnalysisResultRow, VideoDetail } from "@/lib/pipeline/types";
import type {
  AnalysisHook,
  StoryboardSegment,
  ViralPoint,
  ReplicableScript,
  SubtitleStructure,
  VisualStructure,
} from "@/types";

/**
 * Markdown 导出按钮
 *
 * 把视频分析结果(8 区块)导出成 .md 文件,客户端生成 + 下载,不走服务端。
 */
interface ExportMarkdownProps {
  video: VideoDetail;
  analysis: AnalysisResultRow | null;
}

export function ExportMarkdown({ video, analysis }: ExportMarkdownProps) {
  const [exporting, setExporting] = React.useState(false);

  function handleExport() {
    setExporting(true);
    try {
      const md = buildMarkdown(video, analysis);
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(video.title || "video").slice(0, 40).replace(/[^\w\u4e00-\u9fa5]/g, "_")}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  if (!analysis) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={exporting}
      className="gap-1.5"
    >
      {exporting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      导出 Markdown
    </Button>
  );
}

function buildMarkdown(video: VideoDetail, a: AnalysisResultRow | null): string {
  const lines: string[] = [];
  const safe = (v: unknown): string => (v == null ? "" : String(v));

  // 标题
  lines.push(`# ${video.title || "未命名视频"}`);
  lines.push("");

  // 视频基础信息
  lines.push("## 视频基础信息");
  lines.push(`- **作者**: ${safe(video.author_name)}`);
  lines.push(`- **发布时间**: ${safe(video.publish_time)}`);
  lines.push(`- **时长**: ${safe(video.duration)} 秒`);
  lines.push(`- **播放量**: ${safe(video.play_count)}`);
  lines.push(`- **点赞**: ${safe(video.like_count)}`);
  lines.push(`- **评论**: ${safe(video.comment_count)}`);
  lines.push(`- **分享**: ${safe(video.share_count)}`);
  lines.push(`- **收藏**: ${safe(video.collect_count)}`);
  if (video.hashtags && video.hashtags.length > 0) {
    lines.push(`- **标签**: ${video.hashtags.map((h) => "#" + h).join(" ")}`);
  }
  if (video.canonical_url) {
    lines.push(`- **链接**: ${safe(video.canonical_url)}`);
  }
  lines.push("");

  if (!a) {
    lines.push("> 暂无分析结果");
    return lines.join("\n");
  }

  // 1. 视频基础判断
  lines.push("## 1. 视频基础判断");
  lines.push(`- **类型**: ${safe(a.video_type)}`);
  lines.push(`- **目标用户**: ${safe(a.target_audience)}`);
  lines.push(`- **内容概述**: ${safe(a.video_summary)}`);
  lines.push("");

  // 2. 前 3 秒钩子
  const hook = a.hook_0_3s as AnalysisHook | null;
  if (hook) {
    lines.push("## 2. 前 3 秒钩子");
    lines.push(`- **原文**: ${safe(hook.original)}`);
    lines.push(`- **类型**: ${safe(hook.type)}`);
    lines.push(`- **为什么有效**: ${safe(hook.why_it_works)}`);
    lines.push(`- **可复用模板**: ${safe(hook.replicable_template)}`);
    lines.push("");
  }

  // 3. 分镜结构
  const storyboard = a.storyboard as StoryboardSegment[] | null;
  if (storyboard && storyboard.length > 0) {
    lines.push("## 3. 分镜结构");
    lines.push("| 时间段 | 画面 | 声音 | 文字 | 作用 |");
    lines.push("|--------|------|------|------|------|");
    storyboard.forEach((s) => {
      lines.push(
        `| ${safe(s.segment)} | ${safe(s.visual)} | ${safe(s.audio)} | ${safe(s.text)} | ${safe(s.purpose)} |`
      );
    });
    lines.push("");
  }

  // 4. 口播/字幕结构
  const subtitle = a.subtitle_structure as SubtitleStructure | null;
  if (subtitle) {
    lines.push("## 4. 口播/字幕结构");
    lines.push(`- **痛点**: ${safe(subtitle.pain_point)}`);
    lines.push(`- **方案**: ${safe(subtitle.solution)}`);
    lines.push(`- **证明**: ${safe(subtitle.proof)}`);
    lines.push(`- **转化**: ${safe(subtitle.cta)}`);
    lines.push("");
  }

  // 5. 画面结构
  const visual = a.visual_structure as VisualStructure | null;
  if (visual) {
    lines.push("## 5. 画面结构");
    lines.push(`- **人物**: ${safe(visual.character)}`);
    lines.push(`- **产品**: ${safe(visual.product)}`);
    lines.push(`- **场景**: ${safe(visual.scene)}`);
    lines.push(`- **镜头**: ${safe(visual.camera)}`);
    lines.push(`- **文字**: ${safe(visual.text_overlay)}`);
    lines.push(`- **节奏**: ${safe(visual.pace)}`);
    lines.push("");
  }

  // 6. 爆点分析
  const viral = a.viral_points as ViralPoint | null;
  if (viral) {
    lines.push("## 6. 爆点分析");
    if (viral.emotional_triggers?.length) {
      lines.push(`- **情绪触发**: ${viral.emotional_triggers.join("、")}`);
    }
    if (viral.contrast_points?.length) {
      lines.push(`- **反差点**: ${viral.contrast_points.join("、")}`);
    }
    if (viral.visual_highlights?.length) {
      lines.push(`- **视觉亮点**: ${viral.visual_highlights.join("、")}`);
    }
    if (viral.comment_triggers?.length) {
      lines.push(`- **评论触发**: ${viral.comment_triggers.join("、")}`);
    }
    if (viral.share_reasons?.length) {
      lines.push(`- **分享原因**: ${viral.share_reasons.join("、")}`);
    }
    lines.push("");
  }

  // 7. 可复刻脚本
  const rep = a.replicable_script as ReplicableScript | null;
  if (rep) {
    lines.push("## 7. 可复刻脚本");
    lines.push(`- **标题模板**: ${safe(rep.title_template)}`);
    lines.push(`- **开头**: ${safe(rep.opening)}`);
    lines.push(`- **中段**: ${safe(rep.middle)}`);
    lines.push(`- **结尾**: ${safe(rep.ending)}`);
    if (rep.shooting_tips?.length) {
      lines.push(`- **拍摄建议**:`);
      rep.shooting_tips.forEach((t) => lines.push(`  - ${t}`));
    }
    lines.push("");
  }

  // 8. 改写方向
  const rewrite = a.rewrite_suggestions as
    | { suitable_industries?: string[]; suitable_products?: string[]; difficulty?: string; reusability?: string; notes?: string }
    | null;
  if (rewrite) {
    lines.push("## 8. 改写方向");
    if (rewrite.suitable_industries?.length) {
      lines.push(`- **适合行业**: ${rewrite.suitable_industries.join("、")}`);
    }
    if (rewrite.suitable_products?.length) {
      lines.push(`- **适合产品**: ${rewrite.suitable_products.join("、")}`);
    }
    lines.push(`- **复刻难度**: ${safe(rewrite.difficulty)}`);
    lines.push(`- **可复用程度**: ${safe(rewrite.reusability)}`);
    lines.push(`- **备注**: ${safe(rewrite.notes)}`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`> 由 TikTok 爆款脚本分析工作台生成 · ${new Date().toISOString().slice(0, 10)}`);

  return lines.join("\n");
}
