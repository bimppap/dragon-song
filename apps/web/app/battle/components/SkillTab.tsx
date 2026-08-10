"use client";

import { useEffect, useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SkillTreeGrid from "@/components/skill/SkillTreeGrid";
import { fetchSkillNodes, updateSkillNode, type Faction, type SkillNode } from "@/lib/api";

const FACTIONS: Faction[] = ["공격", "수비", "치유"];

export default function SkillTab() {
  const [faction, setFaction] = useState<Faction>("공격");
  const [nodes, setNodes] = useState<SkillNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSkillNodes(faction)
      .then((data) => { if (!cancelled) setNodes(data); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [faction]);

  function startEdit(node: SkillNode) {
    setEditingId(node.id);
    setEditingName(node.default_name);
  }

  async function saveEdit() {
    if (editingId === null) return;
    setSaving(true);
    try {
      const updated = await updateSkillNode(editingId, editingName);
      setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "기술 이름 수정 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-800">기술트리 관리</h2>
        <p className="text-sm text-slate-500">
          진영별 기술트리 구조를 확인하고 각 노드의 기본 이름을 편집할 수 있습니다. 기본 기술(맨 아래)에서 시작해
          한 계열만 선택하고, 계열 내 한 세부 경로만 골라 I~IV 단계로 강화하는 구조입니다.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Select value={faction} onValueChange={(v) => setFaction(v as Faction)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FACTIONS.map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : (
        <div className="border border-slate-200 rounded-xl p-6 bg-white overflow-x-auto">
          <div className="min-w-160">
            <SkillTreeGrid
              nodes={nodes}
              getLabel={(n) => n.default_name}
              onNodeClick={(n) => startEdit(n)}
            />
          </div>
        </div>
      )}

      {editingId !== null && (
        <div className="flex items-center gap-2 border border-indigo-200 bg-indigo-50 rounded-xl p-4">
          <Pencil size={15} className="text-indigo-500 shrink-0" />
          <Input
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            placeholder="기술 이름"
            className="max-w-xs"
          />
          <Button size="sm" onClick={saveEdit} disabled={saving || !editingName.trim()}>
            <Check size={14} />
            저장
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={saving}>
            <X size={14} />
            취소
          </Button>
        </div>
      )}
    </div>
  );
}
