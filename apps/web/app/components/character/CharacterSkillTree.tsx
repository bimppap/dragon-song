"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SkillTreeGrid from "@/components/skill/SkillTreeGrid";
import {
  fetchCharacterSkillTree,
  renameCharacterSkill,
  unlockCharacterSkill,
  type CharacterSkillNode,
  type CharacterSkillTree,
} from "@/lib/api";

const numberFormatter = new Intl.NumberFormat("ko-KR");

interface Props {
  characterId: number;
  faction: string | null;
  canManage: boolean;
}

export default function CharacterSkillTreeCard({ characterId, faction, canManage }: Props) {
  const [tree, setTree] = useState<CharacterSkillTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyNodeId, setBusyNodeId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    if (!faction) {
      setTree(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCharacterSkillTree(characterId)
      .then((data) => { if (!cancelled) setTree(data); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "기술트리 조회 실패"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [characterId, faction]);

  async function handleUnlock(node: CharacterSkillNode) {
    if (!canManage) return;
    setBusyNodeId(node.id);
    setError(null);
    try {
      const next = await unlockCharacterSkill(characterId, node.id);
      setTree(next);
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
      const next = await renameCharacterSkill(characterId, editingId, editingName);
      setTree(next);
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "기술 이름 설정 실패");
    } finally {
      setBusyNodeId(null);
    }
  }

  function handleNodeClick(node: CharacterSkillNode) {
    if (!canManage) return;
    if (node.unlocked) {
      startRename(node);
      return;
    }
    handleUnlock(node);
  }

  if (!faction) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>기술트리</CardTitle>
          <CardDescription>
            진영({faction})에 따른 기술트리입니다. 강조된 테두리가 현재 습득한 단계이며,
            {canManage ? " 다음 단계를 눌러 AP로 강화하거나 습득한 기술을 눌러 이름을 바꿀 수 있습니다." : " 캐릭터가 습득한 기술 경로를 보여줍니다."}
          </CardDescription>
        </div>
        {tree && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-num">보유 AP {numberFormatter.format(tree.character_ap)}</Badge>
            <Badge variant="secondary" className="font-num">강화 비용 {numberFormatter.format(tree.ap_cost_to_unlock)} AP</Badge>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : tree ? (
          <div className="overflow-x-auto">
            <div className="min-w-160">
              <SkillTreeGrid
                nodes={tree.nodes}
                getLabel={(n) => n.display_name}
                isHighlighted={(n) => n.unlocked}
                isDisabled={(n) => !canManage || busyNodeId !== null}
                onNodeClick={handleNodeClick}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">기술트리를 불러오지 못했습니다.</p>
        )}

        {editingId !== null && (
          <div className="flex items-center gap-2 border border-indigo-200 bg-indigo-50 rounded-xl p-4">
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
      </CardContent>
    </Card>
  );
}
