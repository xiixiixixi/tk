/**
 * 进程内调度器 — 替代 Railway Dashboard 硬编码 cron。
 *
 * 原理:
 *   Railway web 服务是常驻 Node.js 进程(不像 Vercel serverless 会冷启动),
 *   因此 setInterval 可靠。配置存 Supabase app_config 表,设置页可直接改。
 *
 * 行为:
 *   1. 启动时从 DB 读各 job 的间隔配置(分钟)
 *   2. 每个 job 起一个 setInterval,到期时内部 fetch 对应的 cron 端点
 *   3. 每 5 分钟重读 DB 配置 → 热更新间隔(无需重启)
 *   4. 同一 job 如果上次还没跑完,本次跳过(简单防重叠)
 *
 * 启动方式:
 *   instrumentation.ts 在服务启动时调用 startScheduler()
 */

import { getAppConfigNumber } from "@/lib/app-config";

// ============================================================
// Job 定义
// ============================================================

interface JobDef {
  /** cron 端点路径(不含 base URL) */
  path: string;
  /** 配置 key(读 app_config 的间隔分钟数) */
  configKey: string;
  /** 硬最低间隔(分钟,防误设为 0 导致打爆自己) */
  minIntervalMin: number;
  /** 默认间隔(分钟,DB 不存在时回退) */
  defaultIntervalMin: number;
}

const JOBS: JobDef[] = [
  {
    path: "/api/cron/process",
    configKey: "schedule_process_interval_min",
    minIntervalMin: 1,
    defaultIntervalMin: 1,
  },
  {
    path: "/api/cron/monitor-creators",
    configKey: "schedule_monitor_creators_interval_min",
    minIntervalMin: 5,
    defaultIntervalMin: 60,
  },
  {
    path: "/api/cron/search-keywords",
    configKey: "schedule_search_keywords_interval_min",
    minIntervalMin: 5,
    defaultIntervalMin: 120,
  },
  {
    path: "/api/cron/refresh-metrics",
    configKey: "schedule_refresh_metrics_interval_min",
    minIntervalMin: 30,
    defaultIntervalMin: 1440,
  },
];

// ============================================================
// 调度器状态
// ============================================================

interface JobState {
  def: JobDef;
  timer: NodeJS.Timeout | null;
  running: boolean;
  currentIntervalMin: number;
}

const states: Map<string, JobState> = new Map();
let configWatcher: NodeJS.Timeout | null = null;
const CONFIG_RELOAD_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟

// ============================================================
// 内部函数
// ============================================================

function cronHeaders(): Record<string, string> {
  const secret = process.env.CRON_SECRET;
  return secret ? { "x-cron-secret": secret } : {};
}

async function executeJob(jobId: string): Promise<void> {
  const state = states.get(jobId);
  if (!state) return;

  // 防重叠:上一次还没跑完就跳过
  if (state.running) {
    console.log(`[scheduler] ${jobId}: skip (previous still running)`);
    return;
  }

  state.running = true;
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = `${base}${state.def.path}`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: cronHeaders(),
    });
    if (!res.ok) {
      console.warn(
        `[scheduler] ${jobId}: HTTP ${res.status} ${res.statusText}`
      );
    }
  } catch (err) {
    console.error(`[scheduler] ${jobId}: fetch failed`, err);
  } finally {
    state.running = false;
  }
}

function rescheduleJob(jobId: string, intervalMin: number): void {
  const state = states.get(jobId);
  if (!state) return;

  const clamped = Math.max(intervalMin, state.def.minIntervalMin);
  const ms = clamped * 60 * 1000;

  // 清除旧 timer
  if (state.timer) clearInterval(state.timer);

  // 设新 timer
  state.timer = setInterval(() => executeJob(jobId), ms);
  state.currentIntervalMin = clamped;

  console.log(`[scheduler] ${jobId}: every ${clamped}min`);

  // 首次立即执行(仅当 interval 变更或首次启动时)
  // 用 setTimeout 0 避免阻塞启动
  setTimeout(() => executeJob(jobId), 1000);
}

async function reloadConfig(): Promise<void> {
  for (const [jobId, state] of states) {
    try {
      const intervalMin = await getAppConfigNumber(
        state.def.configKey,
        state.def.defaultIntervalMin
      );
      if (intervalMin !== state.currentIntervalMin) {
        rescheduleJob(jobId, intervalMin);
      }
    } catch (err) {
      console.error(`[scheduler] reloadConfig ${jobId} failed:`, err);
      // 保持当前间隔继续跑
    }
  }
}

// ============================================================
// 公开 API
// ============================================================

/** 启动调度器(幂等:重复调用不创建重复 timer) */
export function startScheduler(): void {
  // guard: Edge Runtime / 非 Node 环境不启动
  if (typeof setInterval === "undefined") return;

  // 幂等:已经启动过就跳过
  if (states.size > 0) {
    console.log("[scheduler] already running, skip");
    return;
  }

  console.log("[scheduler] starting...");

  // 初始化 states
  for (const def of JOBS) {
    states.set(def.path, {
      def,
      timer: null,
      running: false,
      currentIntervalMin: def.defaultIntervalMin,
    });
  }

  // 第一轮:用默认值快速启动(不阻塞,后台异步读 DB 后再调)
  for (const [jobId, state] of states) {
    rescheduleJob(jobId, state.def.defaultIntervalMin);
  }

  // 异步从 DB 加载真实配置并重调度
  reloadConfig().catch((err) =>
    console.error("[scheduler] initial reloadConfig failed:", err)
  );

  // 每 5 分钟热重载配置
  configWatcher = setInterval(() => {
    reloadConfig().catch((err) =>
      console.error("[scheduler] periodic reloadConfig failed:", err)
    );
  }, CONFIG_RELOAD_INTERVAL_MS);

  console.log("[scheduler] started");
}

/** 停止调度器(测试/开发用) */
export function stopScheduler(): void {
  for (const [, state] of states) {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }
  states.clear();

  if (configWatcher) {
    clearInterval(configWatcher);
    configWatcher = null;
  }

  console.log("[scheduler] stopped");
}

