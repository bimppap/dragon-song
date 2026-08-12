"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SkillTreeGrid from "@/components/skill/SkillTreeGrid";
import {
  fetchCharacterSkillTree,
  fetchSkillNodes,
  renameCharacterSkill,
  unlockCharacterSkill,
  type CharacterSkillNode,
  type CharacterSkillTree,
  type Faction,
  type SkillNode,
} from "@/lib/api";
import AlertBanner from "@/components/common/AlertBanner";

const FACTIONS: Faction[] = ["공격", "수비", "치유"];
const numberFormatter = new Intl.NumberFormat("ko-KR");

interface Props {
  characterId: number;
}

export default function MySkillTree({ characterId }: Props) {
  const [tree, setTree] = useState<CharacterSkillTree | null>(null);
  const [otherNodes, setOtherNodes] = useState<Record<string, SkillNode[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyNodeId, setBusyNodeId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCharacterSkillTree(characterId)
      .then(async (data) => {
        if (cancelled) return;
        setTree(data);
        const others = FACTIONS.filter((f) => f !== data.faction);
        const lists = await Promise.all(others.map((f) => fetchSkillNodes(f)));
        if (cancelled) return;
        setOtherNodes(Object.fromEntries(others.map((f, i) => [f, lists[i]])));
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "기술트리 조회 실패"); })
      .finally(() => { if (!cancelled) setLoading(false); });
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

  function startRename(node: CharacterSkillNode) {
    setEditingId(node.id);
    setEditingName(node.custom_name ?? node.default_name);
  }

  async function saveRename() {
    if (editingId === null) return;
    setBusyNodeId(editingId);
    setError(null);
    try {
      setTree(await renameCharacterSkill(characterId, editingId, editingName));
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "기술 이름 설정 실패");
    } finally {
      setBusyNodeId(null);
    }
  }

  function handleNodeClick(node: CharacterSkillNode) {
    if (node.unlocked) {
      startRename(node);
      return;
    }
    handleUnlock(node);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">기술트리</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
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
        <p className="text-sm text-slate-400 dark:text-slate-500">불러오는 중...</p>
      ) : (
        <div className="flex gap-6 overflow-x-auto pb-2">
          {FACTIONS.map((faction) => {
            const isOwn = faction === tree.faction;
            return (
              <div key={faction} className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{faction} 계열</h3>
                  {isOwn ? (
                    <Badge className="text-[10px]">내 진영</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-slate-400 dark:text-slate-500">참고용</Badge>
                  )}
                </div>
                <div className={isOwn ? "rounded-xl border border-indigo-200 bg-white dark:bg-slate-900 p-4" : "rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 p-4"}>
                  {isOwn ? (
                    <SkillTreeGrid
                      nodes={tree.nodes}
                      getLabel={(n) => n.display_name}
                      isHighlighted={(n) => n.unlocked}
                      isDisabled={() => busyNodeId !== null}
                      onNodeClick={handleNodeClick}
                    />
                  ) : (
                    <SkillTreeGrid nodes={otherNodes[faction] ?? []} getLabel={(n) => n.default_name} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editingId !== null && (
        <div className="flex flex-wrap items-center gap-2 border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl p-4">
          <Pencil size={15} className="text-indigo-500 shrink-0" />
          <Input
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            placeholder="기술 커스텀 이름"
            className="max-w-xs"
          />
          <Button size="sm" onClick={saveRename} disabled={busyNodeId !== null}>
            <Check size={14} />
            저장
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={busyNodeId !== null}>
            <X size={14} />
            취소
          </Button>
        </div>
      )}
    </div>
  );
}
