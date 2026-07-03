import * as React from "react";
import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  /**
   * `skeleton` 渲染一组横向网格占位骨架,
   * `spinner` 渲染一个 32px 居中旋转图标。
   * @default "skeleton"
   */
  variant?: "skeleton" | "spinner";
  /**
   * skeleton 变体下渲染的骨架数量。
   * @default 6
   */
  count?: number;
  className?: string;
}

/**
 * 通用加载占位 UI:
 * - skeleton:横向 grid(gap-4)铺一排 Skeleton,适合列表/卡片加载
 * - spinner:Loader2 32px 居中旋转,适合整页/区块等待
 * - 外层统一 max-w-7xl mx-auto py-24,横向居中
 */
export function LoadingState({
  variant = "skeleton",
  count = 6,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={cn(
        "mx-auto flex max-w-7xl items-center justify-center px-6 py-24",
        className,
      )}
    >
      {variant === "spinner" ? (
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500 dark:text-zinc-400" />
      ) : (
        <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: count }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      )}
    </div>
  );
}