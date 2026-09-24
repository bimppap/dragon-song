"use client";

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
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

/**
 * 커서를 올렸을 때뿐 아니라 눌렀을 때도 열리는 설명 풍선.
 * Radix는 트리거를 누르면 닫기만 하고 터치 기기에서는 아예 열지 않으므로, 열림 상태를 직접 들고
 * 누를 때마다 뒤집는다. 누른 뒤 이어지는 pointerdown·click에서 Radix가 보내는 닫기 요청은,
 * 그 클릭이 끝날 때까지(window의 click을 지나갈 때까지) 무시한다.
 */
export default function InfoTooltip({ content, children, side = "top", delayDuration = 0, portalContainer }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const togglingRef = useRef(false);
  const releaseRef = useRef<(() => void) | null>(null);

  useEffect(() => () => releaseRef.current?.(), []);

  function handlePointerDown() {
    setOpen((previous) => !previous);
    releaseRef.current?.();
    togglingRef.current = true;
    // click이 오지 않는 경우(누른 채 밖으로 끌고 나간 경우)를 대비해 시간제한도 함께 둔다.
    const timer = window.setTimeout(() => releaseRef.current?.(), 500);
    const release = () => {
      togglingRef.current = false;
      releaseRef.current = null;
      window.clearTimeout(timer);
      window.removeEventListener("click", release);
    };
    releaseRef.current = release;
    window.addEventListener("click", release);
  }

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip open={open} onOpenChange={(next) => { if (next || !togglingRef.current) setOpen(next); }}>
        <TooltipTrigger asChild onPointerDown={handlePointerDown}>{children}</TooltipTrigger>
        <TooltipContent side={side} portalContainer={portalContainer}
          onPointerDownOutside={() => { if (!togglingRef.current) setOpen(false); }}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
