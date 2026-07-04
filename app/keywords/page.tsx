import { KeywordsTable } from "@/components/keywords/keywords-table";
import { CrawlConfigForm } from "@/components/crawl-config-form";
import { listKeywordsWithStats } from "@/lib/supabase/queries";
import type { KeywordWithStats } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  let keywords: KeywordWithStats[] = [];
  try { keywords = await listKeywordsWithStats(); } catch (err) { console.error("[keywords/page]", err); }
  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="mb-8">
        <h1 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100">关键词</h1>
        <p className="mt-1 text-xs text-neutral-500">订阅关键词，自动采集相关视频并解析。</p>
      </div>
      <section className="mb-6"><CrawlConfigForm scope="keyword" /></section>
      <KeywordsTable initialKeywords={keywords} />
    </div>
  );
}
