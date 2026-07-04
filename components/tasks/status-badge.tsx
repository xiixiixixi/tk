import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type AnalysisStatus } from "@/types";

const STATUS_VARIANT: Record<string, "success" | "error" | "warning" | "processing"> = {
  completed: "success", duplicate: "success",
  failed: "error", pending_analysis: "warning",
  new: "processing", apify_started: "processing", metadata_fetched: "processing",
  video_downloaded: "processing", video_processed: "processing",
  audio_extracted: "processing", analyzing: "processing",
};

const statusBadgeVariants = cva(
  "inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
  {
    variants: {
      variant: {
        success: "bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900",
        error: "bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900",
        warning: "bg-[hsl(var(--color-lemon))] text-neutral-900",
        processing: "bg-[hsl(var(--color-ikb))] text-white animate-pulse",
      },
      size: { default: "", sm: "px-1.5 text-[9px]" },
    },
    defaultVariants: { variant: "processing", size: "default" },
  }
);

export interface StatusBadgeProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children">,
    Pick<VariantProps<typeof statusBadgeVariants>, "size"> {
  status: string;
}

const StatusBadge = React.forwardRef<HTMLDivElement, StatusBadgeProps>(
  ({ className, status, size, ...props }, ref) => {
    const variant = STATUS_VARIANT[status] ?? "processing";
    const label = STATUS_LABELS[status as AnalysisStatus] ?? status ?? "未知";
    return <div ref={ref} className={cn(statusBadgeVariants({ variant, size }), className)} {...props}>{label}</div>;
  }
);
StatusBadge.displayName = "StatusBadge";

export { StatusBadge, statusBadgeVariants };
