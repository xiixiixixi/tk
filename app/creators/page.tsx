import { CreatorsTable } from "@/components/creators/creators-table";
import { CrawlConfigForm } from "@/components/crawl-config-form";
import { listCreatorsWithStats } from "@/lib/supabase/queries";
import type { CreatorWithStats } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  let creators: CreatorWithStats[] = [];
  try { creators = await listCreatorsWithStats(); } catch (err) { console.error("[creators/page]", err); }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-sm font-medium tracking-tight text-neutral-900 dark:text-neutral-100">博主</h1>
        <p className="mt-1 text-xs text-neutral-400">订阅博主,自动采集视频并解析。</p>
      </div>
      <section className="mb-6">
        <CrawlConfigForm scope="creator" />
      </section>
      <CreatorsTable initialCreators={creators} />
    </div>
  );
}
