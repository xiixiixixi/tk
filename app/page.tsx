import { redirect } from "next/navigation";

/**
 * 首页 — 永久重定向到 /videos(视频库即工作台)。
 *
 * redirect() 在 server component 顶层调用会抛 NEXT_REDIRECT,
 * Next.js 框架会捕获并转为 HTTP 重定向响应。不需要任何业务逻辑。
 */
export default function Home() {
  redirect("/videos");
}
