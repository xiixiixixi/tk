import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Editorial-style 空占位:
 * - 视觉锚点:64×64 圆角灰底图标盒(无 icon 时回退到 lucide Search)
 * - 居中 + 大留白 + 颜色克制(zinc 色阶)
 * - 容器为 div,需要时可被 Card 包一层
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-md flex-col items-center justify-center px-6 py-20 text-center",
        className,
      )}
    >
      <div
        aria-hidden
        className="mb-8 flex h-16 w-16 items-center justify-center  bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400"
      >
        {icon ?? <Search className="h-8 w-8" />}
      </div>

      <h2 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
        {title}
      </h2>

      {description ? (
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      ) : null}

      {action ? <div className="mt-8">{action}</div> : null}
    </div>
  );
}