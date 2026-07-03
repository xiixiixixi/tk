import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 服务端 Supabase 客户端(用 service_role key,绕过 RLS)
 * 用于 API routes、Pipeline handlers、定时任务等后端代码
 * 永远不要把它 import 到客户端组件里
 *
 * 第一版不实现 RLS,等服务端 + 浏览器端区分需要时再加策略
 */

let _admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 缺失");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 缺失");

  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
