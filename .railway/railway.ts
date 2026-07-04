import {
  defineRailway,
  github,
  preserve,
  project,
  service,
} from "railway";

/**
 * Railway 项目 IaC(基础设施即代码)
 *
 * 单一真相源:
 *   - 所有 service 的配置(schedule / build / start / 环境变量引用)
 *   - 改完运行 `railway config plan` 看预览,再 `railway config apply` 应用
 *
 * 工作流:
 *   1. 改 schedule 或环境变量引用 → 改这里
 *   2. `railway config plan` 看会改什么
 *   3. `railway config apply` 应用到 Railway
 *   4. commit 这个文件到 git,团队成员 clone 后能 100% 复现项目
 */

export default defineRailway(() => {
  // ============================================================
  // Web 服务(主 Next.js 应用)
  // ============================================================
  const web = service("web", {
    source: github("xiixiixixi/tk", { branch: "main" }),
    build: "npm run build",
    start: "next start",
    env: {
      // cron 调内部 API 需要鉴权 — web 自己用,被 cron 触发
      CRON_SECRET:
        "e7f41958c4ee44ce76c93955fe3646197d64219cf3fd04c10af5085890468af6",
      NEXT_PUBLIC_APP_URL: "https://web-production-7b0eb3.up.railway.app",
      // 其他变量(APIFY/R2 等)已存在 web service,pull 时用 preserve() 保留
      APIFY_API_KEY: preserve(),
      R2_ACCOUNT_ID: preserve(),
      R2_ACCESS_KEY_ID: preserve(),
      R2_SECRET_ACCESS_KEY: preserve(),
      R2_BUCKET_NAME: preserve(),
      R2_PUBLIC_URL: preserve(),
      WORKER_SECRET: preserve(),
      RAILWAY_WORKER_URL: preserve(),
      CRON_SUPABASE_URL: preserve(),
      CRON_SUPABASE_SERVICE_ROLE_KEY: preserve(),
      OPENROUTER_API_KEY: preserve(),
    },
  });

  // ============================================================
  // Cron 服务 — 4 个,全部拉同一个 repo,但 schedule / 命令不同
  //
  // Cron Job service 在 Railway 里的行为:
  //   - 按 schedule 自动启动
  //   - 执行 start 命令一次(几秒到几十秒)
  //   - 执行完自动停止,不占资源
  //   - 改 schedule 改这里就行,commit + apply 即可
  // ============================================================

  const cronBase = {
    source: github("xiixiixixi/tk", { branch: "main" }),
    env: {
      APP_URL: "https://web-production-7b0eb3.up.railway.app",
      CRON_SECRET:
        "e7f41958c4ee44ce76c93955fe3646197d64219cf3fd04c10af5085890468af6",
    },
  } as const;

  // 每 5 分钟 — 推进解析队列(process cron)
  const cronProcess = service("cron-process", {
    ...cronBase,
    cronSchedule: "*/5 * * * *",
    start:
      'curl -fsS -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/process"',
  });

  // 每天 9 点 — 抓所有 active 博主
  const cronMonitorCreators = service("cron-monitor-creators", {
    ...cronBase,
    cronSchedule: "0 9 * * *",
    start:
      'curl -fsS -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/monitor-creators"',
  });

  // 每天 10 点 — 抓所有 active 关键词
  const cronSearchKeywords = service("cron-search-keywords", {
    ...cronBase,
    cronSchedule: "0 10 * * *",
    start:
      'curl -fsS -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/search-keywords"',
  });

  // 每天 0 点 — 清理超期视频(creator / keyword 各自按 crawl_config.max_age_months)
  const cronCleanupOldVideos = service("cron-cleanup-old-videos", {
    ...cronBase,
    cronSchedule: "0 0 * * *",
    start:
      'curl -fsS -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/cleanup-old-videos"',
  });

  return project("tiktok", {
    resources: [
      web,
      cronProcess,
      cronMonitorCreators,
      cronSearchKeywords,
      cronCleanupOldVideos,
    ],
  });
});