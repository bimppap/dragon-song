"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import InfoTooltip from "@/components/common/InfoTooltip";
import { SkillTooltipContent } from "@/components/skill/SkillTreeGrid";
import { Button } from "@/components/ui/button";
import { fetchCharacterSkillTree, type CharacterSkillNode, type SkillBook } from "@/lib/api";

const BOOKS: SkillBook[] = ["용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"];
const BOOK_BORDER_CLASS: Record<SkillBook, string> = {
  "용맹의 서": "border-red-500",
  "불굴의 서": "border-blue-500",
  "헌신의 서": "border-green-500",
  "탐구의 서": "border-purple-500",
};

interface Props {
  characterId: number;
}

/** 4개 서마다 습득 단계가 가장 높은 기술을 하나씩 보여주며, 습득 기술이 없으면 루트 노드를 보여준다. */
export default function CharacterOwnedSkills({ characterId }: Props) {
  const router = useRouter();
  const [skills, setSkills] = useState<CharacterSkillNode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goToSkillPage() {
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
        const displayedSkills = trees.flatMap((tree) => {
          const unlocked = tree.nodes
            .filter((node) => node.is_public && node.unlocked && node.tier > 0)
            .toSorted((a, b) => {
              if (a.tier !== b.tier) return b.tier - a.tier;
              return (b.unlocked_at ?? "").localeCompare(a.unlocked_at ?? "");
            });
          const root = tree.nodes.find((node) => node.is_public && node.tier === 0);
          return unlocked[0] ? [unlocked[0]] : root ? [root] : [];
        });
        setSkills(displayedSkills);
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
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">기술</span>
      {error ? (
        <span className="text-xs text-red-500">{error}</span>
      ) : !loaded ? (
        <span className="text-xs text-muted">불러오는 중...</span>
      ) : (
        <div className="grid grid-cols-4 gap-1">
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
                    footer={(
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
                  onClick={goToSkillPage}
                  className="flex min-w-0 cursor-pointer flex-col items-center gap-1 text-center"
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
