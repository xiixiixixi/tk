import { NextResponse } from "next/server";

/**
 * Cron 端点鉴权
 *
 * 防止外部恶意调用刷爆 Apify/Gemini 额度。
 *
 * 放行规则(满足任一):
 *   1. 请求头 X-Cron-Secret === CRON_SECRET  (服务端内部调用:接力 fetch / 设置页触发)
 *   2. 同源请求(Origin/Referer 匹配 NEXT_PUBLIC_APP_URL)  (前端兜底触发 / 卡片按钮)
 *   3. 开发环境(NODE_ENV !== production)  (本地调试)
 *
 * 为什么允许同源:单人自用版,前端需要触发 cron(链断裂兜底、卡片立即抓取)。
 * 前端没有也不该有 secret,用同源判断挡住外部 curl(陌生人不知道域名无法伪造正确 Origin)。
 * 多用户版上线时,前端触发应改走带 session 的业务 API。
 *
 * @returns 鉴权失败返回 401 NextResponse;通过返回 null
 */
export function requireCronAuth(req: Request): NextResponse | null {
  // 开发环境免鉴权
  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  // 1. 服务端内部调用:带 X-Cron-Secret
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret");
    if (provided === secret) return null;
  }

  // 2. 同源请求(前端触发):Origin 或 Referer 匹配本站
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    try {
      const appHost = new URL(appUrl).host;
      if (origin && new URL(origin).host === appHost) return null;
      if (referer && new URL(referer).host === appHost) return null;
    } catch {
      // appUrl 格式异常,跳过同源检查
    }
  }

  // 都不满足 → 拒绝
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
