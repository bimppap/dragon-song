import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:     "bg-primary text-ivory hover:bg-primary-light",
        cta:         "bg-gold text-base hover:bg-gold/90",
        destructive: "bg-red-600 text-ivory hover:bg-red-500",
        outline:     "border border-line bg-surface text-ivory hover:bg-primary/30 hover:border-primary-light",
        secondary:   "bg-primary-light/25 text-ivory hover:bg-primary-light/40",
        ghost:       "text-ivory/85 hover:bg-primary-light/20 hover:text-ivory",
        link:        "text-gold underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-5 py-2",
        sm:      "h-8 px-4 py-1.5 text-xs",
        lg:      "h-11 px-7 text-base",
        icon:    "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
