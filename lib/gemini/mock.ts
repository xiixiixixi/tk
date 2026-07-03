import type { AnalysisOutput } from "@/types";

/**
 * Mock Gemini 分析结果(开发期不开 Gemini 配额也能跑通流程)
 * 字段跟 types/index.ts ANALYSIS_OUTPUT 一一对应
 */
export const MOCK_ANALYSIS_RESULT: AnalysisOutput = {
  video_summary:
    "【Mock】这段视频展示了一个引人入胜的产品介绍,前 3 秒以视觉冲击力抓住用户注意力,中段通过对比展示强化价值,结尾用限时优惠推动转化。",
  video_type: "测评类",
  target_audience: "18-35 岁的年轻消费者,关注生活品质和性价比",
  hook_0_3s: {
    original: "【Mock】前 3 秒直接展示产品使用前后的强烈对比",
    type: "视觉冲击",
    why_it_works:
      "直观的视觉对比能让用户在信息流中下意识停下来,激活好奇心",
    replicable_template:
      "【产品效果对比】+【核心数字】+【时间紧迫暗示】",
  },
  storyboard: [
    {
      segment: "0-3 秒",
      visual: "【Mock】产品使用前后的强烈对比图",
      audio: "节奏感强的背景音乐 + 简短的疑问句",
      text: '"3 天改变这一切,真的?"',
      purpose: "建立好奇心,抓住用户注意力",
    },
    {
      segment: "3-8 秒",
      visual: "放大展示产品细节和使用过程",
      audio: '"让我告诉你一个秘密..."',
      text: "痛点 1 + 痛点 2",
      purpose: "引入并放大用户痛点",
    },
    {
      segment: "8-15 秒",
      visual: "产品使用全过程 + 关键卖点叠加",
      audio: "详细解说 + 关键数据(节省 50% / 提升 3 倍)",
      text: "卖点 + 价格",
      purpose: "展示解决方案的具体价值",
    },
    {
      segment: "15-25 秒",
      visual: "用户真实证言 + 前后对比再现",
      audio: '"我也是这样" + 真实反馈',
      text: '"你也想要吗?" + 限时优惠',
      purpose: "社会证明 + 营造紧迫感",
    },
    {
      segment: "结尾",
      visual: "CTA 卡片 + 引导点击",
      audio: "行动号召 + 限时倒计时",
      text: '"立即点击链接领取专属优惠"',
      purpose: "转化",
    },
  ],
  voiceover_script: {
    full_text:
      "【Mock 完整口播】这是钩子,这是痛点,这是方案,这是证明,这是转化话术。具体见 video_summary。",
    structure: {
      hook: "【Mock】3 天改变这一切,真的?",
      pain_point: "【Mock】每天花 2 小时做这件事,效率太低",
      solution: "【Mock】现在有了 X,Y 也能做到",
      proof: "【Mock】用户 1 / 用户 2 真实反馈",
      cta: "【Mock】点击链接,限时 50% 优惠,只剩 3 个名额",
    },
  },
  subtitle_structure: {
    pain_point: "【Mock】每天 2 小时,效率低到崩溃",
    solution: "【Mock】今天教你 5 分钟搞定",
    proof: "【Mock】用户真实反馈 + 数据证明",
    cta: "【Mock】点击下方,限时 5 折",
  },
  visual_structure: {
    character: "一个真实的年轻用户(共情)",
    product: "产品特写 + 使用细节",
    scene: "日常生活(厨房 / 卧室 / 办公桌)",
    camera: "快速切换 + 多个角度",
    text_overlay: "简洁大字 + 关键数字",
    pace: "快节奏,每 3-5 秒一个信息点",
  },
  selling_points: [
    {
      point: "【Mock】节省 50% 时间",
      how_presented: "前后对比 + 数据展示",
      effectiveness: "高",
    },
    {
      point: "【Mock】价格只有同类产品的 1/3",
      how_presented: "价格对比图",
      effectiveness: "高",
    },
    {
      point: "【Mock】7 天无理由退换",
      how_presented: "用户证言 + 售后承诺",
      effectiveness: "中",
    },
  ],
  viral_points: {
    emotional_triggers: ["好奇心", "缺失感", "紧迫感", "怕错过(FOMO)"],
    contrast_points: ["前后对比", "价格对比", "效率对比"],
    visual_highlights: ["动态效果对比", "真实使用场景", "数据可视化"],
    comment_triggers: ['"求链接"', '"多少钱"', '"在哪里买"', '"真的有效吗?"'],
    share_reasons: ["实用价值", "情感共鸣", "价格优惠", "朋友需要"],
  },
  replicable_script: {
    title_template: "【产品效果】+【诱人数字】+【时间紧迫】",
    opening: "【3 秒钩子】视觉冲击 + 关键数字 + 疑问句",
    middle: "【痛点 + 方案 + 证明 + 对比】",
    ending: "【CTA + 限时优惠 + 名额倒计时】",
    shooting_tips: [
      "光线充足,产品细节清晰可见",
      "声音清晰,关键数字加重",
      "节奏紧凑,每 5 秒切换画面",
      "字幕突出数字和痛点",
    ],
  },
  rewrite_suggestions: {
    suitable_industries: ["美妆", "家居", "数码产品", "服装"],
    suitable_products: ["小工具", "护肤品", "日用品", "数码配件"],
    difficulty: "中",
    reusability: "高",
    notes: "【Mock】这套模板可复用到大多数带货/种草场景,关键是找到产品的'3 秒差异点'",
  },
};
