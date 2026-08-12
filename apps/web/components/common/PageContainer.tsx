import { cn } from "@/lib/utils";

const MAX_WIDTHS = {
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
} as const;

interface Props {
  children: React.ReactNode;
  /** 컨테이너 최대 너비 (기본 6xl). */
  max?: keyof typeof MAX_WIDTHS;
  className?: string;
}

/** 페이지 공통 래퍼: 모바일은 여백을 줄이고, 데스크톱에서 넓힌다. */
export default function PageContainer({ children, max = "6xl", className }: Props) {
  return (
    <main className={cn("mx-auto w-full px-4 pb-6 pt-20 sm:px-6 sm:pb-10 sm:pt-20", MAX_WIDTHS[max], className)}>
      {children}
    </main>
  );
}
