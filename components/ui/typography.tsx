import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Editorial / 杂志风格排版组件
 *
 * 设计原则:
 * 1. 严格的字号梯度 — 不引入紫色 / 渐变,只用 zinc 中性色
 * 2. 一切服务器组件(无 "use client")— 不需要任何 hook / 浏览器 API
 * 3. forwardRef + cva — 支持 size 等可选变体,统一 cn() 合并 className
 *
 * 字号梯度(从大到小):
 *   H1  : text-4xl → md:text-5xl   大标题
 *   H2  : text-2xl                  section 标题
 *   H3  : text-lg                   subsubsection
 *   Lead: text-base                 段落引导句
 *   P   : text-sm                   正文
 *   Muted: text-xs                  辅助文案
 */

// ---------- H1 — 大标题 ----------
const h1Variants = cva(
  "font-semibold tracking-tight text-zinc-950 dark:text-zinc-50",
  {
    variants: {
      size: {
        default: "text-4xl md:text-5xl",
        sm: "text-3xl md:text-4xl",
        lg: "text-5xl md:text-6xl",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

export interface H1Props
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof h1Variants> {}

const H1 = React.forwardRef<HTMLHeadingElement, H1Props>(
  ({ className, size, ...props }, ref) => (
    <h1
      ref={ref}
      className={cn(h1Variants({ size }), className)}
      {...props}
    />
  )
);
H1.displayName = "H1";

// ---------- H2 — section 标题 ----------
const h2Variants = cva(
  "font-semibold tracking-tight text-zinc-950 dark:text-zinc-50",
  {
    variants: {
      size: {
        default: "text-2xl",
        sm: "text-xl",
        lg: "text-3xl",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

export interface H2Props
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof h2Variants> {}

const H2 = React.forwardRef<HTMLHeadingElement, H2Props>(
  ({ className, size, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn(h2Variants({ size }), className)}
      {...props}
    />
  )
);
H2.displayName = "H2";

// ---------- H3 — subsubsection ----------
const H3 = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg font-medium text-zinc-950 dark:text-zinc-50", className)}
    {...props}
  />
));
H3.displayName = "H3";

// ---------- P — 正文 ----------
const P = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm leading-relaxed text-zinc-700 dark:text-zinc-300", className)}
    {...props}
  />
));
P.displayName = "P";

// ---------- Lead — 段落引导句 ----------
const Lead = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-base text-zinc-600 dark:text-zinc-400", className)}
    {...props}
  />
));
Lead.displayName = "Lead";

// ---------- Muted — 辅助 / caption ----------
const Muted = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs text-zinc-500 dark:text-zinc-500", className)}
    {...props}
  />
));
Muted.displayName = "Muted";

// ---------- Numeric — 数字(播放 / 点赞),等宽 + tabular-nums ----------
const Numeric = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn("font-mono tabular-nums text-zinc-950 dark:text-zinc-50", className)}
    {...props}
  />
));
Numeric.displayName = "Numeric";

// ---------- Divider — 分割线 ----------
const Divider = React.forwardRef<
  HTMLHRElement,
  React.HTMLAttributes<HTMLHRElement>
>(({ className, ...props }, ref) => (
  <hr
    ref={ref}
    className={cn("border-t border-zinc-200 dark:border-zinc-800", className)}
    {...props}
  />
));
Divider.displayName = "Divider";

export {
  H1,
  H2,
  H3,
  P,
  Lead,
  Muted,
  Numeric,
  Divider,
};
