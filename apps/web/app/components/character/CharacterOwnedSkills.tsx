"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import InfoTooltip from "@/components/common/InfoTooltip";
import { SkillTooltipContent } from "@/components/skill/SkillTreeGrid";
import { BOOK_ACCENT } from "@/components/skill/bookAccent";
import { Button } from "@/components/ui/button";
import { fetchCharacterSkillTree, type CharacterSkillNode, type SkillBook } from "@/lib/api";
import { cn } from "@/lib/utils";

import { deepestLearnedSkill } from "@/lib/skillProgression";

const BOOKS: SkillBook[] = ["용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"];
const BOOK_BORDER_CLASS: Record<SkillBook, string> = {
  "용맹의 서": "border-red-500",
  "불굴의 서": "border-blue-500",
  "헌신의 서": "border-green-500",
  "탐구의 서": "border-purple-500",
};

interface Props {
  characterId: number;
  /** 다른 러너의 캐릭터를 열람할 때: 기술트리 편집 페이지로 이동하지 않고 정보만 보여준다. */
  readOnly?: boolean;
}

/** 서와 무관하게 가장 깊이 습득한 기술을 한 슬롯에 보여준다. */
export default function CharacterOwnedSkills({ characterId, readOnly = false }: Props) {
  const router = useRouter();
  const [skills, setSkills] = useState<CharacterSkillNode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goToSkillPage() {
    if (readOnly) return;
    router.push("/skill");
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      setLoaded(false);
      try {
        const trees = await Promise.all(BOOKS.map((b) => fetchCharacterSkillTree(characterId, b)));
        if (cancelled) return;
        const deepest = deepestLearnedSkill(trees.flatMap((tree) => tree.nodes));
        setSkills(deepest ? [deepest] : []);
        setLoaded(true);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "기술 조회 실패");
        setLoaded(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [characterId]);

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <span className="text-xs text-red-500">{error}</span>
      ) : !loaded ? (
        <span className="text-xs text-muted">불러오는 중...</span>
      ) : (
        <div className="flex gap-1">
          {skills.length === 0 && !readOnly && (
            <button
              type="button"
              onClick={goToSkillPage}
              aria-label="기술 배우기"
              className="flex cursor-pointer flex-col items-center gap-1 text-center"
            >
              <span className="flex size-9 items-center justify-center border-2 border-line bg-gold/10 text-gold hover:bg-gold/15">
                <Sparkles size={17} />
              </span>
              <span className="text-[9px] font-semibold text-muted">기술 배우기</span>
            </button>
          )}
          {skills.map((skill) => {
            const isOwned = skill.unlocked && skill.tier > 0;
            return (
              <InfoTooltip
                key={skill.book}
                side="top"
                content={(
                  <SkillTooltipContent
                    node={skill}
                    variant="runner"
                    accent={BOOK_ACCENT[skill.book]}
                    footer={readOnly ? undefined : (
                      <Button
                        type="button"
                        size="sm"
                        variant="cta"
                        className="w-full"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          goToSkillPage();
                        }}
                      >
                        {isOwned ? "기술 강화하기" : "기술 배우기"}
                      </Button>
                    )}
                  />
                )}
              >
                <button
                  type="button"
                  aria-label={readOnly ? skill.display_name : `${skill.display_name} · 기술트리 열기`}
                  onClick={goToSkillPage}
                  className={cn("flex min-w-0 flex-col items-center gap-1 text-center", readOnly ? "cursor-default" : "cursor-pointer")}
                >
                  <span className={`relative flex size-9 items-center justify-center overflow-hidden border-2 bg-gold/10 text-gold transition-colors hover:bg-gold/15 ${BOOK_BORDER_CLASS[skill.book]}`}>
                    {skill.image_url ? (
                      <Image src={skill.image_url} alt="" fill sizes="36px" className="object-cover" />
                    ) : (
                      <Sparkles size={17} />
                    )}
                  </span>
                  {skill.tier > 0 ? (
                    <span className="line-clamp-2 text-[9px] font-semibold leading-tight text-ivory">{skill.display_name}</span>
                  ) : null}
                </button>
              </InfoTooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}
