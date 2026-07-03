import { SYSTEM_PROMPT, buildAnalysisPrompt, type AnalysisInput } from "./prompt";
import { MOCK_ANALYSIS_RESULT } from "./mock";
import type { AnalysisOutput } from "@/types";

/**
 * Gemini 分析客户端 — 走 OpenRouter(v0.7 决定)
 * SDK: 原生 fetch(OpenRouter 兼容 OpenAI Chat Completions 格式)
 *
 * 输入:元数据 + 旁白 + R2 视频 URL(走 video_url 字段,完整视频理解)
 * 输出:严格 JSON(tech.md §8.2 schema)
 * 默认模型: google/gemini-3.5-flash(可通过 GEMINI_MODEL env 切换)
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "google/gemini-3.5-flash";
const MAX_OUTPUT_TOKENS = 8192;

export interface AnalyzeVideoInput extends AnalysisInput {
  videoR2Url?: string;
  coverR2Url?: string;
}

export async function analyzeVideo(input: AnalyzeVideoInput): Promise<AnalysisOutput> {
  if (shouldUseGeminiMock()) {
    return MOCK_ANALYSIS_RESULT;
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const apiKey = process.env.OPENROUTER_API_KEY!;

  // 组装 message content: text + video + cover image
  const content: any[] = [{ type: "text", text: buildAnalysisPrompt(input) }];
  if (input.videoR2Url) {
    content.push({ type: "video_url", video_url: { url: input.videoR2Url } });
  }
  if (input.coverR2Url) {
    content.push({ type: "image_url", image_url: { url: input.coverR2Url } });
  }

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      max_tokens: MAX_OUTPUT_TOKENS,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter 返回空");

  // response_format: json_object 保证是纯 JSON,不用 regex 提取
  return JSON.parse(text) as AnalysisOutput;
}

/**
 * 是否走 Mock(没配 OPENROUTER_API_KEY 或 MOCK_GEMINI=true)
 */
export function shouldUseGeminiMock(): boolean {
  return !process.env.OPENROUTER_API_KEY || process.env.MOCK_GEMINI === "true";
}
