"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Check, Image as ImageIcon, ImagePlus, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import Modal from "@/components/common/Modal";
import { useDialog } from "@/components/common/DialogProvider";
import { powerOf, powerSlotsOf, ratioToPercent, type PowerSlot, type PowerUnit } from "@/lib/skillPower";
import { ALL_SKILL_TARGETS, allTargetSide, isAllSkillTarget } from "@/lib/skillTargets";
import { cn } from "@/lib/utils";
import {
  updateSkillNode,
  uploadSkillImage,
  type SkillCategory,
  type SkillNode,
  type SkillTargetSide,
  type SkillTriggerType,
} from "@/lib/api";

const asOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));
const TRIGGER_TYPES = asOptions(["즉발형", "지속형", "혼합형"] satisfies SkillTriggerType[]);
const SKILL_CATEGORIES = asOptions(["피해", "복합", "강화", "약화", "회복"] satisfies SkillCategory[]);
const STACKABLE_OPTIONS = [{ value: "true", label: "가능 (스택 사용)" }, { value: "false", label: "불가능" }];
const TARGET_OPTIONS = [{ value: "COUNT", label: "인원 지정" }, { value: "SELF", label: "SELF (본인)" }, ...asOptions(ALL_SKILL_TARGETS)];
const TARGET_SIDES = [{ value: "ALLY", label: "아군" }, { value: "ENEMY", label: "적군" }];
/** depth마다 값이 달라 하나로 보여줄 수 없는 공통 설정 칸에 띄우는 문구. */
const MIXED_LABEL = "depth마다 다름";
/** 잘못 입력한 칸은 aria-invalid만 켜면 빨간 테두리로 보인다. */
const INVALID_BORDER = "aria-[invalid=true]:border-red-500";

type SkillNodeUpdate = Parameters<typeof updateSkillNode>[1];

/** percent 칸은 퍼센트로 입력받아 배율로 저장하고, flat 칸은 입력값을 그대로 쓴다. */
function powerToInput(unit: PowerUnit, value: number | null): string {
  if (value == null) return "";
  return String(unit === "flat" ? value : ratioToPercent(value));
}

function inputToPower(unit: PowerUnit, input: string): number {
  const value = Number(input);
  return unit === "flat" ? value : value / 100;
}

function isValidPower(unit: PowerUnit, input: string): boolean {
  const value = Number(input);
  return input.trim() !== "" && Number.isFinite(value) && value >= 0 && (unit !== "flat" || Number.isInteger(value));
}

function sameNumber(a: number, b: number | null | undefined): boolean {
  return b != null && Math.abs(a - b) < 1e-9;
}

const isCount = (input: string) => /^\d+$/.test(input.trim());

function isValidTarget(target: string): boolean {
  const normalized = target.trim().toUpperCase();
  return isAllSkillTarget(target) || normalized === "SELF" || /^[1-9]\d*$/.test(normalized);
}

function depthLabel(node: SkillNode): string {
  return node.tier === 0 ? node.tier_label : `depth ${node.tier}`;
}

/** 이름 뒤에 붙는 단계 숫자(예: "강타 III")를 뗀 기술 이름. */
function baseSkillName(name: string): string {
  return name.replace(/\s+[IVXLCDM]+$/, "");
}

/**
 * 모든 depth에 함께 적용하는 설정. undefined는 depth마다 값이 달라 각 depth의 값을 그대로 둔다는 뜻이고,
 * 관리자가 값을 고르면 모든 depth를 그 값으로 맞춘다.
 */
interface CommonDraft {
  triggerType?: SkillTriggerType;
  category?: SkillCategory;
  stackable?: boolean;
  target?: string;
  targetSide?: SkillTargetSide;
  activationOrder?: string;
  powerUnits: Record<string, PowerUnit | undefined>;
}

type CommonField = Exclude<keyof CommonDraft, "powerUnits">;

