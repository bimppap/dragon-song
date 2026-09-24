"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Check, Image as ImageIcon, ImagePlus, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import Modal from "@/components/common/Modal";
import { useDialog } from "@/components/common/DialogProvider";
import { DescriptionText } from "@/components/skill/SkillTreeGrid";
import { BOOK_ACCENT } from "@/components/skill/bookAccent";
import { fillDescription, unknownDescriptionTokens } from "@/lib/skillDescription";
import { powerOf, powerSlotsOf, powerText, ratioToPercent, type PowerSlot, type PowerUnit } from "@/lib/skillPower";
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
/** 위력 형식이 depth마다 달라 하나로 고를 수 없을 때 띄우는 문구. */
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

/** 공통으로 한 번 정하거나 depth별로 따로 정할 수 있는 기술 설정. 고르지 않은 칸은 ""다. */
interface SkillSettings {
  triggerType: string;
  category: string;
  /** "true" | "false" | "" */
  stackable: string;
  /** null은 정하지 않음. 인원 지정은 숫자 문자열이다(지우는 중이면 ""). */
  target: string | null;
  targetSide: string;
  activationOrder: string;
}

/** depth별로 나눌 수 있는 설정 단위. 기술 대상은 진영과 한 묶음이다. */
type SettingKey = "triggerType" | "category" | "stackable" | "target" | "activationOrder";
const SETTING_KEYS: SettingKey[] = ["triggerType", "category", "stackable", "target", "activationOrder"];
/** 고르기만 하면 되는 설정. 공통 칸과 depth별 열에서 같은 선택지를 쓴다. */
const SIMPLE_SETTINGS = [
  { key: "triggerType", label: "발동 타입", options: TRIGGER_TYPES },
  { key: "category", label: "분류", options: SKILL_CATEGORIES },
  { key: "stackable", label: "중첩", options: STACKABLE_OPTIONS },
] as const;
/** depth별로 나눈 설정이 표의 열로 들어갈 때의 순서. hiddenField는 서버 inapplicable_fields의 이름이다. */
const SETTING_COLUMNS: { field: keyof SkillSettings; label: string; hiddenField?: string }[] = [
  ...SIMPLE_SETTINGS.map(({ key, label }) => ({ field: key, label })),
  { field: "target", label: "기술 대상", hiddenField: "target" },
  { field: "targetSide", label: "진영", hiddenField: "target_side" },
  { field: "activationOrder", label: "발동 순서", hiddenField: "activation_order" },
];

function settingsOf(node: SkillNode): SkillSettings {
  return {
    triggerType: node.trigger_type ?? "",
    category: node.category ?? "",
    stackable: node.stackable == null ? "" : String(node.stackable),
    target: node.target,
    targetSide: node.target_side ?? "",
    activationOrder: node.activation_order == null ? "" : String(node.activation_order),
  };
}

function pickSetting(settings: SkillSettings, key: SettingKey): Partial<SkillSettings> {
  return key === "target" ? { target: settings.target, targetSide: settings.targetSide } : { [key]: settings[key] };
}

/** 처음 열 때 depth마다 값이 이미 다른 설정. 이 설정들은 depth별 표에서 편집하도록 켜 둔다. */
function perDepthKeysOf(nodes: SkillNode[]): Set<SettingKey> {
  const [first, ...rest] = nodes.map(settingsOf);
  return new Set(SETTING_KEYS.filter((key) => rest.some((settings) => (
    JSON.stringify(pickSetting(settings, key)) !== JSON.stringify(pickSetting(first, key))
  ))));
}

/** 이 depth에 적용할 설정. depth별로 나눈 설정은 그 depth의 값을, 나머지는 공통 값을 쓴다. */
function effectiveSettings(row: DepthRow, common: CommonDraft, perDepth: Set<SettingKey>): SkillSettings {
  const from = (key: SettingKey) => (perDepth.has(key) ? row.settings : common.settings);
  return {
    triggerType: from("triggerType").triggerType,
    category: from("category").category,
    stackable: from("stackable").stackable,
    target: from("target").target,
    targetSide: from("target").targetSide,
    activationOrder: from("activationOrder").activationOrder,
  };
}

