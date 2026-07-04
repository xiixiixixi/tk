import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { STATUS_LABELS, type AnalysisStatus } from "@/types";

/**
 * AnalysisStatus → 视觉 variant 映射(Editorial / 杂志风格)
 *
 *   success    → emerald bg + text(completed / duplicate,终态成功)
 *   error      → red     bg + text(failed,终态失败)
 *   warning    → amber   bg + text(pending_analysis,等待人工)
 *   processing → zinc + animate-pulse 2s(进行中,慢节拍象征"在跑")
 *
 * 关键:border 统一用 zinc-200 / zinc-800(不是 emerald),
 *      让有色 bg 看起来更像印在杂志上的色块标签,
 *      而不是带颜色的"徽章" —— 这是 editorial 和 shadcn 默认 Badge 的关键区别。
 */
const STATUS_VARIANT: Record<string, "success" | "error" | "warning" | "processing"> = {
  completed: "success",
  duplicate: "success",
  failed: "error",
  pending_analysis: "warning",
  new: "processing",
  apify_started: "processing",
  metadata_fetched: "processing",
  video_downloaded: "processing", // v0.7 deprecated
  video_processed: "processing",
  audio_extracted: "processing",
  analyzing: "processing",
};

const statusBadgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2 dark:focus:ring-zinc-300",
  {
    variants: {
      variant: {
        success:
          "border-zinc-200 bg-emerald-50 text-emerald-700 dark:border-zinc-800 dark:bg-emerald-950/40 dark:text-emerald-400",
        error:
          "border-zinc-200 bg-red-50 text-red-700 dark:border-zinc-800 dark:bg-red-950/40 dark:text-red-400",
        warning:
          "border-zinc-200 bg-amber-50 text-amber-700 dark:border-zinc-800 dark:bg-amber-950/40 dark:text-amber-400",
        // 处理中:rust 橙脉冲(暖橙 Editor 的标志色)
        processing:
          "border-[#C04A1A]/30 bg-[#C04A1A]/10 text-[#C04A1A] animate-pulse dark:border-[#C04A1A]/40 dark:bg-[#C04A1A]/20 dark:text-[#E8855A]",
      },
      size: {
        default: "",
        sm: "px-2 text-[10px]",
      },
    },
    defaultVariants: {
      variant: "processing",
      size: "default",
    },
  }
);

export interface StatusBadgeProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children">,
    Pick<VariantProps<typeof statusBadgeVariants>, "size"> {
  /** 接受任意字符串(因为 task-list 传 task.status,不是 AnalysisStatus) */
  status: string;
}

/**
 * 全局状态 Badge —— Editorial 风格。
 * 显示 STATUS_LABELS[status],颜色由 status 自动映射。
 * 未知 status 降级为 "processing"(zinc + pulse)。
 */
const StatusBadge = React.forwardRef<HTMLDivElement, StatusBadgeProps>(
  ({ className, status, size, ...props }, ref) => {
    const variant = STATUS_VARIANT[status] ?? "processing";
    const label =
      STATUS_LABELS[status as AnalysisStatus] ?? status ?? "未知";
    return (
      <div
        ref={ref}
        className={cn(statusBadgeVariants({ variant, size }), className)}
        {...props}
      >
        {label}
      </div>
    );
  }
);
StatusBadge.displayName = "StatusBadge";

export { StatusBadge, statusBadgeVariants };