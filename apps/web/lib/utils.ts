import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parsePositiveInt(value: string): number {
  return Math.max(0, parseInt(value, 10) || 0);
}
