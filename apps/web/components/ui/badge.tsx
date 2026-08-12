import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "font-pixel-sm inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:     "border border-gold/50 bg-gold/15 text-gold",
        secondary:   "bg-primary-light/25 text-ivory",
        destructive: "bg-red-500/15 text-red-300",
        success:     "bg-emerald-500/15 text-emerald-300",
        warning:     "bg-gold/15 text-gold",
        outline:     "border border-line text-ivory/85",
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
