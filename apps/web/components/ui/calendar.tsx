"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-4",
        caption: "flex justify-center pt-1 relative items-center w-full",
        caption_label: "text-sm font-semibold text-ivory",
        nav: "flex items-center gap-1",
        nav_button: cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        chevron: "size-4",
        table: "w-full border-collapse space-x-1",
        head_row: "flex",
        head_cell: "text-muted rounded-md w-9 font-normal text-xs",
        row: "flex w-full mt-2",
        cell: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-gold/10 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
          "[&:has([aria-selected].day-range-end)]:rounded-r-md",
          "[&:has([aria-selected].day-outside)]:bg-gold/10/50"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected:
          "bg-gold text-ivory hover:bg-gold hover:text-ivory focus:bg-gold focus:text-ivory rounded-md",
        day_today: "bg-primary-light/20 text-ivory font-semibold",
        day_outside:
          "day-outside text-muted aria-selected:bg-gold/10/50 aria-selected:text-muted",
        day_disabled: "text-muted opacity-50",
        day_range_middle:
          "aria-selected:bg-gold/10 aria-selected:text-ivory",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...props }) =>
          orientation === "left" ? (
            <ChevronLeft size={16} {...props} />
          ) : orientation === "right" ? (
            <ChevronRight size={16} {...props} />
          ) : (
            <ChevronDown size={16} {...props} />
          ),
      }}
      {...props}
    />
  );
}
