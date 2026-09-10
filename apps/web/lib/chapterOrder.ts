import { ALWAYS_CHALLENGE_CHAPTER } from "@/lib/api";
import type { Chapter } from "@/lib/api";

/** 항목에 실제로 사용된 챕터 이름을 시작일 최신순으로 정렬하고, 삭제된 레거시 챕터는 원래 순서로 뒤에 둔다.
 *  "상시"는 챕터 테이블에 없어 날짜로 줄 세울 수 없는데, 언제든 유효한 항목이라 맨 앞에 고정한다. */
export function orderChapterNamesLatestFirst(names: string[], chapters: Chapter[]): string[] {
  const uniqueNames = [...new Set(names)];
  const startDateByName = new Map(chapters.map((chapter) => [chapter.name, chapter.start_date]));
  return uniqueNames.toSorted((left, right) => {
    if (left === ALWAYS_CHALLENGE_CHAPTER) return -1;
    if (right === ALWAYS_CHALLENGE_CHAPTER) return 1;
    const leftDate = startDateByName.get(left);
    const rightDate = startDateByName.get(right);
    if (leftDate && rightDate) return rightDate.localeCompare(leftDate);
    if (leftDate) return -1;
    if (rightDate) return 1;
    return 0;
  });
}
