import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

const VALID_SCOPES = ["creator", "keyword"] as const;
type Scope = (typeof VALID_SCOPES)[number];

const DEFAULTS = {
  max_age_months: 3,
  exclude_slideshow: true,
  max_duration_sec: 60,
  min_like_count: 0,
  min_comment_count: 0,
  min_play_count: 10000,
  min_share_count: 0,
  min_collect_count: 0,
};

/** GET /api/crawl-config?scope=creator */
export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope") as Scope | null;
  if (!scope || !VALID_SCOPES.includes(scope)) {
    return NextResponse.json({ error: "scope 必须是 creator 或 keyword" }, { status: 400 });
  }
  const { data, error } = await getSupabaseAdmin()
    .from("crawl_config")
    .select("*")
    .eq("scope", scope)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data ?? { scope, ...DEFAULTS } });
}

/** POST /api/crawl-config  body: { scope, ...config } */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const scope = body.scope as Scope | null;
  if (!scope || !VALID_SCOPES.includes(scope)) {
    return NextResponse.json({ error: "scope 必须是 creator 或 keyword" }, { status: 400 });
  }
  const update = {
    scope,
    max_age_months: Number(body.max_age_months) || 3,
    exclude_slideshow: Boolean(body.exclude_slideshow),
    max_duration_sec: Number(body.max_duration_sec) || 60,
    min_like_count: Number(body.min_like_count) || 0,
    min_comment_count: Number(body.min_comment_count) || 0,
    min_play_count: Number(body.min_play_count) || 0,
    min_share_count: Number(body.min_share_count) || 0,
    min_collect_count: Number(body.min_collect_count) || 0,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await getSupabaseAdmin()
    .from("crawl_config")
    .upsert(update, { onConflict: "scope" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data });
}
