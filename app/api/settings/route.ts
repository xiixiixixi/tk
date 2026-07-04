import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

/**
 * 设置页 API
 *
 * 安全约束(全文最重要的不变量):
 * - 任何 Secret Key 永远不在响应里出现完整值
 * - 只返 { present: boolean, suffix?: '...xxxx' }
 * - suffix 长度固定 4 字符(末 4 位),不足 4 时按实际长度截断
 * - present=false 时 suffix 字段省掉(防止攻击者根据长度猜)
 *
 * 表 6 张:videos / video_assets / analysis_results / creators / keywords / tasks
 */

// 关心的 secret env key 列表(顺序即前端展示顺序)
const SECRET_KEYS = [
  "OPENROUTER_API_KEY",
  "APIFY_API_KEY",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;

type SecretKey = (typeof SECRET_KEYS)[number];

type SecretStatus = { present: boolean; suffix?: string };

/** 把 env 中的 secret key 转成安全的展示对象 */
function maskSecret(value: string | undefined): SecretStatus {
  if (!value || value.length === 0) return { present: false };
  const tail = value.slice(-4);
  return { present: true, suffix: `...${tail}` };
}

/** 读 boolean env("true" / "1" → true;其他视为 false,不抛错) */
function readBool(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

/**
 * 公开的 settings 数据装配函数(server-only)。
 * 被 GET handler 与 app/settings/page.tsx 共用 — 避免重复逻辑 + 任何一处修改都同步。
 *
 * 安全:此函数**绝不返回**完整 secret key,只返 present + 末 4 位 suffix。
 */
export interface SettingsSnapshot {
  env: Record<SecretKey, SecretStatus>;
  mocks: { MOCK_APIFY: boolean; MOCK_GEMINI: boolean };
  db: { tableCount: number };
}

export async function getSettingsSnapshot(): Promise<SettingsSnapshot> {
  const env = {} as Record<SecretKey, SecretStatus>;
  for (const key of SECRET_KEYS) {
    env[key] = maskSecret(process.env[key]);
  }

  let dbSnapshot: { tableCount: number };
  try {
    const snap = await getDbSnapshot();
    dbSnapshot = { tableCount: snap.tableCount };
  } catch (e) {
    console.error("[api/settings] db snapshot failed:", e);
    dbSnapshot = { tableCount: 0 };
  }

  return {
    env,
    mocks: {
      MOCK_APIFY: readBool(process.env.MOCK_APIFY),
      MOCK_GEMINI: readBool(process.env.MOCK_GEMINI),
    },
    db: dbSnapshot,
  };
}

/**
 * 6 张表的计数 —— 直接各跑一次 count。
 * 不信任前端报告的"表数",让真实 DB 说了算;某张表不在 → 该项 0,total 自然反映。
 */
const TABLE_NAMES = [
  "videos",
  "video_assets",
  "analysis_results",
  "creators",
  "keywords",
  "tasks",
] as const;

async function countTable(name: (typeof TABLE_NAMES)[number]): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from(name)
    .select("id", { count: "exact", head: true });
  if (error) return 0; // 表不存在 / RLS 拦截 → 不让整个接口崩
  return count ?? 0;
}

async function getDbSnapshot(): Promise<{ tableCount: number; presentTables: number }> {
  // 并行跑,失败计入 presentTables(成功 = 表存在且可读)
  const results = await Promise.all(TABLE_NAMES.map((n) => countTable(n)));
  const presentTables = results.filter((c) => c > 0).length;
  // tableCount: 6 张里实际可见的数量(失败/0/不存在都算"未就绪")
  return { tableCount: presentTables, presentTables };
}

export async function GET() {
  const settings = await getSettingsSnapshot();
  return NextResponse.json(settings);
}

/**
 * POST:触发 cron 端点(手动运维入口)。
 * 接受 { triggerCron: 'process' | 'refresh-metrics' | 'monitor-creators' | 'search-keywords' }
 * 内部 fetch 对应 cron endpoint(走完整 HTTP 路径,触发链路不变)。
 *
 * 注意:不轮询、不等待返回(json 上游可能 5–30s)。
 * 用 fire-and-forget + 短超时,失败只记日志。
 */
type TriggerAction = "process" | "refresh-metrics" | "monitor-creators" | "search-keywords";

const TRIGGER_MAP: Record<TriggerAction, string> = {
  process: "/api/cron/process",
  "refresh-metrics": "/api/cron/refresh-metrics",
  "monitor-creators": "/api/cron/monitor-creators",
  "search-keywords": "/api/cron/search-keywords",
};

interface PostBody {
  triggerCron?: TriggerAction;
}

function isTriggerAction(v: unknown): v is TriggerAction {
  return (
    typeof v === "string" &&
    (TRIGGER_MAP as Record<string, string>)[v] !== undefined
  );
}

export async function POST(req: Request) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!isTriggerAction(body.triggerCron)) {
    return NextResponse.json(
      {
        error:
          "missing or invalid triggerCron(必须是 'process' | 'refresh-metrics' | 'monitor-creators' | 'search-keywords')",
      },
      { status: 400 },
    );
  }

  const action = body.triggerCron;
  const path = TRIGGER_MAP[action];
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  // 没配 base 时(本地或部署失败) → 退化成本机相对 URL
  const url = base ? `${base}${path}` : path;

  // 两种 cron 端点耗时差异极大,分两条路径处理:
  //   - process / refresh-metrics:通常 <1s,短超时内能拿到结果 → await 拿真实返回值
  //   - monitor-creators / search-keywords:要遍历多个目标 + 入库,可能 5–30s
  //     → 真 fire-and-forget,不 await,立即返回"已触发"
  const isSlow = action === "monitor-creators" || action === "search-keywords";

  // 服务端内部调 cron,带 X-Cron-Secret 通过鉴权
  const cronSecret = process.env.CRON_SECRET;
  const cronHeaders: Record<string, string> = cronSecret
    ? { "x-cron-secret": cronSecret }
    : {};

  if (isSlow) {
    // fire-and-forget:不阻塞 POST 返回。fetch 失败只记日志,不影响"已触发"的回执。
    void fetch(url, { method: "GET", cache: "no-store", headers: cronHeaders }).catch((e) => {
      console.error(`[api/settings] trigger ${action} (fire-and-forget) error:`, e);
    });
    return NextResponse.json({
      action,
      result: { triggered: true, message: "已触发,后台正在抓取入库,请稍后在列表查看" },
    });
  }

  // 快端点:8s 超时拿真实结果
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { method: "GET", cache: "no-store", signal: ctrl.signal, headers: cronHeaders });
    clearTimeout(timer);

    let result: unknown = null;
    try {
      result = await res.json();
    } catch {
      // 下游非 JSON / 空响应 — 不阻断
    }

    return NextResponse.json({ action, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/settings] trigger ${action} failed:`, message);
    // 还是 200 — 调用已发出(或尝试发出),前端按 result 字段判断
    return NextResponse.json({
      action,
      result: { error: `trigger failed: ${message}` },
    });
  }
}
