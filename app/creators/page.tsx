import { H1, Lead, Muted } from "@/components/ui/typography";
import { CreatorsTable } from "@/components/creators/creators-table";
import { CrawlConfigForm } from "@/components/crawl-config-form";
import { listCreatorsWithStats } from "@/lib/supabase/queries";
import type { CreatorWithStats } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  let creators: CreatorWithStats[] = [];
  try {
    creators = await listCreatorsWithStats();
  } catch (err) {
    console.error("[creators/page] listCreators 失败", err);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 md:py-16">
      <header className="space-y-5">
        <Muted className="font-mono uppercase tracking-[0.18em]">博主订阅</Muted>
        <H1 size="lg" className="text-5xl tracking-tighter md:text-6xl">博主</H1>
        <Lead className="max-w-2xl text-lg leading-relaxed">
          订阅博主,系统自动采集视频并解析。点击博主查看其所有视频。
        </Lead>
      </header>

      <section className="mt-10">
        <CrawlConfigForm scope="creator" />
      </section>

      <section className="mt-8">
        <CreatorsTable initialCreators={creators} />
      </section>
    </div>
  );
}
