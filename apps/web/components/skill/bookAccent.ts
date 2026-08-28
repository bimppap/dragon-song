import type { SkillBook } from "@/lib/api";

export interface BookAccent {
  /** 노드 이름표·타이틀 텍스트 색상 클래스. */
  text: string;
  /** 노드 테두리 색상 클래스(텍스트 클래스와 함께 조합). */
  border: string;
  /** 미획득 상태의 연결선 색(SVG stroke). */
  line: string;
}

/** 서(book)별 테마 색상. 순서: 용맹(빨강)·불굴(파랑)·헌신(초록)·탐구(보라). */
export const BOOK_ACCENT: Record<SkillBook, BookAccent> = {
  "용맹의 서": { text: "text-red-400", border: "border-red-500/60 text-red-400", line: "#f87171" },
  "불굴의 서": { text: "text-blue-400", border: "border-blue-500/60 text-blue-400", line: "#60a5fa" },
  "헌신의 서": { text: "text-green-400", border: "border-green-500/60 text-green-400", line: "#4ade80" },
  "탐구의 서": { text: "text-purple-400", border: "border-purple-500/60 text-purple-400", line: "#c084fc" },
};