/** 잘못 고른 설정 칸. 기술 성격상 없는 칸(hidden)은 보지 않는다. */
function settingErrorsOf(settings: SkillSettings, hidden: Set<string>): (keyof SkillSettings)[] {
  const errors: (keyof SkillSettings)[] = [];
  if (!settings.triggerType) errors.push("triggerType");
  if (!settings.category) errors.push("category");
  if (!settings.stackable) errors.push("stackable");
  if (!hidden.has("target") && (settings.target === null || !isValidTarget(settings.target))) errors.push("target");
  if (!hidden.has("target_side") && !isAllSkillTarget(settings.target) && !settings.targetSide) errors.push("targetSide");
  if (!hidden.has("activation_order") && !/^-?\d+$/.test(settings.activationOrder.trim())) errors.push("activationOrder");
  return errors;
}

const settingKeyOf = (field: keyof SkillSettings): SettingKey => (field === "targetSide" ? "target" : field);

/** 모든 depth에 함께 적용하는 값. depth별로 나눈 설정의 값은 각 depth(DepthRow.settings)에 있다. */
interface CommonDraft {
  settings: SkillSettings;
  /** 슬롯 키 → 위력 형식. undefined는 depth마다 형식이 달라 각자의 형식을 그대로 둔다는 뜻이다. */
  powerUnits: Record<string, PowerUnit | undefined>;
  /** 모든 depth가 함께 쓰는 설명. {기술 위력} 같은 자리표시자는 depth마다 그 depth의 값으로 채워진다. */
  description: string;
}

