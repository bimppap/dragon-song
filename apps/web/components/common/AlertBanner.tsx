import { cn } from "@/lib/utils";

const TONES = {
  error: "border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
} as const;

interface Props {
  children: React.ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}

/** 페이지 상단 등에 쓰는 공통 알림 배너. */
export default function AlertBanner({ children, tone = "error", className }: Props) {
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm", TONES[tone], className)}>{children}</div>
  );
}
