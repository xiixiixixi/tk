import {
  defineRailway,
  github,
  image,
  preserve,
  project,
  service,
} from "railway";

/**
 * Railway 项目 IaC(基础设施即代码)
 *
 * 单一真相源:所有 service 的配置(schedule / build / start / 环境变量引用)
 * 改完去 Railway Dashboard 点 Deploy 即生效。
 *
 * Cron service 关键设计:
 *   - 不连 GitHub repo(避免 npm build Next.js)
 *   - 用 alpine:3.20 镜像(自带 wget,几 MB 体积,秒级启动)
 *   - start 是 wget 命令,直接调 web 的 cron endpoint
 *
 * 时间都是 UTC(北京 = UTC + 8):
 *   - 北京 9 点 → UTC 1 点
 *   - 北京 0 点 → UTC 16 点
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
      CRON_SECRET:
        "e7f41958c4ee44ce76c93955fe3646197d64219cf3fd04c10af5085890468af6",
      NEXT_PUBLIC_APP_URL: "https://web-production-7b0eb3.up.railway.app",
      // 其他变量已存在 web service,pull 时用 preserve() 保留
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
  // Cron 服务 — 4 个,共用 alpine 镜像 + wget
  //
  // wget 在 alpine 默认安装,不需要 apk add。
  // -qO- = quiet + 输出到 stdout(我们不消费输出,但 wget 不能用 --spider 因为我们要 GET)
  // --header 加 cron secret 鉴权
  // ============================================================

  const cronBase = {
    source: image("alpine:3.20"),
    env: {
      APP_URL: "https://web-production-7b0eb3.up.railway.app",
      CRON_SECRET:
        "e7f41958c4ee44ce76c93955fe3646197d64219cf3fd04c10af5085890468af6",
    },
  } as const;

  // 每 5 分钟(UTC)— 推进解析队列
  const cronProcess = service("cron-process", {
    ...cronBase,
    cronSchedule: "*/5 * * * *",
    start:
      'wget -qO- --header="x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/process"',
  });

  // 每天 UTC 1 点(北京时间 9 点)— 抓所有 active 博主
  const cronMonitorCreators = service("cron-monitor-creators", {
    ...cronBase,
    cronSchedule: "0 1 * * *",
    start:
      'wget -qO- --header="x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/monitor-creators"',
  });

  // 每天 UTC 2 点(北京时间 10 点)— 抓所有 active 关键词
  const cronSearchKeywords = service("cron-search-keywords", {
    ...cronBase,
    cronSchedule: "0 2 * * *",
    start:
      'wget -qO- --header="x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/search-keywords"',
  });

  // 每天 UTC 16 点(北京时间 0 点)— 清理超期视频
  const cronCleanupOldVideos = service("cron-cleanup-old-videos", {
    ...cronBase,
    cronSchedule: "0 16 * * *",
    start:
      'wget -qO- --header="x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/cleanup-old-videos"',
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