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
