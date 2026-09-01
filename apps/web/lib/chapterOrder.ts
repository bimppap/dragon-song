import type { Chapter } from "@/lib/api";

/** 항목에 실제로 사용된 챕터 이름을 시작일 최신순으로 정렬하고, 삭제된 레거시 챕터는 원래 순서로 뒤에 둔다. */
export function orderChapterNamesLatestFirst(names: string[], chapters: Chapter[]): string[] {
  const uniqueNames = [...new Set(names)];
  const startDateByName = new Map(chapters.map((chapter) => [chapter.name, chapter.start_date]));
  return uniqueNames.toSorted((left, right) => {
    const leftDate = startDateByName.get(left);
    const rightDate = startDateByName.get(right);
    if (leftDate && rightDate) return rightDate.localeCompare(leftDate);
    if (leftDate) return -1;
    if (rightDate) return 1;
    return 0;
  });
}
