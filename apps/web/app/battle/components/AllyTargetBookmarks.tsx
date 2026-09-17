"use client";

import CharacterAvatar from "@/components/common/CharacterAvatar";
import InfoTooltip from "@/components/common/InfoTooltip";
import { QuotedDescription } from "@/components/skill/SkillTreeGrid";
import { skillBookAccent } from "@/components/skill/bookAccent";
import type { SkillBook } from "@/lib/api";

export interface AllyTargetBookmark {
  key: string;
  casterName: string;
  name: string;
  imageUrl?: string | null;
  description?: string | null;
  /** 커스텀 설명의 강조색을 정하지 않았을 때 쓸 서(book)별 기본색. */
  book?: SkillBook | null;
  /** 러너가 직접 쓴 기술 설명(과 따옴표 강조색). 원본 설명과 함께 보여준다. */
  customDescription?: string | null;
  customDescriptionColor?: string | null;
  pending?: boolean;
}

/** DOM 순서로 겹치고, hover/focus 동안만 해당 북마크를 앞으로 올린다. */
export default function AllyTargetBookmarks({ items }: { items: AllyTargetBookmark[] }) {
  if (!items.length) return null;
  return (
    <div className="absolute -top-12 left-3 isolate flex [&>button+button]:-ml-2" aria-label="아군 지원">
      {items.map((item) => (
        <InfoTooltip key={item.key} content={
          <div className="max-w-64 text-left">
            <p className="font-semibold">{item.casterName} · {item.name}</p>
            <p className="text-xs text-muted">{item.pending ? "행동 선택 중" : "효과 적용 중"}</p>
            {item.description && <p className="mt-1 whitespace-pre-line">{item.description}</p>}
            {item.customDescription && (
              <p className="mt-1 whitespace-pre-line border-t border-line pt-1 text-ivory/85">
                <QuotedDescription text={item.customDescription} color={item.customDescriptionColor} accent={skillBookAccent(item.book)} />
              </p>
            )}
          </div>
        }>
          <button type="button" aria-label={`${item.casterName}의 ${item.name}`} className="relative h-14 w-11 shrink-0 cursor-help hover:z-10 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-gold">
            <span className="absolute inset-0 bg-gold [clip-path:polygon(0_0,100%_0,100%_72%,50%_100%,0_72%)]" />
            <span className="absolute inset-[2px] bg-primary [clip-path:polygon(0_0,100%_0,100%_72%,50%_100%,0_72%)]" />
            <CharacterAvatar src={item.imageUrl ?? null} alt={item.name} className="absolute left-1.5 top-1.5 size-8 rounded-none" iconSize={20} sizes="32px" />
          </button>
        </InfoTooltip>
      ))}
    </div>
  );
}
