/**
 * Next.js Instrumentation Hook
 *
 * 服务启动时自动初始化进程内调度器,替代 Railway Dashboard 硬编码 cron。
 * 仅在 Node.js runtime 执行(Edge / browser 环境跳过)。
 *
 * 文档: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
