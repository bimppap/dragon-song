"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EffectListEditor from "@/components/common/EffectListEditor";
import SkillTreeGrid from "@/components/skill/SkillTreeGrid";
import { fetchSkillNodes, updateSkillNode, type Faction, type ItemEffect, type SkillNode } from "@/lib/api";

const FACTIONS: Faction[] = ["공격", "수비", "치유"];

interface Draft {
  name: string;
  effects: ItemEffect[];
}

export default function AdminSkillEditor() {
  const [nodesByFaction, setNodesByFaction] = useState<Record<Faction, SkillNode[]>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SkillNode | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", effects: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(FACTIONS.map((f) => fetchSkillNodes(f)))
      .then((lists) => {
        if (cancelled) return;
        setNodesByFaction(Object.fromEntries(FACTIONS.map((f, i) => [f, lists[i]])) as Record<Faction, SkillNode[]>);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "기술트리 조회 실패"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function startEdit(node: SkillNode) {
    setEditing(node);
    setDraft({ name: node.default_name, effects: node.effects });
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSkillNode(editing.id, { default_name: draft.name, effects: draft.effects });
      setNodesByFaction((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [updated.faction]: prev[updated.faction].map((n) => (n.id === updated.id ? updated : n)),
        };
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "기술 수정 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-800">기술트리 관리</h2>
        <p className="text-sm text-slate-500">
          진영별 기술트리 구조를 한 페이지에서 확인하고 각 기술의 이름과 효과를 편집할 수 있습니다. 기술 아이콘에
          마우스를 올리면 이름과 효과가 표시됩니다. 기본 기술(맨 아래)에서 시작해 1분기(계열) 하나, 2분기(세부 경로)
          하나를 골라 I~IV 단계로 강화하는 구조입니다.
        </p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading || !nodesByFaction ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : (
        <div className="flex gap-6 overflow-x-auto pb-2">
          {FACTIONS.map((faction) => (
            <div key={faction} className="flex flex-col items-center gap-3">
              <h3 className="text-sm font-semibold text-slate-700">{faction} 계열</h3>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <SkillTreeGrid
                  nodes={nodesByFaction[faction]}
                  getLabel={(n) => n.default_name}
                  isHighlighted={(n) => editing?.id === n.id}
                  onNodeClick={startEdit}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="max-w-lg space-y-4 border border-indigo-200 bg-indigo-50/50 rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
            <Pencil size={15} />
            {editing.faction} · {editing.tier_label} 기술 편집
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">기술 이름</label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="기술 이름"
              className="max-w-xs bg-white"
            />
          </div>
          <EffectListEditor
            effects={draft.effects}
            onChange={(effects) => setDraft((prev) => ({ ...prev, effects }))}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={saveEdit} disabled={saving || !draft.name.trim()}>
              <Check size={14} />
              저장
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              <X size={14} />
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
