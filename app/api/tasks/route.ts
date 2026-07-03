import {
  getSupabaseAdmin,
} from "@/lib/supabase/client";
import {
  insertTask,
  insertVideo,
  updateTask,
} from "@/lib/supabase/queries";
import { isValidTikTokUrl } from "@/lib/utils";
import type { TaskType } from "@/types";

/**
 * POST /api/tasks
 * 创建一个分析/监控/搜索任务。
 *
 * 请求体:
 *   {
 *     task_type: 'analyze_video' | 'monitor_creator' | 'search_keyword',
 *     input_value: string,
 *     options?: { ... }
 *   }
 *
 * 行为:
 *   1. 校验 input_value 非空且长度 <= 2048
 *   2. analyze_video 类型用 isValidTikTokUrl 二次校验 URL
 *   3. 写 tasks 表(拿 task_id)
 *   4. analyze_video 类型额外写 videos 表(status='new', source_type='manual_video')
 *   5. 把 video_id 反写到 task.related_video_id
 *   6. 返 201 { task_id, status: 'pending', message }
 *   7. fire-and-forget 触发 /api/cron/process(不 await)
 *
 * 错误: catch → 500
 */

const TASK_TYPES: ReadonlyArray<TaskType> = [
  "analyze_video",
  "monitor_creator",
  "search_keyword",
];

const INPUT_VALUE_MAX_LEN = 2048;

interface CreateTaskRequestBody {
  task_type: TaskType;
  input_value: string;
  options?: Record<string, unknown>;
}

/**
 * GET /api/tasks?limit=10
 * 最近任务列表(供首页 task-list 用,service_role 查,绕过 RLS)。
 * JOIN videos 表拿真实分析进度(analysis_status),前端不再用 anon key 直查。
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 10, 50);

    const { data, error } = await getSupabaseAdmin()
      .from("tasks")
      .select(
        "id, task_type, input_value, status, created_at, videos!related_video_id(id, analysis_status, title)"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return Response.json({ tasks: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json({ error: `查询任务列表失败: ${message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<CreateTaskRequestBody>;

    // ---- 基础校验 ----
    const taskType = body.task_type;
    if (!taskType || !TASK_TYPES.includes(taskType)) {
      return Response.json(
        { error: "task_type 必须是 analyze_video / monitor_creator / search_keyword" },
        { status: 400 }
      );
    }

    const inputValue = body.input_value;
    if (typeof inputValue !== "string") {
      return Response.json({ error: "input_value 必须是字符串" }, { status: 400 });
    }
    const trimmed = inputValue.trim();
    if (trimmed.length === 0) {
      return Response.json({ error: "input_value 不能为空" }, { status: 400 });
    }
    if (trimmed.length > INPUT_VALUE_MAX_LEN) {
      return Response.json(
        { error: `input_value 长度不能超过 ${INPUT_VALUE_MAX_LEN} 字符` },
        { status: 400 }
      );
    }

    // ---- analyze_video 二次校验 URL ----
    if (taskType === "analyze_video" && !isValidTikTokUrl(trimmed)) {
      return Response.json(
        { error: "analyze_video 类型需要合法的 TikTok 视频 URL" },
        { status: 400 }
      );
    }

    // ---- 写 tasks 表 ----
    const { id: taskId } = await insertTask({
      task_type: taskType,
      input_value: trimmed,
    });

    // ---- analyze_video:写 videos + 回填 task ----
    // videos 表的 analysis_status DEFAULT 'new'、source_type DEFAULT 'manual_video',
    // 这里显式写 source_type 保持与原 URL 关联的语义清晰
    if (taskType === "analyze_video") {
      const { id: videoId } = await insertVideo({
        source_type: "manual_video",
        original_url: trimmed,
      });
      await updateTask(taskId, { related_video_id: videoId });
    }

    // ---- 触发后台处理(fire-and-forget,不 await) ----
    // 用默认 GET(不是 POST):/api/cron/process 只 export GET handler,
    // 用 POST 会返 405 Method Not Allowed。带 X-Cron-Secret 通过鉴权。
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) {
      const secret = process.env.CRON_SECRET;
      void fetch(`${appUrl}/api/cron/process`, {
        headers: secret ? { "x-cron-secret": secret } : {},
      }).catch(() => {
        // cron 触发失败不影响主流程
      });
    }

    return Response.json(
      {
        task_id: taskId,
        status: "pending",
        message: "任务已创建,正在排队处理",
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json({ error: `创建任务失败: ${message}` }, { status: 500 });
  }
}