/** 가장 많은 depth가 함께 쓰는 설명을 공통 설명으로 본다. 두 depth 이상 같은 설명이 없으면 비워 둔다. */
function commonDescriptionOf(nodes: SkillNode[]): string {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const text = (node.description_template ?? "").trim();
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  const [text, count] = [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  return count >= 2 ? text : "";
}

/** 공통 값은 편집창을 연 depth의 값에서 시작한다. */
function commonDraftOf(nodes: SkillNode[], focus: SkillNode, slots: PowerSlot[]): CommonDraft {
  const sharedUnit = (key: string) => {
    const units = nodes.map((node) => unitOf(node, key));
    return units.every((unit) => unit === units[0]) ? units[0] : undefined;
  };
  return {
    settings: settingsOf(focus),
    powerUnits: Object.fromEntries(slots.map((slot) => [slot.key, sharedUnit(slot.key)])),
    description: commonDescriptionOf(nodes),
  };
}

function unitOf(node: SkillNode, key: string): PowerUnit {
  return powerSlotsOf(node).find((slot) => slot.key === key)?.unit ?? "percent";
}

/** 공통 설정에서 고른 위력 형식. 고르지 않았으면(depth마다 다름) 그 depth의 형식을 쓴다. */
function effectiveUnit(common: CommonDraft, node: SkillNode, key: string): PowerUnit {
  return common.powerUnits[key] ?? unitOf(node, key);
}

/** 이 depth에 저장할 설명 원문(자리표시자 그대로). */
function descriptionOf(row: DepthRow, common: CommonDraft): string {
  return (row.ownDescription ? row.description : common.description).trim();
}

/** 설명 자리표시자 이름 → 지금 입력한 이 depth의 값. 서버가 채우는 규칙과 같다. */
function descriptionValuesOf(row: DepthRow, common: CommonDraft, slots: PowerSlot[]): Record<string, string> {
  const values: Record<string, string> = { depth: String(row.node.tier) };
  if (row.node.tier === 0) return values;
  if (isCount(row.cost)) values["비용"] = String(Number(row.cost));
  for (const slot of slots) {
    const unit = effectiveUnit(common, row.node, slot.key);
    const input = row.powers[slot.key] ?? "";
    if (isValidPower(unit, input)) values[slot.label] = powerText(unit, inputToPower(unit, input));
  }
  if (row.node.has_cleanse_count && isCount(row.cleanseCount)) values["약화 해제 수"] = String(Number(row.cleanseCount));
  return values;
}

/** depth 하나의 입력값. node는 마지막으로 저장된 값이라, 바뀐 항목을 가려내는 기준이 된다. */
interface DepthRow {
  node: SkillNode;
  name: string;
  /** depth별로 나눈 설정에서 쓰는 이 depth의 값. */
  settings: SkillSettings;
  /** true면 공통 설명 대신 description에 이 depth만의 설명을 쓴다. */
  ownDescription: boolean;
  description: string;
  tier6Effect: string;
  cost: string;
  /** 위력 슬롯 키 → 입력값. 퍼센트형은 퍼센트로 적는다. */
  powers: Record<string, string>;
  cleanseCount: string;
  imageFile: File | null;
  imagePreview: string | null;
}

/** commonDescription이 null이면 공통 설명 없이(depth가 하나뿐) 이 depth의 설명만 쓴다. */
function depthRowOf(node: SkillNode, commonDescription: string | null): DepthRow {
  const description = node.description_template ?? "";
  return {
    node,
    name: node.default_name,
    settings: settingsOf(node),
    ownDescription: commonDescription === null || description.trim() !== commonDescription.trim(),
    description,
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
function changesOf(row: DepthRow, common: CommonDraft, perDepth: Set<SettingKey>, slots: PowerSlot[]): SkillNodeUpdate | null {
  const { node } = row;
  const changes: SkillNodeUpdate = {};
  const name = row.name.trim();
  if (name !== node.default_name) changes.default_name = name;
  const description = descriptionOf(row, common);
  if (description !== (node.description_template ?? "").trim()) changes.description = description || null;
  const tier6Effect = row.tier6Effect.trim();
  if (node.tier === 6 && tier6Effect !== (node.tier6_effect ?? "").trim()) changes.tier6_effect = tier6Effect || null;

  if (node.tier !== 0) {
    const hidden = new Set(node.inapplicable_fields ?? []);
    const settings = effectiveSettings(row, common, perDepth);
    if (settings.triggerType && settings.triggerType !== node.trigger_type) changes.trigger_type = settings.triggerType as SkillTriggerType;
    if (settings.category && settings.category !== node.category) changes.category = settings.category as SkillCategory;
    if (settings.stackable && (settings.stackable === "true") !== node.stackable) changes.stackable = settings.stackable === "true";
    // 대상 표기(예: "03" → "3")는 서버가 정리하므로 입력값 그대로 비교해 보낸다.
    const target = settings.target?.trim();
    if (!hidden.has("target") && target && target !== node.target) changes.target = target;
    const side = allTargetSide(settings.target) ?? settings.targetSide;
    if (!hidden.has("target_side") && side && side !== node.target_side) changes.target_side = side as SkillTargetSide;
    if (!hidden.has("activation_order") && settings.activationOrder.trim() !== ""
      && Number(settings.activationOrder) !== node.activation_order) {
      changes.activation_order = Number(settings.activationOrder);
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

/** 잘못 입력한 칸. 위력은 `power:슬롯키`, depth별로 나눈 설정은 `setting:칸이름`으로 담는다. */
function rowErrorsOf(row: DepthRow, common: CommonDraft, perDepth: Set<SettingKey>, slots: PowerSlot[], hidden: Set<string>): Set<string> {
  const errors = new Set<string>();
  if (!row.name.trim()) errors.add("name");
  if (row.node.tier === 0) return errors;
  for (const field of settingErrorsOf(row.settings, hidden)) {
    if (perDepth.has(settingKeyOf(field))) errors.add(`setting:${field}`);
  }
  if (!isCount(row.cost)) errors.add("cost");
  for (const slot of slots) {
    if (!isValidPower(effectiveUnit(common, row.node, slot.key), row.powers[slot.key] ?? "")) errors.add(`power:${slot.key}`);
  }
  if (row.node.has_cleanse_count && !isCount(row.cleanseCount)) errors.add("cleanse");
  return errors;
}

function OptionPicker({ id, label, value, options, placeholder = "선택", invalid, disabled, className, onChange }: {
  id?: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={label} aria-invalid={invalid} className={cn(INVALID_BORDER, className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/** 기술 대상 고르기. 인원 지정이면 인원 칸을 함께 보여준다. */
function TargetPicker({ id, label, target, invalid, compact, onChange }: {
  id?: string;
  label: string;
  target: string | null;
  invalid: boolean;
  compact?: boolean;
  onChange: (target: string) => void;
}) {
  const mode = target === null ? "" : isAllSkillTarget(target) || target === "SELF" ? target : "COUNT";
  return (
    <>
      <OptionPicker
        id={id}
        label={label}
        value={mode}
        options={TARGET_OPTIONS}
        placeholder={compact ? "선택" : "기술 대상 선택"}
        invalid={invalid && mode === ""}
        className={compact ? "h-8" : undefined}
        onChange={(value) => onChange(value === "COUNT" ? "1" : value)}
      />
      {mode === "COUNT" && (
        <Input
          aria-label={`${label} 인원`}
          value={target ?? ""}
          placeholder="1 이상의 정수"
          aria-invalid={invalid}
          className={cn(compact && "mt-1 h-8", INVALID_BORDER)}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  );
}

/** 공통 설정 칸. "depth별"을 켜면 칸 대신 안내를 보여주고, 값은 depth별 표에서 정한다. */
function SettingField({ label, htmlFor, perDepth, onPerDepthChange, children }: {
  label: string;
  htmlFor: string;
  perDepth: boolean;
  /** 없으면 다른 칸(기술 대상)의 depth별 여부를 따른다. */
  onPerDepthChange?: (perDepth: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
        {onPerDepthChange && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <Checkbox
              aria-label={`${label} depth별로 정하기`}
              checked={perDepth}
              onCheckedChange={(checked) => onPerDepthChange(checked === true)}
            />
            depth별
          </label>
        )}
      </div>
      {perDepth ? (
        <p className="flex h-9 items-center rounded-lg border border-dashed border-line px-3 text-xs text-muted">
          아래 depth별 표에서 정합니다.
        </p>
      ) : children}
    </Field>
  );
}

function NumberCell({ label, value, invalid, min = "0", step = "1", placeholder, suffix, onChange }: {
  label: string;
  value: string;
  invalid: boolean;
  /** 음수도 받는 칸(발동 순서)은 null을 넘긴다. */
  min?: string | null;
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
      min={min ?? undefined}
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
  const [common, setCommon] = useState<CommonDraft>(() => commonDraftOf(nodes, focus, slots));
  const [perDepth, setPerDepth] = useState<Set<SettingKey>>(() => perDepthKeysOf(nodes));
  // depth가 여럿이면 설명을 공통으로 한 번 쓰고, 필요한 depth만 따로 쓴다.
  const sharesDescription = nodes.length > 1;
  const [rows, setRows] = useState<DepthRow[]>(() => nodes.map((node) => depthRowOf(node, sharesDescription ? common.description : null)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmingClose = useRef(false);
  const previewUrls = useRef<string[]>([]);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // 고른 이미지의 미리보기 URL은 창을 닫을 때 한꺼번에 해제한다("한 번에 바꾸기"는 여러 depth가 같은 URL을 쓴다).
  useEffect(() => {
    const urls = previewUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const commonErrors = new Set(isSkill ? settingErrorsOf(common.settings, hidden).filter((field) => !perDepth.has(settingKeyOf(field))) : []);
  const states = rows.map((row) => {
    const changes = changesOf(row, common, perDepth, slots);
    return { row, changes, dirty: Boolean(changes || row.imageFile), errors: rowErrorsOf(row, common, perDepth, slots, hidden) };
  });
  const dirtyCount = states.filter((state) => state.dirty).length;
  const settingColumns = isSkill
    ? SETTING_COLUMNS.filter((column) => perDepth.has(settingKeyOf(column.field)) && !(column.hiddenField && hidden.has(column.hiddenField)))
    : [];
  const columnCount = 3 + (isSkill ? 1 + slots.length + (showCleanse ? 1 : 0) + settingColumns.length : 0);
  const descriptionTokens = ["depth", ...(isSkill ? ["비용", ...slots.map((slot) => slot.label), ...(showCleanse ? ["약화 해제 수"] : [])] : [])];
  const unknownTokens = unknownDescriptionTokens(common.description, descriptionTokens);
  const ownDescriptionCount = rows.filter((row) => row.ownDescription).length;
  const accentText = BOOK_ACCENT[focus.book].text;

  function updateRows(match: (row: DepthRow) => boolean, patch: (row: DepthRow) => Partial<DepthRow>) {
    setRows((prev) => prev.map((row) => (match(row) ? { ...row, ...patch(row) } : row)));
  }

  const updateRow = (id: number, patch: (row: DepthRow) => Partial<DepthRow>) => updateRows((row) => row.node.id === id, patch);

  const setCommonSettings = (patch: Partial<SkillSettings>) => setCommon((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));

  /** depth별로 나누면 지금 공통 값에서 시작하고, 다시 합치면 편집창을 연 depth의 값에서 시작한다. */
  function togglePerDepth(key: SettingKey, on: boolean) {
    if (on) {
      const value = pickSetting(common.settings, key);
      updateRows(() => true, (row) => ({ settings: { ...row.settings, ...value } }));
    } else {
      const focusRow = rows.find((row) => row.node.id === focus.id) ?? rows[0];
      setCommonSettings(pickSetting(focusRow.settings, key));
    }
    setPerDepth((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function settingCell(row: DepthRow, depth: string, errors: Set<string>, { field, label }: (typeof SETTING_COLUMNS)[number]) {
    const cellLabel = `${depth} ${label}`;
    const invalid = errors.has(`setting:${field}`);
    const set = (patch: Partial<SkillSettings>) => updateRow(row.node.id, (current) => ({ settings: { ...current.settings, ...patch } }));
    if (field === "activationOrder") {
      return (
        <NumberCell key={field} label={cellLabel} value={row.settings.activationOrder} invalid={invalid} min={null} placeholder="정수"
          onChange={(activationOrder) => set({ activationOrder })} />
      );
    }
    if (field === "target") {
      return (
        <td key={field} className="min-w-32 p-2 pb-1">
          <TargetPicker label={cellLabel} target={row.settings.target} invalid={invalid} compact onChange={(target) => set({ target })} />
        </td>
      );
    }
    const options = field === "targetSide" ? TARGET_SIDES : SIMPLE_SETTINGS.find((setting) => setting.key === field)?.options ?? [];
    // 전체 대상이면 진영은 대상이 정한다.
    const allSide = field === "targetSide" ? allTargetSide(row.settings.target) : undefined;
    return (
      <td key={field} className="p-2 pb-1">
        <OptionPicker label={cellLabel} value={allSide ?? row.settings[field] ?? ""} options={options} invalid={invalid} disabled={Boolean(allSide)}
          className="h-8 min-w-24" onChange={(value) => set({ [field]: value })} />
      </td>
    );
  }

  function pickImage(match: (row: DepthRow) => boolean, file: File | undefined) {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    previewUrls.current.push(preview);
    updateRows(match, () => ({ imageFile: file, imagePreview: preview }));
  }

  /** 공통 설명의 커서 자리에 자리표시자를 넣고, 넣은 뒤에 커서를 두어 이어서 쓰게 한다. */
  function insertToken(name: string) {
    const token = `{${name}}`;
    const textarea = descriptionRef.current;
    const start = textarea?.selectionStart ?? common.description.length;
    const end = textarea?.selectionEnd ?? start;
    setCommon((prev) => ({ ...prev, description: prev.description.slice(0, start) + token + prev.description.slice(end) }));
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + token.length, start + token.length);
    });
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
      setError("빨간 칸을 확인해 주세요. 이름은 비울 수 없고, 발동 타입·분류·중첩·진영은 골라야 하며, 비용·해제 수는 0 이상의 정수, 위력은 0 이상의 숫자(정수형은 정수), 대상은 SELF·1 이상의 정수·전체 대상 중 하나, 발동 순서는 정수여야 합니다.");
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
        updateRow(updated.id, () => depthRowOf(updated, sharesDescription ? common.description : null));
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
                모든 depth에 함께 적용됩니다. depth마다 다르게 정하려면 항목의 &apos;depth별&apos;을 켜세요(처음부터 depth마다 값이 다른 항목은 켜져 있습니다).
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {SIMPLE_SETTINGS.map(({ key, label, options }) => (
                <SettingField key={key} label={label} htmlFor={`skill-${key}`} perDepth={perDepth.has(key)} onPerDepthChange={(on) => togglePerDepth(key, on)}>
                  <OptionPicker
                    id={`skill-${key}`}
                    label={label}
                    value={common.settings[key]}
                    options={[...options]}
                    placeholder={`${label} 선택`}
                    invalid={commonErrors.has(key)}
                    onChange={(value) => setCommonSettings({ [key]: value })}
                  />
                </SettingField>
              ))}

              {!hidden.has("target") && (
                <SettingField label="기술 대상" htmlFor="skill-target" perDepth={perDepth.has("target")} onPerDepthChange={(on) => togglePerDepth("target", on)}>
                  <TargetPicker
                    id="skill-target"
                    label="기술 대상"
                    target={common.settings.target}
                    invalid={commonErrors.has("target")}
                    onChange={(target) => setCommonSettings({ target })}
                  />
                </SettingField>
              )}

              {!hidden.has("target_side") && (
                // 진영은 기술 대상과 함께 depth별로 나뉜다.
                <SettingField
                  label="기술 대상 진영"
                  htmlFor="skill-target-side"
                  perDepth={perDepth.has("target")}
                  onPerDepthChange={hidden.has("target") ? (on) => togglePerDepth("target", on) : undefined}
                >
                  <OptionPicker
                    id="skill-target-side"
                    label="기술 대상 진영"
                    value={allTargetSide(common.settings.target) ?? common.settings.targetSide}
                    options={TARGET_SIDES}
                    placeholder="아군/적군 선택"
                    invalid={commonErrors.has("targetSide")}
                    disabled={isAllSkillTarget(common.settings.target)}
                    onChange={(targetSide) => setCommonSettings({ targetSide })}
                  />
                </SettingField>
              )}

              {!hidden.has("activation_order") && (
                <SettingField
                  label="발동 순서"
                  htmlFor="skill-activation-order"
                  perDepth={perDepth.has("activationOrder")}
                  onPerDepthChange={(on) => togglePerDepth("activationOrder", on)}
                >
                  <Input
                    id="skill-activation-order"
                    type="number"
                    step="1"
                    value={common.settings.activationOrder}
                    placeholder="정수"
                    aria-invalid={commonErrors.has("activationOrder")}
                    className={INVALID_BORDER}
                    onChange={(e) => setCommonSettings({ activationOrder: e.target.value })}
                  />
                </SettingField>
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

        {sharesDescription && (
          <section className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold text-ivory">설명</h3>
                <p className="text-xs text-muted">
                  모든 depth가 함께 쓰는 설명입니다. 아래 값을 넣으면 depth마다 그 depth의 수치로 채워집니다.
                </p>
              </div>
              {ownDescriptionCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateRows(() => true, () => ({ ownDescription: false }))}
                >
                  따로 쓴 depth {ownDescriptionCount}개도 공통 설명 쓰기
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {descriptionTokens.map((name) => (
                <Button key={name} type="button" variant="outline" size="sm" className="h-7 px-2 font-normal" onClick={() => insertToken(name)}>
                  {`{${name}}`}
                </Button>
              ))}
            </div>
            <Textarea
              ref={descriptionRef}
              aria-label="공통 설명"
              rows={3}
              maxLength={2000}
              value={common.description}
              placeholder={focus.auto_description
                ? "비워두면 depth에 맞춰 자동으로 쓰인 설명을 씁니다."
                : `예) 적 1명에게 '{${slots[0].label}}' 피해를 줍니다.`}
              className="resize-y"
              onChange={(e) => setCommon((prev) => ({ ...prev, description: e.target.value }))}
            />
            {unknownTokens.length > 0 && (
              <p className="text-xs text-red-400">
                채울 수 없는 값: {unknownTokens.map((name) => `{${name}}`).join(", ")} (위 버튼의 이름과 같아야 합니다)
              </p>
            )}
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
                      {settingColumns.map((column) => <th key={column.field} className="p-2 font-semibold">{column.label}</th>)}
                    </>
                  )}
                </tr>
              </thead>
              {states.map(({ row, dirty, errors }) => {
                const { id, tier } = row.node;
                const label = depthLabel(row.node);
                const description = descriptionOf(row, common);
                // 설명이 비어 있는 자동 설명 기술은 서버가 쓴 설명을 보여준다(직접 쓴 설명을 막 지웠으면 저장해야 바뀐다).
                const descriptionPreview = description
                  ? fillDescription(description, descriptionValuesOf(row, common, slots))
                  : row.node.auto_description && !row.node.description_template ? row.node.description : null;
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
                          className={cn("h-8 min-w-28", INVALID_BORDER)}
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
                          {settingColumns.map((column) => settingCell(row, label, errors, column))}
                        </>
                      )}
                    </tr>
                    <tr>
                      <td className="px-2 pb-2 align-top text-xs text-muted">설명</td>
                      <td colSpan={columnCount - 1} className="px-2 pb-2">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1 space-y-1">
                            {row.ownDescription && (
                              <Textarea
                                aria-label={`${label} 설명`}
                                rows={2}
                                maxLength={2000}
                                value={row.description}
                                placeholder={row.node.auto_description ? "비워두면 depth에 맞춰 자동으로 쓰인 설명을 씁니다." : "러너에게 보여지는 기술 설명"}
                                className="min-h-14 resize-y"
                                onChange={(e) => updateRow(id, () => ({ description: e.target.value }))}
                              />
                            )}
                            {(!row.ownDescription || description.includes("{")) && (
                              // 자리표시자를 이 depth의 값으로 채운 모습. 러너에게 보이는 그대로다.
                              <p aria-label={`${label} 설명 미리보기`} className="whitespace-pre-line rounded-lg border border-dashed border-line px-3 py-2 text-sm text-ivory/85">
                                {descriptionPreview
                                  ? <DescriptionText text={descriptionPreview} className={accentText} />
                                  : <span className="text-muted">{row.node.auto_description ? "저장하면 depth에 맞춰 자동으로 쓰인 설명이 들어갑니다." : "설명 없음"}</span>}
                              </p>
                            )}
                          </div>
                          {sharesDescription && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 shrink-0 px-2"
                              onClick={() => updateRow(id, () => (
                                row.ownDescription ? { ownDescription: false } : { ownDescription: true, description: common.description }
                              ))}
                            >
                              {row.ownDescription ? "공통 설명 쓰기" : "따로 쓰기"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
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
            {sharesDescription && <li>{"{값 이름}"}은 depth마다 그 depth의 수치로 채워집니다. 퍼센트형 위력은 %까지 붙습니다. 따로 쓴 설명에서도 쓸 수 있습니다.</li>}
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
