/**
 * Gemini Prompt 构造(tech.md §8.2 完整 JSON schema)
 * 不依赖 Gemini SDK,直接拼字符串
 */

export const ANALYSIS_JSON_SCHEMA = {
  video_summary: "100字以内的视频内容概述",
  video_type: "教程类/测评类/Vlog类/挑战类/剧情类/口播类/混剪类/其他",
  target_audience: "目标用户画像",
  hook_0_3s: {
    original: "前 3 秒内容/画面/台词",
    type: "疑问式/感叹式/反常识/视觉冲击/痛点直击/数据展示/其他",
    why_it_works: "为什么能留住用户",
    replicable_template: "可复用的钩子模板",
  },
  storyboard: [
    {
      segment: "0-3 秒",
      visual: "画面内容描述",
      audio: "声音内容",
      text: "屏幕文字",
      purpose: "这段的作用",
    },
  ],
  voiceover_script: {
    full_text: "完整口播文本",
    structure: {
      hook: "钩子部分",
      pain_point: "痛点描述",
      solution: "解决方案",
      proof: "证明/展示",
      cta: "转化话术",
    },
  },
  subtitle_structure: {
    pain_point: "痛点文案",
    solution: "解决方案文案",
    proof: "证明文案",
    cta: "转化文案",
  },
  visual_structure: {
    character: "人物设定",
    product: "产品展示方式",
    scene: "场景描述",
    camera: "镜头运用",
    text_overlay: "画面文字风格",
    pace: "节奏特点",
  },
  selling_points: [
    { point: "卖点描述", how_presented: "呈现方式", effectiveness: "高/中/低" },
  ],
  viral_points: {
    emotional_triggers: ["情绪触发点"],
    contrast_points: ["反差点"],
    visual_highlights: ["视觉亮点"],
    comment_triggers: ["激发评论的点"],
    share_reasons: ["分享原因"],
  },
  replicable_script: {
    title_template: "标题模板",
    opening: "开头模板",
    middle: "中段结构模板",
    ending: "结尾模板",
    shooting_tips: ["拍摄建议"],
  },
  rewrite_suggestions: {
    suitable_industries: ["适合行业"],
    suitable_products: ["适合产品"],
    difficulty: "低/中/高",
    reusability: "低/中/高",
    notes: "备注",
  },
} as const;

export const SYSTEM_PROMPT = [
  "你是一位资深的 TikTok 短视频脚本分析师。",
  "任务:根据给定的视频数据,生成一份详细的脚本拆解报告。",
  "输出格式:严格的 JSON,不要任何额外的解释文字。",
  "分析要点:",
  "1. 基于提供的旁白文本和视频内容分析",
  "2. 判断视频类型、目标用户、核心卖点",
  "3. 重点分析前 3 秒钩子设计",
  "4. 拆解分镜结构(按时间轴)",
  "5. 分析口播/字幕结构",
  "6. 识别爆点元素",
  "7. 生成可复刻脚本模板",
  "8. 给出改写建议",
].join("\n");

export interface AnalysisInput {
  title: string;
  description: string;
  authorName: string;
  publishTime: string;
  duration: number;
  playCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  collectCount: number;
  hashtags: string[];
  subtitleText: string;
}

export function buildAnalysisPrompt(input: AnalysisInput): string {
  return [
    "请分析以下 TikTok 视频:",
    "",
    "=== 视频基本信息 ===",
    `标题:${input.title}`,
    `描述:${input.description}`,
    `作者:${input.authorName}`,
    `发布时间:${input.publishTime}`,
    `视频时长:${input.duration} 秒`,
    "",
    "=== 互动数据 ===",
    `播放量:${input.playCount}`,
    `点赞数:${input.likeCount}`,
    `评论数:${input.commentCount}`,
    `分享数:${input.shareCount}`,
    `收藏数:${input.collectCount}`,
    "",
    "=== 标签 ===",
    input.hashtags.length > 0 ? input.hashtags.join(", ") : "(无)",
    "",
    "=== 旁白/字幕文本 ===",
    input.subtitleText || "(无字幕,基于标题和描述推测)",
    "",
    "=== 请按以下 JSON 格式输出 ===",
    JSON.stringify(ANALYSIS_JSON_SCHEMA, null, 2),
  ].join("\n");
}
