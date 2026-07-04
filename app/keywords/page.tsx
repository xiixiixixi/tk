import { H1, Lead, Muted } from "@/components/ui/typography";
import { KeywordsTable } from "@/components/keywords/keywords-table";
import { CrawlConfigForm } from "@/components/crawl-config-form";
import { listKeywordsWithStats } from "@/lib/supabase/queries";
import type { KeywordWithStats } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  let keywords: KeywordWithStats[] = [];
  try {
    keywords = await listKeywordsWithStats();
  } catch (err) {
    console.error("[keywords/page] listKeywords 失败", err);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 md:py-16">
      <header className="space-y-5">
        <Muted className="font-mono uppercase tracking-[0.18em]">关键词订阅</Muted>
        <H1 size="lg" className="text-5xl tracking-tighter md:text-6xl">关键词</H1>
        <Lead className="max-w-2xl text-lg leading-relaxed">
          订阅关键词,系统自动采集相关视频并解析。点击关键词查看其所有视频。
        </Lead>
      </header>

      <section className="mt-10">
        <CrawlConfigForm scope="keyword" />
      </section>

      <section className="mt-8">
        <KeywordsTable initialKeywords={keywords} />
      </section>
    </div>
  );
}
