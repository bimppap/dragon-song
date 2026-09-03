"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import Modal from "@/components/common/Modal";
import { cn, toDateValue } from "@/lib/utils";

interface Props {
  /** "YYYY-MM-DD" (로컬 기준) 또는 비어있으면 null. */
  value: string | null;
  onChange: (value: string) => void;
  minDate?: Date;
  maxDate?: Date;
  /** 선택 불가한 날짜들 ("YYYY-MM-DD"). */
  disabledDates?: string[];
  placeholder?: string;
  className?: string;
}

function parseDateValue(value: string | null): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatDisplay(value: string | null): string {
  const date = parseDateValue(value);
  if (!date) return "";
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/** 사이트 픽셀 테마 캘린더(`Calendar`)를 붙인 날짜 선택 버튼. 브라우저 기본 date input 대체용. */
export default function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  disabledDates,
  placeholder = "날짜 선택",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const disabledSet = disabledDates ? new Set(disabledDates) : null;
  const selected = parseDateValue(value);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm text-ivory transition",
          "hover:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent",
          !value && "text-muted",
          className,
        )}
      >
        <CalendarDays size={14} className="shrink-0 text-muted" />
        <span className="truncate">{value ? formatDisplay(value) : placeholder}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="날짜 선택" className="max-w-xs">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? minDate}
          onSelect={(date) => {
            if (!date) return;
            onChange(toDateValue(date));
            setOpen(false);
          }}
          disabled={(date) => {
            if (minDate && date < minDate) return true;
            if (maxDate && date > maxDate) return true;
            if (disabledSet && disabledSet.has(toDateValue(date))) return true;
            return false;
          }}
        />
      </Modal>
    </>
  );
}
