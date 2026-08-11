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
  const [owned, setOwned] = useState<CharacterSkillNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!faction) {
      setOwned(null);
      return;
    }
    let cancelled = false;
    setError(null);
    fetchCharacterSkillTree(characterId)
      .then((tree) => { if (!cancelled) setOwned(tree.nodes.filter((n) => n.unlocked)); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "기술 조회 실패"); });
    return () => { cancelled = true; };
  }, [characterId, faction]);

  if (!faction) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>보유 기술</CardTitle>
        <CardDescription>
          현재 습득한 기술입니다. 아이콘에 마우스를 올리면 효과를 볼 수 있고, 기술을 클릭하면 기술 탭으로 이동해 강화할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
        )}
        {owned === null ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : owned.length > 0 ? (
          <div className="flex flex-wrap gap-4">
            {owned.map((node) => (
              <InfoTooltip
                key={node.id}
                side="top"
                content={<SkillTooltipContent name={node.display_name} effects={node.effects} />}
              >
                <button
                  type="button"
                  onClick={() => router.push("/battle?tab=skill")}
                  className="flex w-16 cursor-pointer flex-col items-center gap-1.5 text-center"
                >
                  <span className="flex size-14 items-center justify-center rounded-2xl border-2 border-indigo-500 bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100">
                    <Sparkles size={22} />
                  </span>
                  <span className="text-xs font-semibold leading-tight text-slate-700">{node.display_name}</span>
                </button>
              </InfoTooltip>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
            습득한 기술이 없습니다.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
