"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/** react-day-picker v9의 표 구조에 맞춘 픽셀 월간 캘린더. */
export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return <DayPicker
    showOutsideDays={showOutsideDays}
    className={cn("pixel-calendar w-full", className)}
    classNames={{
      root: "w-full",
      months: "flex w-full flex-col",
      month: "w-full",
      month_caption: "relative flex h-7 items-center justify-center border-b border-line",
      caption_label: "font-pixel-sm text-xs font-semibold tracking-[0.16em] text-gold",
      nav: "absolute left-0 top-0 flex gap-0.5",
      button_previous: cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-5 p-0 text-muted hover:text-gold"),
      button_next: cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-5 p-0 text-muted hover:text-gold"),
      month_grid: "w-full table-fixed border-separate border-spacing-0.5",
      weekdays: "",
      weekday: "h-4 text-[9px] font-semibold text-muted",
      weeks: "",
      week: "",
      day: "h-5 p-0 text-center text-[10px]",
      day_button: "size-full border border-line bg-inset p-0 text-[10px] font-normal text-ivory shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-ground)_75%,transparent)] hover:border-gold/60 hover:bg-primary/50",
      outside: "opacity-35",
      today: "text-gold font-semibold",
      disabled: "text-muted opacity-50",
      hidden: "invisible",
      ...classNames,
    }}
    components={{
      Chevron: ({ orientation, ...iconProps }) => orientation === "left"
        ? <ChevronLeft size={16} {...iconProps} />
        : <ChevronRight size={16} {...iconProps} />,
    }}
    {...props}
  />;
}
