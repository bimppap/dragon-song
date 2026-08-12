"use client";

import { useEffect, useState } from "react";
import { Check, Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EffectListEditor from "@/components/common/EffectListEditor";
import Modal from "@/components/common/Modal";
import SkillTreeGrid from "@/components/skill/SkillTreeGrid";
import {
  fetchSkillNodes,
  updateSkillNode,
  uploadSkillImage,
  type Faction,
  type ItemEffect,
  type SkillNode,
} from "@/lib/api";

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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
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
    setImageFile(null);
    setImagePreview(node.image_url);
  }

  function closeEdit() {
    setEditing(null);
    setImageFile(null);
    setImagePreview(null);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : editing?.image_url ?? null);
  }

  function replaceNode(updated: SkillNode) {
    setNodesByFaction((prev) =>
      prev
        ? { ...prev, [updated.faction]: prev[updated.faction].map((n) => (n.id === updated.id ? updated : n)) }
        : prev,
    );
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      let updated = await updateSkillNode(editing.id, { default_name: draft.name, effects: draft.effects });
      if (imageFile) {
        updated = await uploadSkillImage(editing.id, imageFile);
      }
      replaceNode(updated);
      closeEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "기술 수정 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-ivory">기술트리 관리</h2>
        <p className="text-sm text-muted">
          진영별 기술트리 구조를 한 페이지에서 확인하고 각 기술을 클릭해 이름·효과·이미지를 편집할 수 있습니다. 기술
          아이콘에 마우스를 올리면 이름과 효과가 표시됩니다. 기본 기술(맨 아래)에서 시작해 1분기(계열) 하나, 2분기(세부
          경로) 하나를 골라 I~IV 단계로 강화하는 구조입니다.
        </p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading || !nodesByFaction ? (
        <p className="text-sm text-muted">불러오는 중...</p>
      ) : (
        <div className="no-scrollbar overflow-x-auto pb-2"><div className="mx-auto flex w-max gap-6">
          {FACTIONS.map((faction) => (
            <div key={faction} className="flex flex-col items-center gap-3">
              <h3 className="text-sm font-semibold text-ivory">{faction} 계열</h3>
              <div className="rounded-xl border border-line bg-surface p-4">
                <SkillTreeGrid
                  nodes={nodesByFaction[faction]}
                  getLabel={(n) => n.default_name}
                  isHighlighted={(n) => editing?.id === n.id}
                  onNodeClick={startEdit}
                />
              </div>
            </div>
          ))}
        </div></div>
      )}

      <Modal
        open={editing !== null}
        onClose={closeEdit}
        title={editing ? `${editing.faction} · ${editing.tier_label} 기술 편집` : undefined}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted">기술 이름</label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="기술 이름"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted">기술 이미지</label>
            <div className="flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-inset">
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="기술 이미지 미리보기" className="size-full object-cover" />
                ) : (
                  <ImageIcon size={20} className="text-muted" />
                )}
              </div>
              <div className="space-y-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="block text-sm text-ivory/85 file:mr-3 file:rounded-lg file:border-0 file:bg-gold/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gold hover:file:bg-gold/15"
                />
                <p className="text-xs text-muted">업로드 시 WebP로 변환되며(5MB 이하), 없으면 기본 아이콘이 표시됩니다.</p>
              </div>
            </div>
          </div>

          <EffectListEditor
            effects={draft.effects}
            onChange={(effects) => setDraft((prev) => ({ ...prev, effects }))}
          />

          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={closeEdit} disabled={saving}>
              <X size={14} />
              취소
            </Button>
            <Button size="sm" onClick={saveEdit} disabled={saving || !draft.name.trim()}>
              <Check size={14} />
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
