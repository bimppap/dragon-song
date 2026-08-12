import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:     "bg-indigo-600 text-white",
        secondary:   "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200",
        destructive: "bg-red-50 text-red-600",
        success:     "bg-green-50 text-green-700",
        warning:     "bg-yellow-50 text-yellow-700",
        outline:     "border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
