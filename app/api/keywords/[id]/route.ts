import { getSupabaseAdmin } from "@/lib/supabase/client";
import { deleteKeyword } from "@/lib/supabase/queries";
import type { KeywordRow } from "@/lib/pipeline/types";

/**
 * DELETE /api/keywords/:id
 * 从监控列表中移除一个关键词。
 *
 * 校验:id 必须是 UUID v4 形式(PostgreSQL gen_random_uuid() 输出)
 *
 * 204 → 删除成功(无 body)
 * 400 → id 不是 UUID
 * 404 → 记录不存在
 * 500 → 删除失败
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return Response.json({ error: "id 必须是合法的 UUID" }, { status: 400 });
  }

  // 先查再删:Supabase delete 在"无匹配行"时不会抛错,只返 data=null,
  // 所以用一次 select 区分 404 和 204。
  const { data: existing, error: selectErr } = await getSupabaseAdmin()
    .from("keywords")
    .select("id")
    .eq("id", id)
    .maybeSingle<Pick<KeywordRow, "id">>();

  if (selectErr) {
    console.error("[DELETE /api/keywords/:id] 查询失败", selectErr);
    return Response.json({ error: "查询失败" }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "keyword 不存在" }, { status: 404 });
  }

  try {
    await deleteKeyword(id);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("[DELETE /api/keywords/:id] 删除失败", err);
    return Response.json({ error: "删除失败" }, { status: 500 });
  }
}
