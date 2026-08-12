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
        "rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}
