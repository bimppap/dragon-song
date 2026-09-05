"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  type SkillCategory,
  type SkillNode,
  type SkillTargetSide,
  type SkillTriggerType,
} from "@/lib/api";

const BOOKS: SkillBook[] = ["용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"];
const TRIGGER_TYPES: SkillTriggerType[] = ["즉발형", "지속형", "혼합형"];
const SKILL_CATEGORIES: SkillCategory[] = ["피해", "복합", "강화", "약화", "회복"];
const TARGET_SIDES: { value: SkillTargetSide; label: string }[] = [
  { value: "ALLY", label: "아군" },
  { value: "ENEMY", label: "적군" },
];

interface Draft {
  name: string;
  description: string;
  triggerType: SkillTriggerType | "";
  category: SkillCategory | "";
  stackable: boolean;
  target: string;
  targetSide: SkillTargetSide | "";
  activationOrder: string;
  cost: string;
  powerPercent: string;
  environmentStackRemove: string;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  description: "",
  triggerType: "",
  category: "",
  stackable: false,
  target: "",
  targetSide: "",
  activationOrder: "",
  cost: "",
  powerPercent: "",
  environmentStackRemove: "0",
};

function ratioToPercent(value: number | null): string {
  return value == null ? "" : String(Number((value * 100).toFixed(6)));
}

export default function AdminSkillEditor() {
  const [nodesByBook, setNodesByBook] = useState<Record<SkillBook, SkillNode[]>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SkillNode | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
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
    setDraft({
      name: node.default_name,
      description: node.description ?? "",
      triggerType: node.trigger_type ?? "",
      category: node.category ?? "",
      stackable: node.stackable ?? false,
      target: node.target ?? "",
      targetSide: node.target_side ?? "",
      activationOrder: node.activation_order != null ? String(node.activation_order) : "",
      cost: node.cost != null ? String(node.cost) : "",
      powerPercent: ratioToPercent(node.power),
      environmentStackRemove: String(node.environment_stack_remove ?? 0),
    });
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
      const skillMetadata = editing.tier === 0 ? {} : {
        trigger_type: draft.triggerType as SkillTriggerType,
        category: draft.category as SkillCategory,
        stackable: draft.stackable,
        target: draft.target.trim().toUpperCase(),
        target_side: draft.targetSide as SkillTargetSide,
        activation_order: Number(draft.activationOrder),
        cost: Number(draft.cost),
        power: Number(draft.powerPercent) / 100,
        environment_stack_remove: Number(draft.environmentStackRemove),
      };
      let updated = await updateSkillNode(editing.id, {
        default_name: draft.name,
        description: draft.description.trim() || null,
        ...skillMetadata,
      });
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

  const isSkillNode = editing !== null && editing.tier !== 0;
  const targetIsValid = draft.target.trim().toUpperCase() === "SELF" || /^[1-9]\d*$/.test(draft.target.trim());
  const activationOrderIsValid = /^-?\d+$/.test(draft.activationOrder.trim());
  const costIsValid = /^\d+$/.test(draft.cost.trim());
  const powerPercent = Number(draft.powerPercent);
  const powerIsValid = draft.powerPercent.trim() !== "" && Number.isFinite(powerPercent) && powerPercent >= 0;
  const environmentStackRemoveIsValid = /^\d+$/.test(draft.environmentStackRemove.trim());
  const metadataIsValid = !isSkillNode || (
    TRIGGER_TYPES.includes(draft.triggerType as SkillTriggerType)
    && SKILL_CATEGORIES.includes(draft.category as SkillCategory)
    && TARGET_SIDES.some(({ value }) => value === draft.targetSide)
    && targetIsValid
    && activationOrderIsValid
    && costIsValid
    && powerIsValid
    && environmentStackRemoveIsValid
  );

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
        className="max-w-2xl"
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

          {isSkillNode ? (
            <div className="space-y-3 border-y border-line py-4">
              <h3 className="text-sm font-semibold text-ivory">기술 설정</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted">발동 타입</label>
                  <Select
                    value={draft.triggerType}
                    onValueChange={(value) => setDraft((prev) => ({ ...prev, triggerType: value as SkillTriggerType }))}
                  >
                    <SelectTrigger><SelectValue placeholder="발동 타입 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {TRIGGER_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted">분류</label>
                  <Select
                    value={draft.category}
                    onValueChange={(value) => setDraft((prev) => ({ ...prev, category: value as SkillCategory }))}
                  >
                    <SelectTrigger><SelectValue placeholder="분류 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {SKILL_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted">기술 대상</label>
                  <Input
                    value={draft.target}
                    onChange={(e) => setDraft((prev) => ({ ...prev, target: e.target.value }))}
                    placeholder="SELF 또는 1 이상의 정수"
                    aria-invalid={draft.target !== "" && !targetIsValid}
                  />
                  {draft.target !== "" && !targetIsValid ? (
                    <p className="text-xs text-red-500">SELF 또는 1 이상의 정수를 입력하세요.</p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted">기술 대상 진영</label>
                  <Select
                    value={draft.targetSide}
                    onValueChange={(value) => setDraft((prev) => ({ ...prev, targetSide: value as SkillTargetSide }))}
                  >
                    <SelectTrigger><SelectValue placeholder="아군/적군 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {TARGET_SIDES.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted">발동 순서</label>
                  <Input
                    type="number"
                    step="1"
                    value={draft.activationOrder}
                    onChange={(e) => setDraft((prev) => ({ ...prev, activationOrder: e.target.value }))}
                    placeholder="정수"
                    aria-invalid={draft.activationOrder !== "" && !activationOrderIsValid}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted">기술 비용 (MP)</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={draft.cost}
                    onChange={(e) => setDraft((prev) => ({ ...prev, cost: e.target.value }))}
                    placeholder="0 이상의 정수"
                    aria-invalid={draft.cost !== "" && !costIsValid}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted">기술 위력 (%)</label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={draft.powerPercent}
                    onChange={(e) => setDraft((prev) => ({ ...prev, powerPercent: e.target.value }))}
                    placeholder="예: 150"
                    aria-invalid={draft.powerPercent !== "" && !powerIsValid}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted">환경 스택 제거 수</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={draft.environmentStackRemove}
                    onChange={(e) => setDraft((prev) => ({ ...prev, environmentStackRemove: e.target.value }))}
                    placeholder="0 이상의 정수"
                    aria-invalid={!environmentStackRemoveIsValid}
                  />
                  <p className="text-xs text-muted">가장 오래된 해제 가능 환경 스택부터 제거합니다.</p>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-ivory">
                <Checkbox
                  checked={draft.stackable}
                  onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, stackable: checked === true }))}
                />
                중첩 가능 (스택 사용)
              </label>
            </div>
          ) : null}

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
            <Button size="sm" onClick={saveEdit} disabled={saving || !draft.name.trim() || !metadataIsValid}>
              <Check size={14} />
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
