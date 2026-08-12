import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  className?: string;
}

/** 목록이 비었거나 로딩 중일 때 쓰는 공통 점선 플레이스홀더. */
export default function EmptyState({ children, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400",
        className,
      )}
    >
      {children}
    </div>
  );
}
