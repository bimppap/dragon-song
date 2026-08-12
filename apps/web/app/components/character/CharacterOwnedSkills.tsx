"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import InfoTooltip from "@/components/common/InfoTooltip";
import { SkillTooltipContent } from "@/components/skill/SkillTreeGrid";
import { fetchCharacterSkillTree, type CharacterSkillNode } from "@/lib/api";

interface Props {
  characterId: number;
  faction: string | null;
}

/** 캐릭터가 가장 최근에 습득한 기술 1개를 아이콘+이름 타일로 보여준다(클릭 시 기술 탭 이동). */
export default function CharacterOwnedSkills({ characterId, faction }: Props) {
  const router = useRouter();
  const [latestSkill, setLatestSkill] = useState<CharacterSkillNode | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!faction) {
      setLatestSkill(null);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setError(null);
    setLoaded(false);
    fetchCharacterSkillTree(characterId)
      .then((tree) => {
        if (cancelled) return;
        setLatestSkill(tree.nodes.find((n) => n.id === tree.latest_unlocked_node_id) ?? null);
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "기술 조회 실패");
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [characterId, faction]);

  if (!faction) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">기술</span>
      {error ? (
        <span className="text-xs text-red-500">{error}</span>
      ) : !loaded ? (
        <span className="text-xs text-slate-400">불러오는 중...</span>
      ) : latestSkill ? (
        <InfoTooltip
          side="top"
          content={<SkillTooltipContent name={latestSkill.display_name} effects={latestSkill.effects} />}
        >
          <button
            type="button"
            onClick={() => router.push("/battle?tab=skill")}
            className="flex w-16 cursor-pointer flex-col items-center gap-1.5 text-center"
          >
            <span className="flex size-14 items-center justify-center overflow-hidden rounded-2xl border-2 border-indigo-500 bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100">
              {latestSkill.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={latestSkill.image_url} alt="" className="size-full object-cover" />
              ) : (
                <Sparkles size={22} />
              )}
            </span>
            <span className="text-xs font-semibold leading-tight text-slate-700">{latestSkill.display_name}</span>
          </button>
        </InfoTooltip>
      ) : (
        <span className="text-xs text-slate-400">습득한 기술 없음</span>
      )}
    </div>
  );
}
