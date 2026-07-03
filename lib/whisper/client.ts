/**
 * OpenAI Whisper ASR 客户端
 *
 * tech.md §7.5: Apify 字幕缺失时,用 Whisper 把视频转成旁白文本
 *
 * ⚠️ Whisper 不走 OpenRouter(那是 chat completions 网关),直连 OpenAI:
 *    POST https://api.openai.com/v1/audio/transcriptions
 *
 * ⚠️ 超时风险:Hobby 10s 限制下,大文件下载+上传可能超时。
 *    策略:只对 video_file_url 存在的短视频处理,长视频跳过 ASR 走文本降级。
 *    (超时由调用方控制,这里只负责调用)
 */

const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";

/**
 * 把视频 URL 转成文字
 *
 * @param videoUrl 视频(mP4)的公开 URL(R2 公开链接,OpenAI 要能拉到)
 * @param timeoutMs 下载超时(默认 8s,留余量给 Hobby 10s 限制)
 * @returns 转录文本,失败返 null(调用方走降级)
 */
export async function transcribeVideo(
  videoUrl: string,
  timeoutMs = 8000
): Promise<string | null> {
  const apiKey = process.env.WHISPER_API_KEY;
  if (!apiKey) return null;

  try {
    // 1. 下载视频到 Buffer(Whisper API 要上传 file,不接受 URL)
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const videoRes = await fetch(videoUrl, { signal: ctrl.signal });
    clearTimeout(timer);

    if (!videoRes.ok) {
      console.warn(`[whisper] 下载视频失败: ${videoRes.status} ${videoUrl}`);
      return null;
    }
    const videoBuf = new Uint8Array(await videoRes.arrayBuffer());

    // 文件太大跳过(>25MB 大概率超时,且 Whisper 单文件 25MB 上限)
    if (videoBuf.byteLength > 25 * 1024 * 1024) {
      console.warn(
        `[whisper] 视频过大 ${Math.round(videoBuf.byteLength / 1024 / 1024)}MB,跳过 ASR`
      );
      return null;
    }

    // 2. 上传给 Whisper(multipart/form-data)
    const body = buildMultipartBody(videoBuf, "video.mp4");
    const transcriptionRes = await fetch(OPENAI_TRANSCRIPTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${
          body.boundary
        }`,
      },
      body: new Uint8Array(body.buffer),
    });

    if (!transcriptionRes.ok) {
      console.warn(
        `[whisper] 转录失败: ${transcriptionRes.status} ${await transcriptionRes.text()}`
      );
      return null;
    }

    const data = (await transcriptionRes.json()) as { text?: string };
    return data.text?.trim() || null;
  } catch (err) {
    console.warn(
      `[whisper] 异常:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * 手写 multipart/form-data(避免引入 form-data 依赖)
 * 返回 { buffer, boundary }:buffer 是 Uint8Array,header 里用 boundary
 */
function buildMultipartBody(
  fileBuf: Uint8Array,
  filename: string
): { buffer: Uint8Array; boundary: string } {
  const boundary = "----whisper" + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];

  const header = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: video/mp4\r\n\r\n`
  );
  const modelPart = Buffer.from(
    `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-1`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

  parts.push(header, Buffer.from(fileBuf), modelPart, footer);
  return {
    buffer: new Uint8Array(Buffer.concat(parts)),
    boundary,
  };
}
