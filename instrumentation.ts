/**
 * Next.js Instrumentation Hook — 服务启动时初始化调度器
 * Next.js 16 自动检测此文件并调用 register()，无需额外配置。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
