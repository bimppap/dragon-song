"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import Modal from "@/components/common/Modal";
import SkillTreeGrid from "@/components/skill/SkillTreeGrid";
import { BOOK_ACCENT } from "@/components/skill/bookAccent";
import {
  fetchSkillNodes,
  updateSkillNode,
  updateSkillVisibility,
  uploadSkillImage,
  type SkillBook,
  type SkillNode,
} from "@/lib/api";

const BOOKS: SkillBook[] = ["용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"];

interface Draft {
  name: string;
  description: string;
}

export default function AdminSkillEditor() {
  const [nodesByBook, setNodesByBook] = useState<Record<SkillBook, SkillNode[]>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SkillNode | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", description: "" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [maxPublicTier, setMaxPublicTier] = useState(6);
  const [savingVisibility, setSavingVisibility] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const lists = await Promise.all(BOOKS.map((b) => fetchSkillNodes(b)));
        if (cancelled) return;
        setNodesByBook(Object.fromEntries(BOOKS.map((b, i) => [b, lists[i]])) as Record<SkillBook, SkillNode[]>);
        setMaxPublicTier(Math.max(0, ...lists.flatMap((nodes) => nodes.filter((node) => node.is_public).map((node) => node.tier))));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "기술트리 조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  function startEdit(node: SkillNode) {
    setEditing(node);
    setDraft({ name: node.default_name, description: node.description ?? "" });
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

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      let updated = await updateSkillNode(editing.id, { default_name: draft.name, description: draft.description.trim() || null });
      if (imageFile) {
        updated = await uploadSkillImage(editing.id, imageFile);
      }
      const refreshedBookNodes = await fetchSkillNodes(updated.book);
      setNodesByBook((prev) => (
        prev
          ? { ...prev, [updated.book]: refreshedBookNodes }
          : prev
      ));
      closeEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "기술 수정 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleVisibilityChange(value: string) {
    const nextTier = Number(value);
    setSavingVisibility(true);
    setError(null);
    try {
      const updated = await updateSkillVisibility(nextTier);
      setNodesByBook(Object.fromEntries(
        BOOKS.map((book) => [book, updated.filter((node) => node.book === book)]),
      ) as Record<SkillBook, SkillNode[]>);
      setMaxPublicTier(nextTier);
    } catch (e) {
      setError(e instanceof Error ? e.message : "기술 공개 단계 저장 실패");
    } finally {
      setSavingVisibility(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-ivory">기술트리 관리</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-ivory">기술 노드 공개 범위</span>
          <Select
            value={String(maxPublicTier)}
            onValueChange={(value) => void handleVisibilityChange(value)}
            disabled={loading || savingVisibility}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Array.from({ length: 7 }, (_, tier) => (
                  <SelectItem key={tier} value={String(tier)}>
                    {tier === 0 ? "루트만 공개" : `${tier}단계까지 공개`}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {savingVisibility ? <span className="text-xs text-muted">저장 중...</span> : null}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading || !nodesByBook ? (
        <p className="text-sm text-muted">불러오는 중...</p>
      ) : (
        <div className="no-scrollbar overflow-x-auto pb-2"><div className="mx-auto flex w-max gap-6">
          {BOOKS.map((book) => (
            <div key={book} className="flex flex-col items-center gap-3">
              <h3 className={`text-sm font-semibold ${BOOK_ACCENT[book].text}`}>{book}</h3>
              <div className="rounded-xl border border-line bg-surface p-4">
                <SkillTreeGrid
                  nodes={nodesByBook[book]}
                  getLabel={(n) => n.default_name}
                  isHighlighted={(n) => editing?.id === n.id}
                  onNodeClick={startEdit}
                  showLabels={false}
                  tooltipVariant="admin"
                  accent={BOOK_ACCENT[book]}
                />
              </div>
            </div>
          ))}
        </div></div>
      )}

      <Modal
        open={editing !== null}
        onClose={closeEdit}
        title={editing ? `${editing.book} · ${editing.tier_label} 기술 편집` : undefined}
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
              <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden border border-line bg-inset">
                {imagePreview ? (
                  // blob: 미리보기 URL은 next/image 옵티마이저가 처리할 수 없어 unoptimized로 렌더링한다.
                  <Image src={imagePreview} alt="기술 이미지 미리보기" fill unoptimized className="object-cover" />
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

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted">기술 설명</label>
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="러너에게 보여지는 기술 설명을 입력하세요."
              rows={4}
            />
          </div>

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
