import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parsePositiveInt(value: string): number {
  return Math.max(0, parseInt(value, 10) || 0);
}

/** Date → "YYYY-MM-DD" (로컬 기준). 날짜 선택 값·API 날짜 파라미터에 공통으로 쓴다. */
export function toDateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** 오늘 날짜의 "YYYY-MM-DD" (로컬 기준). */
export function todayDateValue(): string {
  return toDateValue(new Date());
}

const KST_PARTS_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** ISO 일시 → KST 기준 { date: "YYYY-MM-DD", time: "HH:MM" }. 게임 일정은 브라우저 시간대와 무관하게 KST로 다룬다. */
export function splitKstDateTime(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const parts = Object.fromEntries(KST_PARTS_FORMAT.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** KST 날짜("YYYY-MM-DD")+시각("HH:MM") → 초를 00으로 고정한 ISO 문자열. 날짜가 없으면 null, 시각이 없으면 00:00. */
export function joinKstDateTime(date: string, time: string): string | null {
  if (!date) return null;
  return `${date}T${time || "00:00"}:00+09:00`;
}

/** ISO 일시 → "YYYY.MM.DD HH:MM" (KST). */
export function formatKstDateTime(iso: string): string {
  const { date, time } = splitKstDateTime(iso);
  return `${date.replaceAll("-", ".")} ${time}`;
}
