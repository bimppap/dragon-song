"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import InfoTooltip from "@/components/common/InfoTooltip";
import { SkillTooltipContent } from "@/components/skill/SkillTreeGrid";
import { fetchCharacterSkillTree, type CharacterSkillNode } from "@/lib/api";

interface Props {
  characterId: number;
  faction: string | null;
}

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
        // 가장 나중에 얻은 기술 한 개만 노출한다.
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
    <Card>
      <CardHeader>
        <CardTitle>보유 기술</CardTitle>
        <CardDescription>
          가장 최근에 습득한 기술입니다. 아이콘에 마우스를 올리면 효과를 볼 수 있고, 기술을 클릭하면 기술 탭으로 이동해 강화할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
        )}
        {!loaded ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
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
              <span className="flex size-14 items-center justify-center rounded-2xl border-2 border-indigo-500 bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100">
                <Sparkles size={22} />
              </span>
              <span className="text-xs font-semibold leading-tight text-slate-700">{latestSkill.display_name}</span>
            </button>
          </InfoTooltip>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
            습득한 기술이 없습니다.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
