import * as React from "react";
import { cn } from "@/lib/utils";

const H1 = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h1 ref={ref} className={cn("text-2xl font-medium tracking-tight text-neutral-900 dark:text-neutral-100", className)} {...props} />
  )
);
H1.displayName = "H1";

const H2 = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} className={cn("text-lg font-medium tracking-tight text-neutral-900 dark:text-neutral-100", className)} {...props} />
  )
);
H2.displayName = "H2";

const H3 = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-sm font-medium text-neutral-900 dark:text-neutral-100", className)} {...props} />
  )
);
H3.displayName = "H3";

const P = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm leading-relaxed text-neutral-600 dark:text-neutral-400", className)} {...props} />
  )
);
P.displayName = "P";

const Lead = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-neutral-500 dark:text-neutral-500", className)} {...props} />
  )
);
Lead.displayName = "Lead";

const Muted = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-xs text-neutral-400 dark:text-neutral-500", className)} {...props} />
  )
);
Muted.displayName = "Muted";

const Numeric = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span ref={ref} className={cn("font-mono text-xs tabular-nums text-neutral-900 dark:text-neutral-100", className)} {...props} />
  )
);
Numeric.displayName = "Numeric";

const Divider = React.forwardRef<HTMLHRElement, React.HTMLAttributes<HTMLHRElement>>(
  ({ className, ...props }, ref) => (
    <hr ref={ref} className={cn("border-t border-neutral-100 dark:border-neutral-800", className)} {...props} />
  )
);
Divider.displayName = "Divider";

export { H1, H2, H3, P, Lead, Muted, Numeric, Divider };
