import { getSupabaseAdmin } from "@/lib/supabase/client";

/**
 * 应用运行时配置 — 读写 Supabase app_config 表。
 *
 * 所有 key 为 TEXT PRIMARY KEY,value 为 TEXT(NOT NULL)。
 * 调用方负责解析类型(number/boolean/string)。
 */

const TABLE = "app_config" as const;

/** 读单个配置(不存在返回 null) */
export async function getAppConfig(key: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

/** 读单个配置,带默认值(不存在或 DB 读失败时回退) */
export async function getAppConfigWithDefault(
  key: string,
  fallback: string
): Promise<string> {
  try {
    const v = await getAppConfig(key);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/** 读单个配置并解析为 number(不存在或解析失败返回 fallback) */
export async function getAppConfigNumber(
  key: string,
  fallback: number
): Promise<number> {
  const raw = await getAppConfigWithDefault(key, String(fallback));
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** 写入(或更新)单个配置 */
export async function setAppConfig(
  key: string,
  value: string
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** 批量写入(一次 upsert) */
export async function setAppConfigs(
  entries: Array<{ key: string; value: string }>
): Promise<void> {
  const rows = entries.map(({ key, value }) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await getSupabaseAdmin().from(TABLE).upsert(rows);
  if (error) throw error;
}

/** 读全量配置(Map<key, value>) */
export async function getAllAppConfig(): Promise<Map<string, string>> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("key, value");
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.key, row.value);
  }
  return map;
}
