import type { SkillBook } from "@/lib/api";

export interface BookAccent {
  /** 노드 이름표·타이틀 텍스트 색상 클래스. */
  text: string;
  /** 노드 테두리 색상 클래스(텍스트 클래스와 함께 조합). */
  border: string;
  /** 미획득 상태의 연결선 색(SVG stroke). */
  line: string;
  /** 타겟팅 배지의 바깥(테두리) 색. 안쪽보다 밝게 두어 같은 계열에서도 구분된다. */
  badgeEdge: string;
  /** 타겟팅 배지의 안쪽(배경) 색. */
  badgeFill: string;
}

/** 서(book)별 테마 색상. 순서: 용맹(빨강)·불굴(파랑)·헌신(초록)·탐구(보라). */
export const BOOK_ACCENT: Record<SkillBook, BookAccent> = {
  "용맹의 서": { text: "text-red-400", border: "border-red-500/60 text-red-400", line: "#f87171", badgeEdge: "bg-red-400", badgeFill: "bg-red-950" },
  "불굴의 서": { text: "text-blue-400", border: "border-blue-500/60 text-blue-400", line: "#60a5fa", badgeEdge: "bg-blue-400", badgeFill: "bg-blue-950" },
  "헌신의 서": { text: "text-green-400", border: "border-green-500/60 text-green-400", line: "#4ade80", badgeEdge: "bg-green-400", badgeFill: "bg-green-950" },
  "탐구의 서": { text: "text-purple-400", border: "border-purple-500/60 text-purple-400", line: "#c084fc", badgeEdge: "bg-purple-400", badgeFill: "bg-purple-950" },
};

/** 서를 알 수 없을 때(전투 툴팁 등) 쓰는 기본 강조색. */
export const DEFAULT_BOOK_ACCENT: BookAccent = {
  text: "text-gold", border: "border-gold/60 text-gold", line: "#e8c936", badgeEdge: "bg-gold", badgeFill: "bg-primary",
};

export function skillBookAccent(book: SkillBook | null | undefined): BookAccent {
  return (book && BOOK_ACCENT[book]) || DEFAULT_BOOK_ACCENT;
}
