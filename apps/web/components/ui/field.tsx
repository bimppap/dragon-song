import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-4", className)} {...props} />;
}

export function Field({ className, ...props }: ComponentProps<"div">) {
  return <div role="group" className={cn("flex flex-col gap-1.5 data-[disabled=true]:opacity-60", className)} {...props} />;
}

export function FieldLabel({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-xs font-semibold text-muted", className)} {...props} />;
}
