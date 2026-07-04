import { SYSTEM_PROMPT, buildAnalysisPrompt, type AnalysisInput } from "./prompt";
import { MOCK_ANALYSIS_RESULT } from "./mock";
import type { AnalysisOutput } from "@/types";

/**
 * Gemini 分析客户端 — 走 OpenRouter
 *
 * v0.8:视频走 base64 内联(OpenRouter 的 Gemini 不支持任意 mp4 URL,只支持 YouTube+base64)
 *      有视频时加 input_modalities 声明,否则 Gemini 返回 INVALID_ARGUMENT
 *      默认模型:google/gemini-3.5-flash(支持 text+image+video+audio 全模态)
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "google/gemini-3.5-flash";
const MAX_OUTPUT_TOKENS = 8192;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // Gemini 视频上限 25MB

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

  // 组装 message content: text + video(base64 内联) + cover image
  // ⚠️ v0.8:OpenRouter 的 Gemini 不支持任意 mp4 URL(只支持 YouTube 链接),
  //    视频必须 base64 内联。下载 R2 视频 → 编码 → data:video/mp4;base64,...
  //    大视频会超 token 上限,有 25MB 硬限(超过跳过视频走封面降级)
  const content: any[] = [{ type: "text", text: buildAnalysisPrompt(input) }];

  let hasVideo = false;
  if (input.videoR2Url) {
    const videoBase64 = await fetchVideoAsBase64(input.videoR2Url);
    if (videoBase64) {
      content.push({
        type: "video_url",
        video_url: { url: `data:video/mp4;base64,${videoBase64}` },
      });
      hasVideo = true;
    } else {
      // 视频下载/编码失败 → 降级用封面图
      console.warn("[gemini] 视频转 base64 失败,降级用封面图");
    }
  }
  if (!hasVideo && input.coverR2Url) {
    content.push({ type: "image_url", image_url: { url: input.coverR2Url } });
  }

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    response_format: { type: "json_object" },
    max_tokens: MAX_OUTPUT_TOKENS,
  };
  // 注:gemini-3.5-flash 通过 video_url + base64 传视频时,不需要显式声明 input_modalities。
  // 实测(2026-07):加了 input_modalities 反而偶尔触发 400,不加最稳定。

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    },
    body: JSON.stringify(body),
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

/**
 * 下载 R2 视频并转 base64(供 Gemini 内联输入)
 *
 * - 超过 25MB 返回 null(Gemini 视频上限,超过会 400)
 * - 下载失败返回 null(调用方降级用封面)
 * - 用 AbortController 限 8s
 */
async function fetchVideoAsBase64(videoUrl: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(videoUrl, { signal: ctrl.signal });
    clearTimeout(timer);

    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());

    if (buf.byteLength > MAX_VIDEO_BYTES) {
      console.warn(
        `[gemini] 视频 ${Math.round(buf.byteLength / 1024 / 1024)}MB 超 25MB 上限,跳过视频`
      );
      return null;
    }

    // Uint8Array → base64(分块避免 fromCharCode 栈溢出)
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < buf.length; i += chunkSize) {
      binary += String.fromCharCode(...Array.from(buf.subarray(i, i + chunkSize)));
    }
    return btoa(binary);
  } catch (err) {
    console.warn(`[gemini] 视频下载失败:`, err instanceof Error ? err.message : err);
    return null;
  }
}
