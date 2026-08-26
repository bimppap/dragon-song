"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import SkillTreeGrid from "@/components/skill/SkillTreeGrid";
import {
  fetchCharacterSkillTree,
  fetchSkillNodes,
  formatEffect,
  renameCharacterSkill,
  unlockCharacterSkill,
  type CharacterSkillNode,
  type CharacterSkillTree,
  type Faction,
  type SkillNode,
} from "@/lib/api";
import AlertBanner from "@/components/common/AlertBanner";
import { useDialog } from "@/components/common/DialogProvider";

const FACTIONS: Faction[] = ["공격", "수비", "치유"];
const numberFormatter = new Intl.NumberFormat("ko-KR");

interface Props {
  characterId: number;
}

export default function MySkillTree({ characterId }: Props) {
  const { confirm, prompt } = useDialog();
  const [tree, setTree] = useState<CharacterSkillTree | null>(null);
  const [otherNodes, setOtherNodes] = useState<Record<string, SkillNode[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyNodeId, setBusyNodeId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchCharacterSkillTree(characterId);
        if (cancelled) return;
        setTree(data);
        const others = FACTIONS.filter((f) => f !== data.faction);
        const lists = await Promise.all(others.map((f) => fetchSkillNodes(f)));
        if (cancelled) return;
        setOtherNodes(Object.fromEntries(others.map((f, i) => [f, lists[i]])));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "기술트리 조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [characterId]);

  async function handleUnlock(node: CharacterSkillNode) {
    setBusyNodeId(node.id);
    setError(null);
    try {
      setTree(await unlockCharacterSkill(characterId, node.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "기술 강화 실패");
    } finally {
      setBusyNodeId(null);
    }
  }

  async function renameNode(node: CharacterSkillNode) {
    const nextName = await prompt(
      { title: "기술 이름 수정", description: "새로운 기술 이름을 입력해 주세요." },
      node.custom_name ?? node.default_name,
    );
    if (nextName === null) return;
    setBusyNodeId(node.id);
    setError(null);
    try {
      setTree(await renameCharacterSkill(characterId, node.id, nextName));
    } catch (e) {
      setError(e instanceof Error ? e.message : "기술 이름 설정 실패");
    } finally {
      setBusyNodeId(null);
    }
  }

  function canUnlock(node: CharacterSkillNode): boolean {
    if (!tree || node.unlocked || node.tier === 0 || tree.character_ap < tree.ap_cost_to_unlock) return false;
    if (node.tier === 1) {
      return !tree.nodes.some((candidate) => candidate.unlocked && candidate.tier === 1 && candidate.branch !== node.branch);
    }
    const parentUnlocked = tree.nodes.some((candidate) =>
      candidate.unlocked
      && candidate.branch === node.branch
      && candidate.tier === node.tier - 1
      && (node.tier === 2 || candidate.col === node.col),
    );
    if (!parentUnlocked) return false;
    return !tree.nodes.some((candidate) =>
      candidate.unlocked && candidate.branch === node.branch && candidate.tier >= 2 && candidate.col !== node.col,
    );
  }

  async function handleNodeClick(node: CharacterSkillNode) {
    if (node.unlocked) {
      await renameNode(node);
      return;
    }
    if (!canUnlock(node)) return;
    const effectDescription = node.effects.length > 0 ? node.effects.map(formatEffect).join(", ") : "효과 없음";
    const accepted = await confirm({
      title: "기술 선택",
      description: `정말 '${node.display_name}'을 선택하시겠습니까?\n${effectDescription}`,
    });
    if (accepted) await handleUnlock(node);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-ivory">기술트리</h2>
          <p className="text-sm text-muted">
            {tree ? `내 진영은 ${tree.faction}입니다. ` : ""}
            내 진영 기술트리는 다음 단계를 눌러 AP로 강화하거나 습득한 기술을 눌러 이름을 바꿀 수 있고, 다른 진영 트리는
            참고용으로 확인만 할 수 있습니다. 1분기(계열)와 2분기(세부 경로)에서는 각각 하나만 선택할 수 있습니다.
          </p>
        </div>
        {tree && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-num">보유 AP {numberFormatter.format(tree.character_ap)}</Badge>
            <Badge variant="secondary" className="font-num">강화 비용 {numberFormatter.format(tree.ap_cost_to_unlock)} AP</Badge>
          </div>
        )}
      </div>

      {error && (
        <AlertBanner>{error}</AlertBanner>
      )}

      {loading || !tree ? (
        <p className="text-sm text-muted">불러오는 중...</p>
      ) : (
        <div className="no-scrollbar overflow-x-auto pb-2"><div className="mx-auto flex w-max gap-6">
          {FACTIONS.map((faction) => {
            const isOwn = faction === tree.faction;
            return (
              <div key={faction} className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-ivory">{faction} 계열</h3>
                  {isOwn ? (
                    <Badge className="text-[10px]">내 진영</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted">참고용</Badge>
                  )}
                </div>
                <div className={isOwn ? "rounded-xl border border-gold bg-surface p-4" : "rounded-xl border border-line bg-inset/60 p-4"}>
                  {isOwn ? (
                    <SkillTreeGrid
                      nodes={tree.nodes}
                      getLabel={(n) => n.display_name}
                      isHighlighted={(n) => n.unlocked}
                      isDisabled={(node) => busyNodeId !== null || (!node.unlocked && !canUnlock(node))}
                      onNodeClick={handleNodeClick}
                      showLabels={false}
                    />
                  ) : (
                    <SkillTreeGrid nodes={otherNodes[faction] ?? []} getLabel={(n) => n.default_name} showLabels={false} />
                  )}
                </div>
              </div>
            );
          })}
        </div></div>
      )}
    </div>
  );
}