/** depth들의 공통 설정을 모은다. 값이 갈리는 칸은 mixed에 담는다(위력 형식은 `unit:슬롯키`). */
function commonDraftOf(nodes: SkillNode[], slots: PowerSlot[]): { draft: CommonDraft; mixed: Set<string> } {
  const mixed = new Set<string>();
  function shared<T>(key: string, read: (node: SkillNode) => T | null): T | undefined {
    const values = nodes.map(read);
    if (values.some((value) => value !== values[0])) {
      mixed.add(key);
      return undefined;
    }
    return values[0] ?? undefined;
  }
  const draft: CommonDraft = {
    triggerType: shared("triggerType", (node) => node.trigger_type),
    category: shared("category", (node) => node.category),
    stackable: shared("stackable", (node) => node.stackable),
    target: shared("target", (node) => node.target),
    targetSide: shared("targetSide", (node) => node.target_side),
    activationOrder: shared("activationOrder", (node) => (node.activation_order == null ? null : String(node.activation_order))),
    powerUnits: Object.fromEntries(slots.map((slot) => [slot.key, shared(`unit:${slot.key}`, (node) => unitOf(node, slot.key))])),
  };
  return { draft, mixed };
}

function unitOf(node: SkillNode, key: string): PowerUnit {
  return powerSlotsOf(node).find((slot) => slot.key === key)?.unit ?? "percent";
}

/** 공통 설정에서 고른 위력 형식. 고르지 않았으면(depth마다 다름) 그 depth의 형식을 쓴다. */
function effectiveUnit(common: CommonDraft, node: SkillNode, key: string): PowerUnit {
  return common.powerUnits[key] ?? unitOf(node, key);
}

/** depth 하나의 입력값. node는 마지막으로 저장된 값이라, 바뀐 항목을 가려내는 기준이 된다. */
interface DepthRow {
  node: SkillNode;
  name: string;
  description: string;
  tier6Effect: string;
  cost: string;
  /** 위력 슬롯 키 → 입력값. 퍼센트형은 퍼센트로 적는다. */
  powers: Record<string, string>;
  cleanseCount: string;
  imageFile: File | null;
  imagePreview: string | null;
}

function depthRowOf(node: SkillNode): DepthRow {
  return {
    node,
    name: node.default_name,
    description: node.description ?? "",
    tier6Effect: node.tier6_effect ?? "",
    cost: node.cost != null ? String(node.cost) : "",
    powers: Object.fromEntries(powerSlotsOf(node).map((slot) => [slot.key, powerToInput(slot.unit, powerOf(node, slot.key))])),
    cleanseCount: String(node.cleanse_count ?? 0),
    imageFile: null,
    imagePreview: node.image_url,
  };
}

/**
 * 이 depth에서 저장된 값과 달라진 항목만 모은다. 달라진 게 없으면 null.
 * 손대지 않은 항목은 보내지 않아, 파생기의 자동 설명·스펙 값이 저장값으로 굳지 않게 한다.
 */
