"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ImagePlus, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Modal from "@/components/common/Modal";
import { useDialog } from "@/components/common/DialogProvider";
import { createTrait, deleteTrait, fetchTraits, updateTrait, uploadTraitImage, type Trait, type TraitInput } from "@/lib/api";

const EMPTY_FORM: TraitInput = { name: "", effect: "", description: "" };
const NAME_MAX_LENGTH = 50;
const TEXT_MAX_LENGTH = 2000;

function TraitImage({ url, name, className }: { url: string | null; name: string; className: string }) {
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-inset text-muted ${className}`}>
      {url ? <Image src={url} alt={name} fill sizes="96px" unoptimized className="object-contain" /> : <Star size={18} />}
    </span>
  );
}

/** 특성 추가·수정 창. 저장하면 특성을 먼저 만들거나 고친 뒤 이미지를 올린다. */
function TraitFormModal({ trait, onClose, onSaved, onDeleted }: {
  trait: Trait | null;
  onClose: () => void;
  onSaved: (trait: Trait) => void;
  onDeleted: (traitId: number) => void;
}) {
  const { confirm } = useDialog();
  const [form, setForm] = useState<TraitInput>(trait ? { name: trait.name, effect: trait.effect, description: trait.description } : EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(trait?.image_url ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      let saved = trait ? await updateTrait(trait.id, form) : await createTrait(form);
      if (imageFile) saved = await uploadTraitImage(saved.id, imageFile);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "특성 저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!trait) return;
    if (!await confirm({ title: "특성 삭제", description: `'${trait.name}' 특성을 삭제하시겠습니까?`, confirmText: "삭제", tone: "danger" })) return;
    setSaving(true);
    setError(null);
    try {
      await deleteTrait(trait.id);
      onDeleted(trait.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "특성 삭제 실패");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={saving ? () => {} : onClose} title={trait ? "특성 수정" : "특성 추가"}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <label className="group relative cursor-pointer" aria-label="특성 이미지 첨부">
            <TraitImage url={imagePreview} name={form.name || "특성"} className="size-24" />
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-ground/0 text-xs font-semibold text-ivory transition-colors group-hover:bg-ground/60">
              <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"><ImagePlus size={12} />첨부</span>
            </span>
            <input type="file" accept="image/*" className="hidden" disabled={saving} onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setImageFile(file);
              setImagePreview(file ? URL.createObjectURL(file) : trait?.image_url ?? null);
            }} />
          </label>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="trait-name" className="text-xs font-semibold text-muted">이름</label>
            <Input id="trait-name" value={form.name} maxLength={NAME_MAX_LENGTH} disabled={saving} placeholder="예: 불꽃의 심장"
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="trait-effect" className="text-xs font-semibold text-muted">효과</label>
          <Textarea id="trait-effect" rows={4} value={form.effect} maxLength={TEXT_MAX_LENGTH} disabled={saving}
            placeholder="특성이 주는 효과를 입력하세요." onChange={(event) => setForm((prev) => ({ ...prev, effect: event.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="trait-description" className="text-xs font-semibold text-muted">설명</label>
          <Textarea id="trait-description" rows={4} value={form.description} maxLength={TEXT_MAX_LENGTH} disabled={saving}
            placeholder="특성에 대한 설명을 입력하세요." onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
        </div>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          {trait ? (
            <Button type="button" variant="destructive" onClick={remove} disabled={saving}><Trash2 size={15} />삭제</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>취소</Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>{saving ? "저장 중..." : trait ? "저장" : "특성 추가"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** 관리 페이지 "특성" 탭. 이미지·이름·효과·설명을 자르지 않고 표로 보여준다. */
export default function TraitTab() {
  const [traits, setTraits] = useState<Trait[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // null: 닫힘, "new": 추가, Trait: 수정
  const [editing, setEditing] = useState<Trait | "new" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTraits()
      .then((list) => { if (!cancelled) setTraits(list); })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : "특성 목록 조회 실패"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function handleSaved(saved: Trait) {
    setTraits((prev) => prev.some((trait) => trait.id === saved.id)
      ? prev.map((trait) => trait.id === saved.id ? saved : trait)
      : [...prev, saved]);
    setEditing(null);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ivory">특성 목록 <span className="text-xs font-normal text-muted">{traits.length}개</span></h2>
        <Button type="button" onClick={() => setEditing("new")} className="gap-2"><Plus size={15} />특성 추가</Button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">특성 목록을 불러오는 중...</p>
      ) : loadError ? (
        <p role="alert" className="py-8 text-center text-sm text-red-400">{loadError}</p>
      ) : traits.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">등록된 특성이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[760px] table-fixed text-left text-sm">
            <thead className="bg-inset text-xs text-muted">
              <tr>
                <th className="w-20 p-3">이미지</th>
                <th className="w-44 p-3">이름</th>
                <th className="p-3">효과</th>
                <th className="p-3">설명</th>
                <th className="w-20 p-3 text-center">수정</th>
              </tr>
            </thead>
            <tbody>
              {traits.map((trait) => (
                <tr key={trait.id} className="border-t border-line align-top">
                  <td className="p-3"><TraitImage url={trait.image_url} name={trait.name} className="size-14" /></td>
                  {/* 긴 글도 자르지 않고 칸 안에서 줄바꿈해 모두 보여준다. */}
                  <td className="whitespace-pre-wrap break-words p-3 font-semibold text-ivory">{trait.name}</td>
                  <td className="whitespace-pre-wrap break-words p-3 text-ivory/90">{trait.effect || <span className="text-muted">-</span>}</td>
                  <td className="whitespace-pre-wrap break-words p-3 text-muted">{trait.description || "-"}</td>
                  <td className="p-3 text-center">
                    <Button type="button" size="icon" variant="ghost" aria-label={`${trait.name} 수정`} onClick={() => setEditing(trait)}><Pencil size={15} /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null && (
        <TraitFormModal key={editing === "new" ? "new" : editing.id} trait={editing === "new" ? null : editing}
          onClose={() => setEditing(null)} onSaved={handleSaved}
          onDeleted={(traitId) => { setTraits((prev) => prev.filter((trait) => trait.id !== traitId)); setEditing(null); }} />
      )}
    </section>
  );
}
