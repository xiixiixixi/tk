import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { requireCronAuth } from "@/lib/auth/cron";
import { getCrawlConfig } from "@/lib/crawl-config";

export const dynamic = "force-dynamic";

/**
 * 每日清理:按 source_type 分两组,各自按 crawl_config.max_age_months 删超期视频。
 *
 * - creator_monitor 视频 → 按 crawl_config(scope=creator) 的 max_age_months 删
 * - keyword_search 视频 → 按 crawl_config(scope=keyword) 的 max_age_months 删
 *
 * 两组独立 cutoff,避免一刀切:博主可配置长期(12 月),关键词配短期(3 月),
 * 各自只清自己的视频。
 *
 * Railway cron schedule: 0 0 * * * (每天 0 点)
 *
 * 级联删除:video_assets / analysis_results 有 ON DELETE CASCADE,自动跟着删。
 */
export async function GET(req: Request) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;

  try {
    const [creatorCfg, keywordCfg] = await Promise.all([
      getCrawlConfig("creator"),
      getCrawlConfig("keyword"),
    ]);

    // 计算 cutoff 的小工具
    const cutoffIso = (months: number): string => {
      const c = new Date();
      c.setMonth(c.getMonth() - months);
      return c.toISOString();
    };

    const result = {
      creator_deleted: 0,
      keyword_deleted: 0,
      creator_max_age_months: creatorCfg.max_age_months,
      keyword_max_age_months: keywordCfg.max_age_months,
      creator_skipped: false,
      keyword_skipped: false,
    };

    // 清 creator_monitor 视频
    if (creatorCfg.max_age_months >= 9999) {
      result.creator_skipped = true;
    } else {
      const cutoff = cutoffIso(creatorCfg.max_age_months);
      const { data: deleted, error } = await getSupabaseAdmin()
        .from("videos")
        .delete()
        .eq("source_type", "creator_monitor")
        .lt("publish_time", cutoff)
        .not("publish_time", "is", null)
        .select("id");
      if (error) throw error;
      result.creator_deleted = deleted?.length ?? 0;
    }

    // 清 keyword_search 视频
    if (keywordCfg.max_age_months >= 9999) {
      result.keyword_skipped = true;
    } else {
      const cutoff = cutoffIso(keywordCfg.max_age_months);
      const { data: deleted, error } = await getSupabaseAdmin()
        .from("videos")
        .delete()
        .eq("source_type", "keyword_search")
        .lt("publish_time", cutoff)
        .not("publish_time", "is", null)
        .select("id");
      if (error) throw error;
      result.keyword_deleted = deleted?.length ?? 0;
    }

    console.log(
      `[cleanup] creator=${result.creator_deleted} (${result.creator_max_age_months}月)` +
        ` keyword=${result.keyword_deleted} (${result.keyword_max_age_months}月)`
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error("[cleanup] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "清理失败" },
      { status: 500 }
    );
  }
}