"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import InfoTooltip from "@/components/common/InfoTooltip";
import type { Chapter } from "@/lib/api";

const COLORS = ["bg-primary-light", "bg-gold text-ground", "bg-primary"];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function atMidnight(value: string) { return new Date(`${value}T00:00:00`); }
function monthStart(value: Date) { return new Date(value.getFullYear(), value.getMonth(), 1); }
function plusMonths(value: Date, amount: number) { return new Date(value.getFullYear(), value.getMonth() + amount, 1); }
function keyOf(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function sameDay(a: Date, b: Date) { return keyOf(a) === keyOf(b); }

interface Bar { chapter: Chapter; row: number; start: number; end: number; lane: number; }

export default function HomeChapterCalendar({ chapters, initialMonth }: { chapters: Chapter[]; initialMonth: Date }) {
  const [month, setMonth] = useState(() => monthStart(initialMonth));
  const { days, bars } = useMemo(() => {
    const first = monthStart(month);
    const gridStart = new Date(first); gridStart.setDate(1 - first.getDay());
    const gridEnd = new Date(gridStart); gridEnd.setDate(gridStart.getDate() + 41);
    const nextDays = Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setDate(day.getDate() + index); return day; });
    const lanes = Array.from({ length: 6 }, () => [false, false, false]);
    const nextBars: Bar[] = [];
    for (const chapter of chapters) {
      const start = atMidnight(chapter.start_date); const end = atMidnight(chapter.end_date);
      const visibleStart = start > gridStart ? start : gridStart;
      const visibleEnd = end < gridEnd ? end : gridEnd;
      if (visibleStart > visibleEnd) continue;
      let cursor = new Date(visibleStart);
      while (cursor <= visibleEnd) {
        const row = Math.floor((cursor.getTime() - gridStart.getTime()) / 86_400_000 / 7);
        const startIndex = Math.round((cursor.getTime() - gridStart.getTime()) / 86_400_000);
        const weekEnd = new Date(cursor); weekEnd.setDate(cursor.getDate() + (6 - cursor.getDay()));
        const segmentEnd = weekEnd < visibleEnd ? weekEnd : visibleEnd;
        const endIndex = Math.round((segmentEnd.getTime() - gridStart.getTime()) / 86_400_000);
        const lane = lanes[row].findIndex((used) => !used);
        if (lane >= 0) lanes[row][lane] = true;
        nextBars.push({ chapter, row, start: startIndex % 7, end: endIndex % 7, lane: Math.max(lane, 0) });
        cursor = new Date(segmentEnd); cursor.setDate(cursor.getDate() + 1);
      }
    }
    return { days: nextDays, bars: nextBars };
  }, [chapters, month]);

  return <div className="w-full">
    <div className="relative flex h-6 items-center justify-center border-b border-line">
      <div className="absolute left-0 flex gap-0.5"><button type="button" onClick={() => setMonth((value) => plusMonths(value, -1))} className="p-0.5 text-muted hover:text-gold" aria-label="이전 달"><ChevronLeft size={12} /></button><button type="button" onClick={() => setMonth((value) => plusMonths(value, 1))} className="p-0.5 text-muted hover:text-gold" aria-label="다음 달"><ChevronRight size={12} /></button></div>
      <span className="font-pixel-sm text-[10px] font-semibold tracking-[0.16em] text-gold">{month.getFullYear()}.{String(month.getMonth() + 1).padStart(2, "0")}</span>
    </div>
    <div className="grid grid-cols-7 border-b border-line">{WEEKDAYS.map((weekday) => <div key={weekday} className="py-0.5 text-center text-[8px] font-semibold text-muted">{weekday}</div>)}</div>
    <div className="relative grid h-42 grid-cols-7 grid-rows-6 border-l border-t border-line">
      {days.map((day) => <div key={keyOf(day)} className="relative min-h-0 border-b border-r border-line bg-inset/50 px-0.5 pt-px text-[8px] text-muted"><span className={sameDay(day, new Date()) ? "text-gold" : day.getMonth() === month.getMonth() ? "text-ivory" : "opacity-40"}>{day.getDate()}</span></div>)}
      {bars.map((bar, index) => <InfoTooltip key={`${bar.chapter.id}-${index}`} content={<span>{bar.chapter.name} · {bar.chapter.start_date} ~ {bar.chapter.end_date}</span>}><button type="button" className={`z-10 mx-px h-2 self-start truncate rounded-sm px-0.5 text-center text-[7px] font-semibold leading-2 shadow-sm hover:brightness-125 ${COLORS[bar.chapter.id % COLORS.length]}`} style={{ gridColumn: `${bar.start + 1} / ${bar.end + 2}`, gridRow: bar.row + 1, marginTop: `${10 + bar.lane * 8}px` }}>{bar.chapter.name}</button></InfoTooltip>)}
    </div>
  </div>;
}
