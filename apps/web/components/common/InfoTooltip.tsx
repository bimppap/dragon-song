"use client";

import type { ReactElement, ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InfoTooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  delayDuration?: number;
  portalContainer?: HTMLElement | null;
}

export default function InfoTooltip({ content, children, side = "top", delayDuration = 0, portalContainer }: InfoTooltipProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} portalContainer={portalContainer}>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
