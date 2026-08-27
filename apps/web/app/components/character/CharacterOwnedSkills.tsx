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

interface Props {
  characterId: number;
}

/** 캐릭터가 4개 서(용맹/불굴/헌신/탐구)를 통틀어 가장 최근에 습득한 기술 1개를 아이콘+이름 타일로 보여준다. */
export default function CharacterOwnedSkills({ characterId }: Props) {
  const router = useRouter();
  const [latestSkill, setLatestSkill] = useState<CharacterSkillNode | null>(null);
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
        const unlockedNodes = trees.flatMap((tree) => tree.nodes.filter((n) => n.unlocked && n.unlocked_at));
        const latest = unlockedNodes.reduce<CharacterSkillNode | null>((best, node) => {
          if (!best || !best.unlocked_at) return node;
          return node.unlocked_at && node.unlocked_at > best.unlocked_at ? node : best;
        }, null);
        setLatestSkill(latest);
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
      ) : latestSkill ? (
        <InfoTooltip
          side="top"
          content={(
            <SkillTooltipContent
              node={latestSkill}
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
                  기술 강화하기
                </Button>
              )}
            />
          )}
        >
          <button
            type="button"
            onClick={goToSkillPage}
            className="flex w-16 cursor-pointer flex-col items-center gap-1.5 text-center"
          >
            <span className="relative flex size-14 items-center justify-center overflow-hidden rounded-2xl border-2 border-gold bg-gold/10 text-gold transition-colors hover:bg-gold/15">
              {latestSkill.image_url ? (
                <Image src={latestSkill.image_url} alt="" fill sizes="56px" className="object-cover" />
              ) : (
                <Sparkles size={22} />
              )}
            </span>
            <span className="text-xs font-semibold leading-tight text-ivory">{latestSkill.display_name}</span>
          </button>
        </InfoTooltip>
      ) : (
        <span className="text-xs text-muted">습득한 기술 없음</span>
      )}
    </div>
  );
}