function changesOf(row: DepthRow, common: CommonDraft, slots: PowerSlot[]): SkillNodeUpdate | null {
  const { node } = row;
  const changes: SkillNodeUpdate = {};
  const name = row.name.trim();
  if (name !== node.default_name) changes.default_name = name;
  const description = row.description.trim();
  if (description !== (node.description ?? "").trim()) changes.description = description || null;
  const tier6Effect = row.tier6Effect.trim();
  if (node.tier === 6 && tier6Effect !== (node.tier6_effect ?? "").trim()) changes.tier6_effect = tier6Effect || null;

  if (node.tier !== 0) {
    const hidden = new Set(node.inapplicable_fields ?? []);
    if (common.triggerType && common.triggerType !== node.trigger_type) changes.trigger_type = common.triggerType;
    if (common.category && common.category !== node.category) changes.category = common.category;
    if (common.stackable !== undefined && common.stackable !== node.stackable) changes.stackable = common.stackable;
    // 대상 표기(예: "03" → "3")는 서버가 정리하므로 입력값 그대로 비교해 보낸다.
    const target = common.target?.trim();
    if (!hidden.has("target") && target !== undefined && target !== node.target) changes.target = target;
    if (!hidden.has("target_side") && common.targetSide && common.targetSide !== node.target_side) {
      changes.target_side = common.targetSide;
    }
    if (!hidden.has("activation_order") && common.activationOrder !== undefined
      && Number(common.activationOrder) !== node.activation_order) {
      changes.activation_order = Number(common.activationOrder);
    }
    if (Number(row.cost) !== node.cost) changes.cost = Number(row.cost);

    const units: Record<string, PowerUnit> = {};
    const extraPowers: Record<string, number> = {};
    let extraPowersChanged = false;
    for (const slot of slots) {
      const unit = effectiveUnit(common, node, slot.key);
      const value = inputToPower(unit, row.powers[slot.key] ?? "");
      if (unit !== unitOf(node, slot.key)) units[slot.key] = unit;
      if (slot.key === "power") {
        if (!sameNumber(value, node.power)) changes.power = value;
      } else {
        extraPowers[slot.key] = value;
        if (!sameNumber(value, node.powers?.[slot.key])) extraPowersChanged = true;
      }
    }
    // 추가 위력은 서버가 통째로 바꿔 끼우므로, 하나라도 바뀌면 전부 보낸다.
    if (extraPowersChanged) changes.powers = extraPowers;
    if (Object.keys(units).length > 0) changes.power_units = units;
    if (node.has_cleanse_count && Number(row.cleanseCount) !== (node.cleanse_count ?? 0)) {
      changes.cleanse_count = Number(row.cleanseCount);
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

/** 잘못 입력한 칸. 위력은 `power:슬롯키`로 담는다. */
function rowErrorsOf(row: DepthRow, common: CommonDraft, slots: PowerSlot[]): Set<string> {
  const errors = new Set<string>();
  if (!row.name.trim()) errors.add("name");
  if (row.node.tier === 0) return errors;
  if (!isCount(row.cost)) errors.add("cost");
  for (const slot of slots) {
    if (!isValidPower(effectiveUnit(common, row.node, slot.key), row.powers[slot.key] ?? "")) errors.add(`power:${slot.key}`);
  }
  if (row.node.has_cleanse_count && !isCount(row.cleanseCount)) errors.add("cleanse");
  return errors;
}

function commonErrorsOf(common: CommonDraft, mixed: Set<string>, hidden: Set<string>): Set<CommonField> {
  const errors = new Set<CommonField>();
  // depth마다 다른 칸은 비워 둬도 각자의 값을 유지하므로 괜찮다.
  const check = (field: CommonField, valid: (value: string) => boolean = () => true) => {
    const value = common[field];
    if (value === undefined ? !mixed.has(field) : !valid(String(value))) errors.add(field);
  };
  check("triggerType");
  check("category");
  check("stackable");
  if (!hidden.has("target")) check("target", isValidTarget);
  if (!hidden.has("target_side") && !isAllSkillTarget(common.target)) check("targetSide");
  if (!hidden.has("activation_order")) check("activationOrder", (value) => /^-?\d+$/.test(value.trim()));
  return errors;
}

function OptionSelect({ id, label, value, options, mixed, invalid, disabled, onChange, children }: {
  id: string;
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  mixed: boolean;
  invalid?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value ?? ""} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger id={id} aria-invalid={invalid} className={INVALID_BORDER}>
          <SelectValue placeholder={mixed ? MIXED_LABEL : `${label} 선택`} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
      {children}
    </Field>
  );
}

function NumberCell({ label, value, invalid, step = "1", placeholder, suffix, onChange }: {
  label: string;
  value: string;
  invalid: boolean;
  step?: string;
  placeholder?: string;
  /** 칸 오른쪽에 붙이는 단위. 칸 너비를 맞추려고 없을 때도 자리를 둔다. */
  suffix?: string | null;
  onChange: (value: string) => void;
}) {
  const input = (
    <Input
      aria-label={label}
      type="number"
      min="0"
      step={step}
      value={value}
      placeholder={placeholder}
      aria-invalid={invalid}
      className={cn("h-8", INVALID_BORDER)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  return (
    <td className="p-2 pb-1">
      {suffix === undefined ? input : (
        <div className="flex items-center gap-1">
          {input}
          <span className="w-3 shrink-0 text-xs text-muted">{suffix}</span>
        </div>
      )}
    </td>
  );
}

function TextRow({ depth, label, colSpan, value, placeholder, onChange }: {
  depth: string;
  label: string;
  colSpan: number;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <tr>
      <td className="px-2 pb-2 align-top text-xs text-muted">{label}</td>
      <td colSpan={colSpan} className="px-2 pb-2">
        <Textarea
          aria-label={`${depth} ${label}`}
          rows={2}
          maxLength={2000}
          value={value}
          placeholder={placeholder}
          className="min-h-14 resize-y"
          onChange={(e) => onChange(e.target.value)}
        />
      </td>
    </tr>
  );
}

interface Props {
  /** 같은 기술의 depth별 노드(depth 오름차순). */
  nodes: SkillNode[];
  /** 트리에서 눌러 편집창을 연 노드. 표에서 강조한다. */
  focusId: number;
  onClose: () => void;
  /** 한 depth라도 서버에 저장됐으면 부른다. 트리를 새로 불러오게 한다. */
  onSaved: () => void;
}

/**
 * 기술 하나를 모든 depth에 걸쳐 편집하는 창.
 * 발동 타입·분류 같은 공통 설정은 한 번만 고르고, 비용·위력·설명처럼 depth마다 다른 값은 표로 모아 편집한다.
 * 모든 depth의 입력을 함께 들고 있다가, 저장하면 바뀐 depth만 차례로 저장한다.
 */
export default function SkillEditModal({ nodes, focusId, onClose, onSaved }: Props) {
  const { confirm } = useDialog();
  const focus = nodes.find((node) => node.id === focusId) ?? nodes[0];
  const isSkill = focus.tier !== 0;
  const showCleanse = isSkill && focus.has_cleanse_count;
  const hidden = new Set(focus.inapplicable_fields ?? []);
  const slots = powerSlotsOf(focus);
  const [{ draft: initialCommon, mixed }] = useState(() => commonDraftOf(nodes, slots));
  const [common, setCommon] = useState<CommonDraft>(initialCommon);
  const [rows, setRows] = useState<DepthRow[]>(() => nodes.map(depthRowOf));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmingClose = useRef(false);
  const previewUrls = useRef<string[]>([]);

  // 고른 이미지의 미리보기 URL은 창을 닫을 때 한꺼번에 해제한다("한 번에 바꾸기"는 여러 depth가 같은 URL을 쓴다).
  useEffect(() => {
    const urls = previewUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const commonErrors = isSkill ? commonErrorsOf(common, mixed, hidden) : new Set<CommonField>();
  const states = rows.map((row) => {
    const changes = changesOf(row, common, slots);
    return { row, changes, dirty: Boolean(changes || row.imageFile), errors: rowErrorsOf(row, common, slots) };
  });
  const dirtyCount = states.filter((state) => state.dirty).length;
  const columnCount = 3 + (isSkill ? 1 + slots.length + (showCleanse ? 1 : 0) : 0);
  const targetMode = common.target === undefined ? undefined
    : isAllSkillTarget(common.target) || common.target === "SELF" ? common.target : "COUNT";

  function updateRows(match: (row: DepthRow) => boolean, patch: (row: DepthRow) => Partial<DepthRow>) {
    setRows((prev) => prev.map((row) => (match(row) ? { ...row, ...patch(row) } : row)));
  }

  const updateRow = (id: number, patch: (row: DepthRow) => Partial<DepthRow>) => updateRows((row) => row.node.id === id, patch);

  function pickImage(match: (row: DepthRow) => boolean, file: File | undefined) {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    previewUrls.current.push(preview);
    updateRows(match, () => ({ imageFile: file, imagePreview: preview }));
  }

  async function requestClose() {
    if (saving || confirmingClose.current) return;
    if (dirtyCount > 0) {
      confirmingClose.current = true;
      const discard = await confirm({
        title: "편집 닫기",
        description: "저장하지 않은 변경이 있습니다. 닫으면 변경한 내용이 사라집니다.",
        confirmText: "닫기",
        tone: "danger",
      });
      confirmingClose.current = false;
      if (!discard) return;
    }
    onClose();
  }

  async function save() {
    if (saving) return;
    if (commonErrors.size > 0 || states.some((state) => state.dirty && state.errors.size > 0)) {
      setError("빨간 칸을 확인해 주세요. 이름은 비울 수 없고, 비용·해제 수는 0 이상의 정수, 위력은 0 이상의 숫자(정수형은 정수), 대상은 SELF·1 이상의 정수·전체 대상 중 하나여야 합니다.");
      return;
    }
    setSaving(true);
    setError(null);
    const saved: string[] = [];
    let reachedServer = false;
    let failure: string | null = null;
    for (const { row, changes, dirty } of states) {
      if (!dirty) continue;
      try {
        let updated = row.node;
        if (changes) {
          updated = await updateSkillNode(row.node.id, changes);
          reachedServer = true;
        }
        if (row.imageFile) {
          updated = await uploadSkillImage(row.node.id, row.imageFile);
          reachedServer = true;
        }
        saved.push(depthLabel(row.node));
        // 저장한 depth는 서버 값을 새 기준으로 삼아, 뒤 depth에서 실패해 다시 저장할 때 중복으로 보내지 않는다.
        updateRow(updated.id, () => depthRowOf(updated));
      } catch (e) {
        failure = `${depthLabel(row.node)} 저장 실패: ${e instanceof Error ? e.message : "기술 수정 실패"}`;
        break;
      }
    }
    if (reachedServer) onSaved();
    setSaving(false);
    if (!failure) {
      onClose();
      return;
    }
    setError(saved.length > 0 ? `${failure} (저장 완료: ${saved.join(", ")})` : failure);
  }

  return (
    <Modal
      open
      onClose={() => void requestClose()}
      title={isSkill ? `${focus.book} · ${baseSkillName(nodes[0].default_name)} 편집` : `${focus.book} 편집`}
      className="max-w-5xl"
    >
      <div className="space-y-5">
        {isSkill && (
          <section className="space-y-3 rounded-lg bg-inset p-4">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-ivory">공통 설정</h3>
              <p className="text-xs text-muted">
                모든 depth에 함께 적용됩니다.
                {mixed.size > 0 && ` '${MIXED_LABEL}'인 칸은 그대로 두면 depth별 값을 유지하고, 값을 고르면 모든 depth를 그 값으로 맞춥니다.`}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <OptionSelect
                id="skill-trigger-type"
                label="발동 타입"
                value={common.triggerType}
                options={TRIGGER_TYPES}
                mixed={mixed.has("triggerType")}
                invalid={commonErrors.has("triggerType")}
                onChange={(value) => setCommon((prev) => ({ ...prev, triggerType: value as SkillTriggerType }))}
              />
              <OptionSelect
                id="skill-category"
                label="분류"
                value={common.category}
                options={SKILL_CATEGORIES}
                mixed={mixed.has("category")}
                invalid={commonErrors.has("category")}
                onChange={(value) => setCommon((prev) => ({ ...prev, category: value as SkillCategory }))}
              />
              <OptionSelect
                id="skill-stackable"
                label="중첩"
                value={common.stackable === undefined ? undefined : String(common.stackable)}
                options={STACKABLE_OPTIONS}
                mixed={mixed.has("stackable")}
                invalid={commonErrors.has("stackable")}
                onChange={(value) => setCommon((prev) => ({ ...prev, stackable: value === "true" }))}
              />

              {!hidden.has("target") && (
                <OptionSelect
                  id="skill-target"
                  label="기술 대상"
                  value={targetMode}
                  options={TARGET_OPTIONS}
                  mixed={mixed.has("target")}
                  invalid={commonErrors.has("target") && targetMode === undefined}
                  onChange={(value) => setCommon((prev) => ({
                    ...prev,
                    target: value === "COUNT" ? "1" : value,
                    targetSide: allTargetSide(value) ?? prev.targetSide,
                  }))}
                >
                  {targetMode === "COUNT" && (
                    <Input
                      aria-label="기술 대상 인원"
                      value={common.target}
                      onChange={(e) => setCommon((prev) => ({ ...prev, target: e.target.value }))}
                      placeholder="1 이상의 정수"
                      aria-invalid={commonErrors.has("target")}
                      className={INVALID_BORDER}
                    />
                  )}
                </OptionSelect>
              )}

              {!hidden.has("target_side") && (
                <OptionSelect
                  id="skill-target-side"
                  label="기술 대상 진영"
                  value={allTargetSide(common.target) ?? common.targetSide}
                  options={TARGET_SIDES}
                  mixed={mixed.has("targetSide")}
                  invalid={commonErrors.has("targetSide")}
                  disabled={isAllSkillTarget(common.target)}
                  onChange={(value) => setCommon((prev) => ({ ...prev, targetSide: value as SkillTargetSide }))}
                />
              )}

              {!hidden.has("activation_order") && (
                <Field>
                  <FieldLabel htmlFor="skill-activation-order">발동 순서</FieldLabel>
                  <Input
                    id="skill-activation-order"
                    type="number"
                    step="1"
                    value={common.activationOrder ?? ""}
                    // depth마다 다른 칸을 다시 비우면 depth별 값을 유지하는 상태로 돌아간다.
                    onChange={(e) => setCommon((prev) => ({
                      ...prev,
                      activationOrder: e.target.value === "" && mixed.has("activationOrder") ? undefined : e.target.value,
                    }))}
                    placeholder={mixed.has("activationOrder") ? MIXED_LABEL : "정수"}
                    aria-invalid={commonErrors.has("activationOrder")}
                    className={INVALID_BORDER}
                  />
                </Field>
              )}

              {slots.map((slot) => (
                <Field key={slot.key}>
                  <FieldLabel>{slot.label} 형식</FieldLabel>
                  <RadioGroup
                    aria-label={`${slot.label} 형식`}
                    className="flex h-9 items-center gap-4"
                    value={common.powerUnits[slot.key] ?? ""}
                    onValueChange={(unit) => setCommon((prev) => ({
                      ...prev, powerUnits: { ...prev.powerUnits, [slot.key]: unit as PowerUnit },
                    }))}
                  >
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-ivory">
                      <RadioGroupItem value="percent" />퍼센트형 (%)
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-ivory">
                      <RadioGroupItem value="flat" />정수형
                    </label>
                  </RadioGroup>
                  {common.powerUnits[slot.key] === undefined && <p className="text-xs text-muted">{MIXED_LABEL}</p>}
                </Field>
              ))}
            </div>
            {focus.formula && <p className="text-xs text-muted">계산식: {focus.formula}</p>}
          </section>
        )}

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ivory">{isSkill ? "depth별 설정" : "기본 정보"}</h3>
            {rows.length > 1 && (
              <label className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer", saving && "pointer-events-none opacity-50")}>
                <ImagePlus size={14} />
                이미지 한 번에 바꾸기
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={saving}
                  onChange={(e) => {
                    pickImage(() => true, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-line">
            <table className={cn("w-full text-left text-sm", isSkill && "min-w-180")}>
              <thead className="bg-inset text-xs text-muted">
                <tr>
                  <th className="w-24 p-2 font-semibold">depth</th>
                  <th className="w-14 p-2 font-semibold">이미지</th>
                  <th className="p-2 font-semibold">이름</th>
                  {isSkill && (
                    <>
                      <th className="w-24 p-2 font-semibold">비용 (MP)</th>
                      {slots.map((slot) => <th key={slot.key} className="w-36 p-2 font-semibold">{slot.label}</th>)}
                      {showCleanse && <th className="w-24 p-2 font-semibold">약화 해제 수</th>}
                    </>
                  )}
                </tr>
              </thead>
              {states.map(({ row, dirty, errors }) => {
                const { id, tier } = row.node;
                const label = depthLabel(row.node);
                return (
                  <tbody key={id} className={cn("border-t border-line", id === focusId && "bg-gold/5")}>
                    <tr>
                      <td className="p-2 pb-1">
                        <span className="flex items-center gap-1.5 whitespace-nowrap font-semibold text-ivory">
                          {label}
                          {dirty && <span className="size-1.5 rounded-full bg-gold" title="변경됨" aria-label="변경됨" />}
                        </span>
                      </td>
                      <td className="p-2 pb-1">
                        <label className="group relative flex size-10 cursor-pointer items-center justify-center overflow-hidden border border-line bg-inset" aria-label={`${label} 이미지 바꾸기`}>
                          {row.imagePreview ? (
                            // blob: 미리보기 URL은 next/image 옵티마이저가 처리할 수 없어 unoptimized로 렌더링한다.
                            <Image src={row.imagePreview} alt="" fill sizes="40px" unoptimized className="object-cover" />
                          ) : (
                            <ImageIcon size={16} className="text-muted" />
                          )}
                          <span className="absolute inset-0 flex items-center justify-center bg-ground/0 text-ivory opacity-0 transition group-hover:bg-ground/60 group-hover:opacity-100">
                            <ImagePlus size={14} />
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={saving}
                            onChange={(e) => {
                              pickImage((other) => other.node.id === id, e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </td>
                      <td className="p-2 pb-1">
                        <Input
                          aria-label={`${label} 이름`}
                          value={row.name}
                          maxLength={50}
                          placeholder="기술 이름"
                          aria-invalid={errors.has("name")}
                          className={cn("h-8", INVALID_BORDER)}
                          onChange={(e) => updateRow(id, () => ({ name: e.target.value }))}
                        />
                      </td>
                      {isSkill && (
                        <>
                          <NumberCell
                            label={`${label} 비용`}
                            value={row.cost}
                            invalid={errors.has("cost")}
                            onChange={(cost) => updateRow(id, () => ({ cost }))}
                          />
                          {slots.map((slot) => {
                            const unit = effectiveUnit(common, row.node, slot.key);
                            return (
                              <NumberCell
                                key={slot.key}
                                label={`${label} ${slot.label}`}
                                value={row.powers[slot.key] ?? ""}
                                invalid={errors.has(`power:${slot.key}`)}
                                step={unit === "flat" ? "1" : "any"}
                                placeholder={unit === "flat" ? "예: 2" : "예: 150"}
                                suffix={unit === "percent" ? "%" : null}
                                onChange={(value) => updateRow(id, (current) => ({ powers: { ...current.powers, [slot.key]: value } }))}
                              />
                            );
                          })}
                          {showCleanse && (
                            <NumberCell
                              label={`${label} 약화 해제 수`}
                              value={row.cleanseCount}
                              invalid={errors.has("cleanse")}
                              onChange={(cleanseCount) => updateRow(id, () => ({ cleanseCount }))}
                            />
                          )}
                        </>
                      )}
                    </tr>
                    <TextRow
                      depth={label}
                      label="설명"
                      colSpan={columnCount - 1}
                      value={row.description}
                      placeholder={row.node.auto_description ? "비워두면 depth에 맞춰 자동으로 쓰인 설명을 씁니다." : "러너에게 보여지는 기술 설명"}
                      onChange={(description) => updateRow(id, () => ({ description }))}
                    />
                    {tier === 6 && (
                      <TextRow
                        depth={label}
                        label="6단계 효과"
                        colSpan={columnCount - 1}
                        value={row.tier6Effect}
                        placeholder="6단계에서 추가되는 효과"
                        onChange={(tier6Effect) => updateRow(id, () => ({ tier6Effect }))}
                      />
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>

          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted">
            {isSkill && <li>위력은 그 depth에서 실제로 적용되는 최종값입니다.</li>}
            <li>
              설명에서 작은따옴표로 감싼 부분은 서(書) 강조 색으로 표시됩니다(따옴표는 보이지 않습니다). 수치는 따옴표가 없어도 자동으로 강조됩니다.
              {focus.auto_description && " 설명을 비워두면 depth에 맞춰 자동으로 쓰인 설명을 씁니다."}
            </li>
            <li>이미지는 칸을 눌러 바꿉니다. 업로드 시 WebP로 변환되며(5MB 이하), 없으면 기본 아이콘이 표시됩니다.</li>
          </ul>
        </section>

        <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 space-y-2 border-t border-line bg-surface px-6 py-3">
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            {rows.length > 1 && (
              <span className="mr-auto text-xs text-muted">
                {dirtyCount > 0 ? `변경한 depth ${dirtyCount}개를 저장합니다.` : "변경 사항 없음"}
              </span>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => void requestClose()} disabled={saving}>
              <X size={14} />
              취소
            </Button>
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving || dirtyCount === 0}>
              <Check size={14} />
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
