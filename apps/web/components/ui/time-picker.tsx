"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Modal from "@/components/common/Modal";
import { cn } from "@/lib/utils";

interface Props {
  /** "HH:MM". 비어있으면 미지정. */
  value: string;
  onChange: (value: string) => void;
  /** 분 선택 간격(분). 기본 5분. */
  minuteStep?: number;
  placeholder?: string;
  className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 사이트 테마에 맞춘 시각 선택 버튼. 브라우저 기본 time input 대체용. */
export default function TimePicker({
  value,
  onChange,
  minuteStep = 5,
  placeholder = "시각 선택",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [hourText, minuteText] = value.split(":");
  const hour = hourText === undefined ? null : Number(hourText);
  const minute = minuteText === undefined ? null : Number(minuteText);
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, index) => index * minuteStep);

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
        <Clock size={14} className="shrink-0 text-muted" />
        <span className="truncate">{value || placeholder}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="시각 선택" className="max-w-xs">
        <div className="space-y-4">
          <p className="text-center font-num text-lg font-semibold text-gold">
            {hour != null && minute != null ? `${pad(hour)}:${pad(minute)}` : "미지정"}
          </p>

          <div className="flex items-end justify-center gap-2">
            <div className="w-24 space-y-1.5">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted">시</span>
              <Select
                value={hour != null ? String(hour) : ""}
                onValueChange={(next) => onChange(`${pad(Number(next))}:${pad(minute ?? 0)}`)}
              >
                <SelectTrigger aria-label="시"><SelectValue placeholder="--" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {HOURS.map((candidate) => (
                      <SelectItem key={candidate} value={String(candidate)}>{pad(candidate)}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <span className="pb-2 text-lg font-semibold text-muted">:</span>

            <div className="w-24 space-y-1.5">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted">분</span>
              <Select
                value={minute != null ? String(minute) : ""}
                onValueChange={(next) => onChange(`${pad(hour ?? 0)}:${pad(Number(next))}`)}
              >
                <SelectTrigger aria-label="분"><SelectValue placeholder="--" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {minutes.map((candidate) => (
                      <SelectItem key={candidate} value={String(candidate)}>{pad(candidate)}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => { onChange(""); setOpen(false); }}>지우기</Button>
            <Button type="button" onClick={() => setOpen(false)}>확인</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
