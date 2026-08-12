import { cn } from "@/lib/utils";

const TONES = {
  error: "border-red-500/40 bg-red-500/15 text-red-600",
  success: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  warning: "border-gold bg-gold/10 text-gold",
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
