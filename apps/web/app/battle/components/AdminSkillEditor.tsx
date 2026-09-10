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
type PowerSlot = SkillNode["power_slots"][number];

const DEFAULT_POWER_SLOTS: PowerSlot[] = [{ key: "power", label: "기술 위력", unit: "percent" }];

/** 서버가 기술마다 내려주는 위력 입력 칸 정의. 예전 응답 호환을 위해 비어 있으면 단일 위력으로 본다. */
function powerSlotsOf(node: SkillNode): PowerSlot[] {
  return node.power_slots?.length ? node.power_slots : DEFAULT_POWER_SLOTS;
}

/** percent 슬롯은 퍼센트로 입력받아 배율로 저장하고, flat 슬롯은 입력값을 그대로 쓴다. */
function slotValueToInput(slot: PowerSlot, value: number | null): string {
  if (value == null) return "";
  return slot.unit === "flat" ? String(value) : ratioToPercent(value);
}

function slotInputToValue(slot: PowerSlot, input: string): number {
  const value = Number(input);
  return slot.unit === "flat" ? value : value / 100;
}

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
  /** 위력 슬롯 키 → 퍼센트 입력값. 위력이 하나인 기술은 "power" 하나만 쓴다. */
  powerPercents: Record<string, string>;
  cleanseCount: string;
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
  powerPercents: {},
  cleanseCount: "0",
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
      powerPercents: Object.fromEntries(powerSlotsOf(node).map((slot) => [
        slot.key,
        slotValueToInput(slot, slot.key === "power" ? node.power : node.powers?.[slot.key] ?? null),
      ])),
      cleanseCount: String(node.cleanse_count ?? 0),
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
      if (editing.book === "헌신의 서" && editing.col === 1 && editing.tier >= 2) {
        await updateSkillNode(editing.id, { default_name: editing.default_name, description: editing.description, ...(editing.branch !== 2 ? { power: Number(draft.powerPercents.power) } : {}) });
        const refreshed = await fetchSkillNodes(editing.book);
        setNodesByBook((prev) => prev ? { ...prev, [editing.book]: refreshed } : prev);
        closeEdit();
        return;
      }
      const skillMetadata = editing.tier === 0 ? {} : {
        trigger_type: draft.triggerType as SkillTriggerType,
        category: draft.category as SkillCategory,
        stackable: draft.stackable,
        target: draft.target.trim().toUpperCase(),
        target_side: draft.targetSide as SkillTargetSide,
        activation_order: Number(draft.activationOrder),
        cost: Number(draft.cost),
        power: slotInputToValue(
          powerSlotsOf(editing).find((slot) => slot.key === "power") ?? DEFAULT_POWER_SLOTS[0],
          draft.powerPercents.power ?? "",
        ),
        powers: Object.fromEntries(
          powerSlotsOf(editing)
            .filter((slot) => slot.key !== "power")
            .map((slot) => [slot.key, slotInputToValue(slot, draft.powerPercents[slot.key] ?? "")]),
        ),
        ...(editing.has_cleanse_count ? { cleanse_count: Number(draft.cleanseCount) } : {}),
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

  const isValorProgression = editing?.book === "용맹의 서" && editing.col === 1 && editing.tier >= 2;
  const isEscortProgression = editing?.book === "불굴의 서" && editing.branch === 0 && editing.col === 1 && editing.tier >= 2;
  const isEruptionProgression = editing?.book === "불굴의 서" && editing.branch === 1 && editing.col === 1 && editing.tier >= 2;
  const isVeilProgression = editing?.book === "불굴의 서" && editing.branch === 2 && editing.col === 1 && editing.tier >= 2;
  const isDevotionProgression = editing?.book === "헌신의 서" && editing.col === 1 && editing.tier >= 2;
  const isSkillNode = editing !== null && editing.tier !== 0;
  const targetIsValid = draft.target.trim().toUpperCase() === "SELF" || /^[1-9]\d*$/.test(draft.target.trim());
  const activationOrderIsValid = /^-?\d+$/.test(draft.activationOrder.trim());
  const costIsValid = /^\d+$/.test(draft.cost.trim());
  const powerSlots = editing ? powerSlotsOf(editing) : DEFAULT_POWER_SLOTS;
  const powerIsValid = powerSlots.every((slot) => {
    const value = draft.powerPercents[slot.key] ?? "";
    return value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
  });
  const cleanseCountIsValid = !isSkillNode || !editing.has_cleanse_count || /^\d+$/.test(draft.cleanseCount.trim());
  const metadataIsValid = !isSkillNode || (
    TRIGGER_TYPES.includes(draft.triggerType as SkillTriggerType)
    && SKILL_CATEGORIES.includes(draft.category as SkillCategory)
    && TARGET_SIDES.some(({ value }) => value === draft.targetSide)
    && targetIsValid
    && activationOrderIsValid
    && costIsValid
    && powerIsValid
    && cleanseCountIsValid
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
        {(isDevotionProgression || isVeilProgression || isEruptionProgression || isEscortProgression || isValorProgression) && editing ? <div className="space-y-4">
          <h3 className="text-lg font-semibold">{editing.default_name} · depth {editing.tier}</h3>
          <p className="text-sm text-muted">depth 2부터 같은 기술이 강화됩니다. 대상·효과·계산식은 같고, 각 단계의 강화 수치만 달라집니다.</p>
          <div className="flex flex-wrap gap-2">{nodesByBook?.[editing.book].filter((node) => node.branch === editing.branch && node.col === editing.col && node.tier >= 2).map((node) => <Button key={node.id} variant={node.id === editing.id ? "default" : "outline"} size="sm" disabled={saving} onClick={() => startEdit(node)}>depth {node.tier}</Button>)}</div>
          <p className="whitespace-pre-line text-sm">{editing.description}</p>
          {isValorProgression ? <div className="rounded-lg bg-inset p-3 text-sm space-y-2">{editing.branch === 0 ? <><p>피해: (자애 + 지혜) × 2 + 기술 효율(고정)</p><p>자신 공격력 버프: (자애 + 지혜) × 2 + 기술 효율(고정) / 2</p><p className="text-xs text-muted">주입은 고정 2배라 depth가 깊어져도 배율은 그대로이며, 버프는 중첩됩니다.</p></> : editing.branch === 1 ? <><p>사용 시 피해: {editing.tier} × 5 + 기술 효율(고정) = {editing.tier * 5} + 기술 효율(고정)</p><p>대상: 모든 에너미 (하수인 제외)</p><p>보유 시 상시 공격력: {editing.tier} × 2 + 기술 효율(고정) = {editing.tier * 2} + 기술 효율(고정)</p><p className="text-xs text-muted">상시 공격력은 기술을 쓰지 않아도 보유만으로 적용됩니다.</p></> : <><p>암시 턴 피해: {editing.tier} × 6 + 기술 효율(고정) = {editing.tier * 6} + 기술 효율(고정)</p><p>대상: 모든 적 (에너미 + 하수인)</p><p className="text-xs text-muted">적의 행동 암시 턴마다 발동하며, 중첩되고 전투 종료까지 유지됩니다.</p></>}</div> : isEscortProgression ? <div className="rounded-lg bg-inset p-3 text-sm space-y-2"><p>자신 피해 감소: {editing.tier} × 5% + 기술 효율(비례) = {editing.tier * 5}% + 기술 효율(비례)</p><p>피해 감소 스택: 최대 2스택 (합산 적용)</p><p>경호 스택: 지정한 아군 1명 (아군당 최대 1스택)</p><p className="text-xs text-muted">경호 스택을 가진 아군이 피격되면 시전자가 대신 맞습니다. 전투 종료까지 유지되며, 피해 감소는 방어 행동 여부와 무관하게 항상 적용됩니다.</p></div> : isEruptionProgression ? <div className="rounded-lg bg-inset p-3 text-sm space-y-2"><p>존재감: 사용마다 +20%p</p><p>피격 시 반응 피해: {editing.tier} × 5 + 기술 효율(고정) = {editing.tier * 5} + 기술 효율(고정)</p><p>대상: 모든 에너미 (하수인 제외)</p><p className="text-xs text-muted">전투 종료까지 유지되며 중첩됩니다. 중첩마다 존재감과 반응 피해가 합산됩니다.</p></div> : isVeilProgression ? <div className="rounded-lg bg-inset p-3 text-sm space-y-2"><p>체력 소모: 최대 체력 × max(0, {50 - editing.tier * 5}% − 기술 효율 비례)</p><p>아군 전체 보호막: {editing.tier} + 기술 효율(고정) / 2</p><p className="text-xs text-muted">depth가 깊어질수록 체력 소모는 줄고 보호막은 증가합니다. 두 값은 자동 계산됩니다.</p></div> : editing.branch === 2 ? <p className="rounded-lg bg-inset p-3 text-sm">회복 비율: {editing.tier} × 15% + 10% = {editing.tier * 15 + 10}%<br />실제 회복량만큼 무작위 에너미 1명에게 피해</p> : <label className="block space-y-2 text-sm">{editing.branch === 0 ? "체력 재생력 증가 기본값" : "전체 회복 기본값"}<Input type="number" min={0} step="any" value={draft.powerPercents.power ?? ""} onChange={(event) => setDraft((prev) => ({ ...prev, powerPercents: { ...prev.powerPercents, power: event.target.value } }))} /><span className="block text-xs text-muted">최종값 = {draft.powerPercents.power || "0"} + 시전자 기술 효율(고정) / 4</span></label>}
          <p className="text-xs text-muted">{editing.formula}</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={closeEdit} disabled={saving}>닫기</Button>{isDevotionProgression && editing.branch !== 2 && <Button onClick={saveEdit} disabled={saving || !powerIsValid}>{saving ? "저장 중..." : "강화 수치 저장"}</Button>}</div>
        </div> : <div className="space-y-4">
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

                {powerSlots.map((slot) => {
                  const value = draft.powerPercents[slot.key] ?? "";
                  return (
                    <div key={slot.key} className="space-y-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                        {slot.unit === "flat" ? slot.label : `${slot.label} (%)`}
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={value}
                        onChange={(e) => setDraft((prev) => ({
                          ...prev,
                          powerPercents: { ...prev.powerPercents, [slot.key]: e.target.value },
                        }))}
                        placeholder={slot.unit === "flat" ? "예: 2" : "예: 150"}
                        aria-invalid={value !== "" && !(Number.isFinite(Number(value)) && Number(value) >= 0)}
                      />
                    </div>
                  );
                })}

                {editing.has_cleanse_count && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-muted">약화 해제 수</label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={draft.cleanseCount}
                      onChange={(e) => setDraft((prev) => ({ ...prev, cleanseCount: e.target.value }))}
                      placeholder="0 이상의 정수"
                      aria-invalid={!cleanseCountIsValid}
                    />
                    <p className="text-xs text-muted">가장 오래된 것부터 해제합니다.</p>
                  </div>
                )}
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
        </div>}
      </Modal>
    </div>
  );
}
