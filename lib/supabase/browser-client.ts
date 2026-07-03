import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 浏览器端 Supabase 客户端(用 anon key,遵守 RLS)
 * 用于"客户端组件"(<ClientComponent>)内部直接查询
 * 服务端用 getSupabaseAdmin(),不要混用
 *
 * 第一版不实现 RLS,Anon 也能读所有数据。等加 RLS 时用这个 client 区分权限。
 */

let _browser: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (_browser) return _browser;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 缺失");
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY 缺失");

  _browser = createClient(url, key);
  return _browser;
}
