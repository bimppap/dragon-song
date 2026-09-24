"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props extends Omit<ComponentPropsWithRef<"button">, "children"> {
  /** 무언가 장착·저장된 칸인지. 테두리 기본색을 정한다. */
  filled?: boolean;
  /** 서(書)별 색처럼 장착 여부와 다른 테두리색을 쓸 때. */
  borderClassName?: string;
  /** 눌러서 무언가 열리는 칸이면 손가락 커서를 쓴다. */
  interactive?: boolean;
  /** 칸 안에 그릴 이미지나 아이콘. */
  children: ReactNode;
}

/**
 * 캐릭터 이미지 아래 슬롯 줄(기술·복제·동반자·장신구·특성)의 한 칸.
 * 네 종류가 모두 이 컴포넌트를 써서 칸 크기를 똑같이 맞춘다. 이름은 칸 밑에 적지 않고
 * InfoTooltip 설명에만 두므로, 받은 속성(툴팁 트리거 속성 포함)은 그대로 버튼에 넘긴다.
 */
export default function CharacterSlot({
  filled = false, borderClassName, interactive = false, children, className, ...props
}: Props) {
  return <button
    type="button"
    {...props}
    className={cn("relative flex size-9 shrink-0 items-center justify-center overflow-hidden border-2 bg-gold/10 text-gold transition-colors hover:bg-gold/15 focus-visible:outline-2 focus-visible:outline-gold",
      borderClassName ?? (filled ? "border-gold" : "border-line text-muted"),
      interactive ? "cursor-pointer" : "cursor-default", className)}
  >
    {children}
  </button>;
}
