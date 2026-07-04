import { QuickParse } from "@/components/videos/quick-parse";
import { VideoTable } from "@/components/videos/video-table";
import { listVideos } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function VideosPage() {
  const { videos, total } = await listVideos({ page: 1, pageSize: PAGE_SIZE });

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8">
        <QuickParse />
      </div>
      <VideoTable initialVideos={videos} initialTotal={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
