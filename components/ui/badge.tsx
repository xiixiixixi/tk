import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
  {
    variants: {
      variant: {
        default: "bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900",
        secondary: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
        destructive: "bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900",
        outline: "border border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300",
        ikb: "bg-[hsl(var(--color-ikb))] text-white",
        lemon: "bg-[hsl(var(--color-lemon))] text-neutral-900",
        orange: "bg-[hsl(var(--color-orange))] text-white",
        lime: "bg-[hsl(var(--color-lime))] text-neutral-900",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
