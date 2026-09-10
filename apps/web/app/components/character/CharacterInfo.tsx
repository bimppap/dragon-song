"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Backpack,
  BookOpen,
  ChevronDown,
  ChevronsUp,
  ChevronUp,
  Coins,
  Flame,
  Gauge,
  Gem,
  Heart,
  HeartHandshake,
  Image as ImageIcon,
  Lock,
  Package,
  Shield,
  Trash2,
  Trophy,
  Zap,
} from "lucide-react";
import CharacterOwnedSkills from "./CharacterOwnedSkills";
import CharacterClonedSkills from "./CharacterClonedSkills";
import CharacterEquipmentSlots from "./CharacterEquipmentSlots";
import EmptyState from "@/components/common/EmptyState";
import InfoTooltip from "@/components/common/InfoTooltip";
import Modal from "@/components/common/Modal";
import RewardSummary from "@/components/common/RewardSummary";
import { useDialog } from "@/components/common/DialogProvider";
import { useToast } from "@/components/common/ToastProvider";

import { formatRewardItems, rewardLabel, rewardVisual } from "@/lib/rewards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FACTION_POSITION_IMAGE } from "@/lib/faction";
import { MAX_CHARACTER_LEVEL, patchAdminCharacter, formatEffect, consumeItem, deleteCharacter, equipItem, fetchCharacterDetail, fetchItems, fetchTakenDeliveryDates, fetchDeliveryRecipients, fetchRecollectionMissions, fetchAcquisitionChallenges, GRADE_CHOICE_STAT_OPTIONS, unequipItem, uploadDeliveryImage, upgradeCharacterStat, uploadCharacterImage } from "@/lib/api";
import type { Character, CharacterDetail, CharacterOwnedItem, DeliveryPayload, Faction, GradeStat, Item, ItemEffect, ItemHistoryEntry, Reward, RewardGrant, UseItemSelection } from "@/lib/api";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import DatePicker from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  characters: Character[];
  loading: boolean;
  showSelector?: boolean;
  showId?: boolean;
  focusCharacterId?: number | null;
  /** 다른 러너의 캐릭터를 열람할 때: 편집·아이템 상호작용을 막는다(기술/동반자/장신구는 열람만 허용). */
  readOnly?: boolean;
  /** 보상/구매 이력 노출 여부. 미지정 시 readOnly의 반대값(자기 캐릭터는 노출, 남의 캐릭터는 비노출). 스텝이 다른 캐릭터의 이력을 볼 때 명시적으로 true로 지정한다. */
  showHistory?: boolean;
  /** 지정하면 캐릭터 삭제 버튼을 노출한다(관리자 콘솔 전용). */
  onDeleted?: (characterId: number) => void;
  /** 지정하면, 관리자가 만든 캐릭터(러너 계정 미연결)에 한해 수정 버튼을 노출한다(관리자 콘솔 전용). */
  adminMode?: boolean;
}

const numberFormatter = new Intl.NumberFormat("ko-KR");
const percentageFormatter = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });

const CORE_STATS: {
  key: keyof Pick<CharacterDetail, "stat_courage" | "stat_endurance" | "stat_charity" | "stat_wisdom">;
  label: string;
  icon: React.ElementType;
  accent: string;
}[] = [
  { key: "stat_courage", label: "용기", icon: Flame, accent: "text-red-500" },
  { key: "stat_endurance", label: "인내", icon: Shield, accent: "text-blue-500" },
  { key: "stat_charity", label: "자애", icon: HeartHandshake, accent: "text-emerald-500" },
  { key: "stat_wisdom", label: "지혜", icon: BookOpen, accent: "text-purple-500" },
];

const RANK_GRADES = [
  {
    name: "동",
    description: "기본적인 전투 감각을 익히는 입문 등급입니다.",
    medalImage: "/medal/medal_1.png",
  },
  {
    name: "은",
    description: "기본 전투를 안정적으로 수행할 수 있는 숙련 등급입니다.",
    medalImage: "/medal/medal_2.png",
  },
  {
    name: "금",
    description: "전투와 파티 운영에서 중심 역할을 맡는 상위 등급입니다.",
    medalImage: "/medal/medal_3.png",
  },
] as const;

/** 모험가 등급(rank) 값을 동/은/금 3단계로 분류한다. */
function getRankGrade(rank: number) {
  const index = rank <= 3 ? 0 : rank <= 6 ? 1 : 2;
  return RANK_GRADES[index];
}

const DETAIL_STATS: {
  key: keyof Pick<
    CharacterDetail,
    "atk" | "atk_p" | "def" | "def_p" | "def_eff" | "presence" | "hp_max" |
    "hp_max_p" | "hp_regen_true" | "hp_regen_fixed" | "heal_eff" |
    "mp_max" | "mp_regen" | "sh" | "dmg_p" | "dmg_r" | "skill_eff_true" |
    "skill_eff_fixed" | "attn" | "skill_lv" | "skill_cost" | "skill_target"
  >;
  label: string;
  description: string;
  isFloat?: boolean;
  /** true면 값 자체를 ×100%로 표시(예: 0.3 → 30%). 기본은 (1+값)×100%(예: 0 → 100%, 증폭류 스탯). */
  rawPercent?: boolean;
}[] = [
  { key: "attn", label: "주목도", description: "적의 공격 대상 선정에 사용하는 주목도입니다." },
  { key: "skill_lv", label: "기술 레벨", description: "캐릭터의 기술 레벨입니다." },
  { key: "skill_cost", label: "기술 비용", description: "기술 사용 비용 보정값입니다." },
  { key: "skill_target", label: "기술 대상", description: "기술 대상 수 보정값입니다." },
  { key: "atk", label: "공격력", description: "공격 행동 시 에너미에게 주는 기본 피해량입니다." },
  { key: "atk_p", label: "공격력 증폭(%)", isFloat: true, rawPercent: true, description: "공격력에 곱해지는 증폭 배율입니다. 높을수록 공격 피해가 커집니다." },
  { key: "def", label: "방어력", description: "수비할 때 받는 피해를 고정으로 줄여 주는 값입니다." },
  { key: "def_p", label: "방어력 증폭(%)", isFloat: true, rawPercent: true, description: "방어력에 곱해지는 증폭 배율입니다." },
  { key: "def_eff", label: "방어 효율(%)", isFloat: true, rawPercent: true, description: "방어력이 실제 피해 경감에 적용되는 효율 배율입니다." },
  { key: "presence", label: "존재감(%)", isFloat: true, rawPercent: true, description: "주목도와 함께 에너미의 대상 선정에 반영되는 보조 지표입니다." },
  { key: "hp_max", label: "최대 체력", description: "체력의 최대치 기준값입니다." },
  { key: "hp_max_p", label: "체력 증폭(%)", isFloat: true, rawPercent: true, description: "최대 체력에 곱해지는 증폭 배율입니다." },
  { key: "hp_regen_true", label: "체력 재생력(고정)", description: "매 라운드 시작 시 고정으로 회복하는 체력입니다." },
  { key: "hp_regen_fixed", label: "체력 재생력(비례)", isFloat: true, rawPercent: true, description: "매 라운드 최대 체력에 비례해 회복하는 체력 배율입니다." },
  { key: "heal_eff", label: "치유 효율(%)", isFloat: true, rawPercent: true, description: "치유 행동 시 회복량의 기준값입니다." },
  { key: "mp_max", label: "마나 최대치", description: "마나의 최대치입니다." },
  { key: "mp_regen", label: "마나 재생력", description: "매 라운드 회복하는 마나입니다." },
  { key: "sh", label: "보호막", description: "체력보다 먼저 피해를 흡수하는 보호막입니다." },
  { key: "dmg_p", label: "피해 증폭", isFloat: true, rawPercent: true, description: "가하는 피해 전체에 적용되는 증폭 배율입니다." },
  { key: "dmg_r", label: "피해 감소(%)", isFloat: true, rawPercent: true, description: "받는 피해를 비율로 줄여 주는 감소율입니다." },
  { key: "skill_eff_true", label: "기술 효율(고정)", description: "기술 피해·치유에 더해지는 고정값입니다." },
  { key: "skill_eff_fixed", label: "기술 효율(비례)", isFloat: true, rawPercent: true, description: "기술 등급과 곱해져 위력을 높이는 비례 계수입니다." },
];

type AdminOnlyStatType = "int" | "percent" | "boolean";

const ADMIN_ONLY_STATS: {
  key: "start_sh" | "revive_hp" | "act_time" | "over_heal";
  label: string;
  description: string;
  type: AdminOnlyStatType;
}[] = [
  {
    key: "start_sh",
    label: "시작 보호막",
    description: "시작 시 가지는 보호막 수치 (기본: 0)",
    type: "int",
  },
  {
    key: "revive_hp",
    label: "부활 후 체력",
    description: "부활 시 얼만큼 체력을 가지고 있는지 정하는 수치 (기본: 10%)",
    type: "percent",
  },
  {
    key: "act_time",
    label: "행동횟수",
    description: "(적군 전용 능력치) 한 차례의 몇 번의 행동을 하는지 정하는 수치 (기본: 1)",
    type: "int",
  },
  {
    key: "over_heal",
    label: "오버힐",
    description: "회복되는 수치가 회복 대상의 최대 체력을 초과하는 경우, 초과분 누적의 허용을 결정하는 값",
    type: "boolean",
  },
];

function formatAdminOnlyStat(type: AdminOnlyStatType, value: number | boolean): string {
  if (type === "boolean") return value ? "가능" : "불가능";
  if (type === "percent") return `${(Number(value) * 100).toFixed(1)}%`;
  return numberFormatter.format(Number(value));
}

/** 수치를 더블클릭(또는 포커스 후 Enter)하면 그 자리에서 고칠 수 있게 하는 표시용 래퍼.
 *  onSave가 없으면 편집 기능 없이 값만 보여준다(러너 화면·열람 전용). */
function EditableValue({ value, display, label, onSave, disabled = false, boolean = false }: {
  value: number | boolean; display: React.ReactNode; label: string;
  onSave?: (value: number | boolean) => Promise<void>; disabled?: boolean; boolean?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState("");

  function startEditing() {
    setDraft(String(value));
    setError("");
    setEditing(true);
  }

  if (!onSave) return <>{display}</>;
  if (!editing) {
    return (
      <span
        tabIndex={0}
        role="button"
        title="더블클릭하여 수정"
        aria-label={`${label} 직접 수정`}
        className="cursor-text rounded underline decoration-dotted decoration-muted underline-offset-2"
        onDoubleClick={startEditing}
        onKeyDown={(event) => { if (event.key === "Enter") startEditing(); }}
      >
        {display}
      </span>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-1"
      onSubmit={async (event) => {
        event.preventDefault();
        const next = boolean ? draft === "true" : Number(draft);
        if (!boolean && (!draft.trim() || !Number.isFinite(next))) { setError("숫자를 입력해 주세요."); return; }
        try { await onSave(next); setEditing(false); }
        catch (saveError) { setError(saveError instanceof Error ? saveError.message : "저장 실패"); }
      }}
    >
      {boolean ? (
        <Select value={draft} onValueChange={setDraft}>
          <SelectTrigger aria-label={label} className="h-7 w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">가능</SelectItem>
            <SelectItem value="false">불가능</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Input
          autoFocus
          aria-label={label}
          type="number"
          step="any"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="h-7 w-24"
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setEditing(false); } }}
        />
      )}
      <Button type="submit" size="sm" variant="ghost" disabled={disabled} className="h-7 px-2 text-xs text-gold">저장</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 px-2 text-xs text-muted">취소</Button>
      {error && <span role="alert" className="w-full text-xs text-red-500">{error}</span>}
    </form>
  );
}

function StatBar({
  label,
  icon: Icon,
  value,
  max,
  iconAccent,
  barColor,
  onValueSave,
  onMaxSave,
}: {
  label: string;
  icon: React.ElementType;
  value: number;
  max: number;
  iconAccent: string;
  barColor: string;
  onValueSave?: (value: number | boolean) => Promise<void>;
  onMaxSave?: (value: number | boolean) => Promise<void>;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm font-semibold text-ivory/85">
        <span className="flex items-center gap-2">
          <Icon size={15} className={iconAccent} />
          {label}
        </span>
        <span className="font-num text-ivory">
          <EditableValue value={value} display={numberFormatter.format(value)} label={`${label} 현재값`} onSave={onValueSave} /> / <EditableValue value={max} display={numberFormatter.format(max)} label={`${label} 최대값`} onSave={onMaxSave} />
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CoreStatLine({
  label,
  icon: Icon,
  value,
  accent,
  canUpgrade,
  upgrading,
  onUpgrade,
  onEdit,
}: {
  label: string;
  icon: React.ElementType;
  value: number;
  accent: string;
  canUpgrade: boolean;
  upgrading: boolean;
  onUpgrade: () => void;
  onEdit?: (value: number | boolean) => Promise<void>;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2 last:border-b-0">
      <span className="flex items-center gap-2 text-sm font-semibold text-ivory/85">
        <Icon size={15} className={accent} />
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="font-num text-base font-semibold text-ivory">
          <EditableValue value={value} display={numberFormatter.format(value)} label={label} onSave={onEdit} />
        </span>
        {canUpgrade && (
          <button
            type="button"
            onClick={onUpgrade}
            disabled={upgrading}
            aria-label={`${label} 강화`}
            className="text-gold disabled:opacity-50"
          >
            <ChevronsUp size={16} className="animate-pulse" />
          </button>
        )}
      </span>
    </div>
  );
}

/** 경험치가 이만큼 쌓일 때마다 성장등급이 오르고 경험치는 0으로 리셋된다(app/crud.py의 GROWTH_EXP_PER_LEVEL과 동일). */
const GROWTH_EXP_PER_LEVEL = 20;

function ExperienceBar({
  value,
  max,
  cumulativeValue,
  cumulativeMax,
}: {
  value: number;
  max: number;
  cumulativeValue: number;
  cumulativeMax: number;
}) {
  const [cumulative, setCumulative] = useState(false);
  const displayValue = cumulative ? cumulativeValue : value;
  const displayMax = cumulative ? cumulativeMax : max;
  const pct = displayMax > 0 ? Math.min(100, Math.max(0, (displayValue / displayMax) * 100)) : 0;

  return (
    <button
      type="button"
      onClick={() => setCumulative((prev) => !prev)}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-ivory/85"
    >
      <span className="shrink-0">EXP</span>
      <span className="h-2.5 w-28 overflow-hidden rounded-full bg-white/10">
        <span
          className="block h-full rounded-full bg-gold transition-all"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="font-num shrink-0 text-ivory">
        {numberFormatter.format(displayValue)} / {numberFormatter.format(displayMax)}
      </span>
    </button>
  );
}

function GradeChoiceSelector({
  requiredCount,
  onChange,
}: {
  requiredCount: number;
  onChange: (stats: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(stat: string) {
    setSelected((prev) => {
      const next = prev.includes(stat)
        ? prev.filter((s) => s !== stat)
        : prev.length < requiredCount
          ? [...prev, stat]
          : prev;
      onChange(next);
      return next;
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-sm text-muted">능력치를 {requiredCount}개 선택하세요. ({selected.length}/{requiredCount})</p>
      <div className="flex flex-wrap gap-2">
        {GRADE_CHOICE_STAT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              selected.includes(option.value)
                ? "border-gold bg-gold/20 text-gold"
                : "border-line text-ivory",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FactionChoiceSelector({
  currentFaction,
  onChange,
}: {
  currentFaction: Faction | null;
  onChange: (faction: Faction) => void;
}) {
  const [selected, setSelected] = useState<Faction | null>(null);

  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-sm text-muted">
        바꿀 역할을 선택하세요. 기술과 능력치가 초기화되고, 사용한 SP와 AP를 모두 돌려받습니다.
      </p>
      <RadioGroup
        value={selected ?? ""}
        onValueChange={(value) => {
          setSelected(value as Faction);
          onChange(value as Faction);
        }}
        className="grid grid-cols-3 gap-2"
      >
        {(Object.keys(FACTION_POSITION_IMAGE) as Faction[]).map((faction) => (
          <label
            key={faction}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-transparent px-3 py-3 text-center transition-colors",
              selected === faction && "border-gold bg-gold/10",
            )}
          >
            <Image src={FACTION_POSITION_IMAGE[faction]} alt={faction} width={40} height={40} />
            <div className="flex items-center gap-2">
              <RadioGroupItem value={faction} />
              <span className="font-semibold text-ivory">{faction}</span>
            </div>
            {faction === currentFaction && <span className="text-xs text-muted">현재 역할</span>}
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}

function DeliveryDateSlotForm({
  takenDates,
  onChange,
}: {
  takenDates: string[];
  onChange: (payload: DeliveryPayload) => void;
}) {
  const [date, setDate] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">날짜 (미래 날짜만 선택 가능)</p>
        <DatePicker
          value={date}
          onChange={(value) => { setDate(value); onChange({ date: value, note }); }}
          minDate={tomorrow}
          disabledDates={takenDates}
        />
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">지문 입력란</p>
        <Textarea
          value={note}
          onChange={(event) => { setNote(event.target.value); onChange({ date: date ?? undefined, note: event.target.value }); }}
          rows={3}
          placeholder="출석부에 남길 지문을 입력하세요."
        />
      </div>
    </div>
  );
}

function DeliveryFreeformForm({
  characterId,
  recipients,
  onChange,
}: {
  characterId: number;
  recipients: { id: number; name: string }[];
  onChange: (payload: DeliveryPayload) => void;
}) {
  const { toast } = useToast();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [letter, setLetter] = useState("");
  const [recipientId, setRecipientId] = useState<number>();

  async function handleFileChange(file: File | null) {
    if (!file) return;
    // 다른 이미지 업로드 폼과 동일하게, 서버 업로드 완료를 기다리지 않고 먼저 로컬 미리보기를 보여준다.
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    try {
      const url = await uploadDeliveryImage(characterId, file);
      setImageUrl(url);
      onChange({ image_url: url, letter, recipient_id: recipientId });
    } catch (error) {
      toast(error instanceof Error ? error.message : "이미지 업로드 실패", "error");
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="space-y-1.5">
        <p id="gift-recipient-label" className="text-xs font-semibold text-muted">수신자 (러너·스태프 캐릭터 1명)</p>
        <Select value={recipientId?.toString() ?? ""} disabled={uploading} onValueChange={(value) => {
          const id = Number(value);
          setRecipientId(id);
          onChange({ image_url: imageUrl, letter, recipient_id: id });
        }}>
          <SelectTrigger aria-labelledby="gift-recipient-label"><SelectValue placeholder="선물 상자를 받을 캐릭터 선택" /></SelectTrigger>
          <SelectContent>{recipients.map((recipient) => <SelectItem key={recipient.id} value={String(recipient.id)}>{recipient.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">이미지 (선택)</p>
        {previewUrl && (
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-inset">
            {/* blob: 미리보기 URL은 next/image 옵티마이저가 처리할 수 없어 unoptimized로 렌더링한다. */}
            <Image src={imageUrl ?? previewUrl} alt="첨부 이미지 미리보기" fill unoptimized className="object-contain" />
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
          className="w-full text-xs text-muted file:mr-2 file:rounded-md file:border file:border-line file:bg-surface file:px-2 file:py-1 file:text-xs file:text-ivory"
        />
        {uploading && <p className="text-xs text-muted">업로드 중...</p>}
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">편지 (선택)</p>
        <Textarea
          value={letter}
          disabled={uploading}
          onChange={(event) => { setLetter(event.target.value); onChange({ image_url: imageUrl, letter: event.target.value, recipient_id: recipientId }); }}
          rows={3}
          placeholder="전달할 편지 내용을 입력하세요."
        />
      </div>
    </div>
  );
}

/** 모든 캐릭터가 지니는 소속 증표. 상점에서 사고파는 아이템이 아니라 화면에만 두는 항목이라
 *  구매 기록도 없고, 사용·장착 버튼이 없으며 전투 중 사용 가능한 아이템 목록에도 오르지 않는다. */
const GROUP_BADGE = {
  name: "조사단 증표",
  description: "당신이 대수림 동부 조사단의 일원임을 증명하는 증표이다",
  imageUrl: "/group_badge.png",
};

function GroupBadgeTile() {
  return (
    <div className="flex flex-col items-center gap-2">
      <InfoTooltip
        side="top"
        content={
          <div className="max-w-56 text-left">
            <div className="font-semibold">{GROUP_BADGE.name}</div>
            <div className="mt-1 text-muted">{GROUP_BADGE.description}</div>
          </div>
        }
      >
        <div className="relative flex size-14 shrink-0 cursor-default">
          <div className="relative flex size-full items-center justify-center overflow-hidden rounded-2xl bg-gold/10 text-gold">
            <Image src={GROUP_BADGE.imageUrl} alt={GROUP_BADGE.name} fill sizes="56px" unoptimized className="object-cover" />
          </div>
        </div>
      </InfoTooltip>
    </div>
  );
}

function OwnedItemTile({
  item,
  characterId,
  currentFaction,
  loading,
  readOnly = false,
  onUse,
  onEquip,
  onUnequip,
}: {
  item: CharacterOwnedItem;
  characterId: number;
  currentFaction: Faction | null;
  loading: boolean;
  readOnly?: boolean;
  onUse: (selection?: UseItemSelection) => void;
  onEquip: (selection?: UseItemSelection) => void;
  onUnequip: () => void;
}) {
  const { confirm } = useDialog();
  const { toast } = useToast();
  const isConsumable = item.item_type === "consumable";
  const remainingUses = item.quantity - item.used_quantity;
  const badgeCount = isConsumable ? remainingUses : item.quantity;
  const gradeChoiceEffect = item.effects.find(
    (effect) => effect.stat === "grade_choice_1" || effect.stat === "grade_choice_2",
  );
  const isFullReset = item.effects.some((effect) => effect.stat === "full_reset");
  const deliveryStat = item.effects.find(
    (effect) => effect.stat === "delivery_date_slot" || effect.stat === "delivery_freeform",
  )?.stat;

  return (
    <div className="flex flex-col items-center gap-2">
      <InfoTooltip
        side="top"
        content={
          <div className="max-w-56 text-left">
            <div className="font-semibold">{item.item_name}</div>
            {item.item_description && (
              <div className="mt-1 text-muted">{item.item_description}</div>
            )}
            {item.battle_only && (
              <div className="mt-1 text-gold">전투 중에만 사용할 수 있는 아이템입니다.</div>
            )}
          </div>
        }
      >
        <div className="relative flex size-14 shrink-0 cursor-default">
          <div
            className={cn(
              "relative flex size-full items-center justify-center overflow-hidden rounded-2xl bg-gold/10 text-gold",
              item.equipped && "ring-2 ring-gold",
            )}
          >
            {item.item_image_url ? (
              <Image src={item.item_image_url} alt={item.item_name} fill sizes="56px" unoptimized className="object-cover" />
            ) : (
              <Package size={22} />
            )}
          </div>
          {badgeCount > 0 && (
            <span className="font-num pointer-events-none absolute -bottom-1.5 -right-1.5 z-10 text-sm font-bold text-ivory [text-shadow:0_0_3px_white,0_0_3px_white,0_0_3px_white]">
              {badgeCount}
            </span>
          )}
        </div>
      </InfoTooltip>
      {readOnly || item.battle_only ? null : isConsumable ? (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            if (item.effects.some((effect) => effect.stat === "challenge_acquisition")) {
              try {
                const challenges = await fetchAcquisitionChallenges(characterId, item.item_id);
                if (!challenges.length) { toast("획득할 수 있는 미달성 도전과제가 없습니다.", "error"); return; }
                const selected: { current: number | undefined } = { current: undefined };
                const ok = await confirm({
                  title: "도전과제 획득",
                  description: `'${item.item_name}'을(를) 사용해 선택한 도전과제를 달성합니다.`,
                  confirmText: "사용하기",
                  content: <Select onValueChange={(value) => { selected.current = Number(value); }}>
                    <SelectTrigger className="mt-3 h-auto min-h-9 [&>span]:line-clamp-none [&>span]:whitespace-normal" aria-label="획득할 도전과제"><SelectValue placeholder="획득할 도전과제 선택" /></SelectTrigger>
                    <SelectContent>{challenges.map((challenge) => <SelectItem key={challenge.id} value={String(challenge.id)}>
                      {challenge.name}
                    </SelectItem>)}</SelectContent>
                  </Select>,
                });
                if (!ok) return;
                if (selected.current === undefined) { toast("도전과제를 선택해 주세요.", "error"); return; }
                onUse({ challengeId: selected.current });
              } catch (error) { toast(error instanceof Error ? error.message : "획득 가능한 도전과제 조회 실패", "error"); }
              return;
            }
            if (item.effects.some((effect) => effect.stat === "mission_exp_recollection")) {
              try {
                const missions = await fetchRecollectionMissions(characterId, item.item_id);
                if (!missions.length) { toast("회고할 수 있는 미달성 임무가 없습니다.", "error"); return; }
                const selected: { current: number | undefined } = { current: undefined };
                const ok = await confirm({
                  title: "회고록 사용",
                  description: "선택한 임무의 경험치만 받습니다.",
                  confirmText: "사용하기",
                  content: <Select onValueChange={(value) => { selected.current = Number(value); }}>
                    <SelectTrigger className="mt-3" aria-label="회고할 임무"><SelectValue placeholder="경험치를 받을 임무 선택" /></SelectTrigger>
                    <SelectContent>{missions.map((mission) => <SelectItem key={mission.id} value={String(mission.id)}>
                      {mission.name} · 경험치 {mission.reward_experience.toLocaleString()}
                    </SelectItem>)}</SelectContent>
                  </Select>,
                });
                if (!ok) return;
                if (selected.current === undefined) { toast("임무를 선택해 주세요.", "error"); return; }
                onUse({ missionId: selected.current });
              } catch (error) { toast(error instanceof Error ? error.message : "회고할 임무 조회 실패", "error"); }
              return;
            }
            if (isFullReset) {
              const chosenRef: { current: Faction | null } = { current: null };
              const ok = await confirm({
                title: "역할, 기술, 능력치 변경",
                description: `'${item.item_name}'을(를) 사용하시겠습니까?`,
                confirmText: "사용하기",
                content: (
                  <FactionChoiceSelector
                    currentFaction={currentFaction}
                    onChange={(faction) => { chosenRef.current = faction; }}
                  />
                ),
              });
              if (!ok) return;
              if (chosenRef.current === null) { toast("바꿀 역할을 선택해 주세요.", "error"); return; }
              onUse({ chosenFaction: chosenRef.current });
              return;
            }
            if (gradeChoiceEffect) {
              const requiredCount = gradeChoiceEffect.stat === "grade_choice_1" ? 1 : 2;
              const chosenRef: { current: string[] } = { current: [] };
              const ok = await confirm({
                title: "아이템 사용",
                description: `'${item.item_name}'을(를) 사용하시겠습니까?`,
                content: (
                  <GradeChoiceSelector
                    requiredCount={requiredCount}
                    onChange={(stats) => { chosenRef.current = stats; }}
                  />
                ),
              });
              if (ok) onUse({ chosenStats: chosenRef.current });
              return;
            }
            if (deliveryStat === "delivery_date_slot") {
              const takenDates = await fetchTakenDeliveryDates(item.item_id).catch(() => []);
              const payloadRef: { current: DeliveryPayload } = { current: {} };
              const ok = await confirm({
                title: "출석부 지문",
                confirmText: "요청하기",
                content: (
                  <DeliveryDateSlotForm
                    takenDates={takenDates}
                    onChange={(payload) => { payloadRef.current = payload; }}
                  />
                ),
              });
              if (!ok) return;
              if (!payloadRef.current.date || !(payloadRef.current.note || "").trim()) {
                toast("날짜와 지문을 모두 입력해 주세요.", "error");
                return;
              }
              onUse({ delivery: payloadRef.current });
              return;
            }
            if (deliveryStat === "delivery_freeform") {
              let recipients: { id: number; name: string }[];
              try { recipients = await fetchDeliveryRecipients(); }
              catch (error) { toast(error instanceof Error ? error.message : "수신자 목록 조회 실패", "error"); return; }
              if (!recipients.length) { toast("선택 가능한 수신자가 없습니다.", "error"); return; }
              const payloadRef: { current: DeliveryPayload } = { current: {} };
              const ok = await confirm({
                title: "선물 상자 배달 요청",
                confirmText: "요청하기",
                content: (
                  <DeliveryFreeformForm
                    recipients={recipients}
                    characterId={characterId}
                    onChange={(payload) => { payloadRef.current = payload; }}
                  />
                ),
              });
              if (!ok) return;
              if (!payloadRef.current.recipient_id) {
                toast("선물 상자를 받을 캐릭터를 선택해 주세요.", "error");
                return;
              }
              if (!payloadRef.current.image_url && !(payloadRef.current.letter || "").trim()) {
                toast("이미지 또는 편지 중 최소 하나는 입력해 주세요.", "error");
                return;
              }
              onUse({ delivery: payloadRef.current });
              return;
            }
            if (await confirm({ title: "아이템 사용", description: `'${item.item_name}'을(를) 사용하시겠습니까?` })) onUse();
          }}
          disabled={loading || remainingUses <= 0}
        >
          사용
        </Button>
      ) : item.equipped ? (
        <Button size="sm" variant="secondary" onClick={onUnequip} disabled={loading}>
          해제
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const chosen: { current: string[] } = { current: [] };
            const requiredCount = gradeChoiceEffect?.stat === "grade_choice_2" ? 2 : 1;
            if (await confirm({ title: "아이템 장착", description: `'${item.item_name}'을(를) 장착하시겠습니까?`,
              content: gradeChoiceEffect ? <GradeChoiceSelector requiredCount={requiredCount} onChange={(stats) => { chosen.current = stats; }} /> : undefined,
            })) onEquip({ chosenStats: chosen.current });
          }}
          disabled={loading || item.quantity <= 0}
        >
          장착
        </Button>
      )}
    </div>
  );
}

/** 달성한 도전과제·임무 타일. UI를 동일하게 맞추기 위해 공용으로 쓴다. */
function AchievedTile({
  name,
  description,
  imageUrl,
  rewardItems,
  items,
}: {
  name: string;
  description: string;
  imageUrl: string | null;
  rewardItems: RewardGrant[];
  items: Item[];
}) {
  return (
    <InfoTooltip
      side="top"
      content={
        <div className="max-w-56 text-left">
          <div className="font-semibold">{name}</div>
          {description && (
            <div className="mt-1 text-muted">{description}</div>
          )}
          <RewardSummary entries={rewardItems} items={items} className="mt-2" />
        </div>
      }
    >
      <div className="relative flex size-14 shrink-0 cursor-default items-center justify-center overflow-hidden bg-gold/10 text-gold">
        {imageUrl ? (
          <Image src={imageUrl} alt={name} fill sizes="56px" unoptimized className="object-cover" />
        ) : (
          <Trophy size={22} />
        )}
      </div>
    </InfoTooltip>
  );
}

const HISTORY_PREVIEW_COUNT = 6;
const HISTORY_PAGE_SIZE = 20;

function RewardHistoryRow({ reward }: { reward: Reward }) {
  const { icon: RewardIcon, iconClassName } = rewardVisual(reward);
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line px-4 py-4">
      <div className="flex items-center gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${iconClassName}`}>
          <RewardIcon size={18} />
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-ivory">
            {formatRewardItems(reward)}
          </p>
          <p className="text-sm text-muted">
            {reward.rewarded_at} ·{" "}
            <Badge variant="secondary" className="text-xs">
              {rewardLabel(reward)}
            </Badge>
          </p>
        </div>
      </div>
    </div>
  );
}

function ItemHistoryRow({ entry }: { entry: ItemHistoryEntry }) {
  const isUse = entry.kind === "use";
  // 기술/능력치 초기화 아이템은 되돌려받은 SP·AP를 이력에 함께 남긴다.
  const refunds = [
    { label: "SP", amount: entry.refunded_sp ?? 0 },
    { label: "AP", amount: entry.refunded_ap ?? 0 },
  ].filter((refund) => refund.amount > 0);
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line px-4 py-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full",
            isUse ? "bg-sky-500/10 text-sky-500" : "bg-gold/10 text-gold",
          )}
        >
          {entry.item_image_url ? (
            <Image src={entry.item_image_url} alt={entry.item_name} fill sizes="40px" unoptimized className="object-cover" />
          ) : (
            <Backpack size={18} />
          )}
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-ivory">{entry.item_name}</p>
          <p className="text-sm text-muted">
            {new Date(entry.created_at).toLocaleString("ko-KR")}
          </p>
          {refunds.length > 0 && (
            <p className="text-sm text-emerald-400">
              {refunds.map((refund) => `${refund.label} +${refund.amount.toLocaleString()}`).join(" · ")} 환급
            </p>
          )}
        </div>
      </div>
      {entry.delivery_status === "pending" ? (
        <Badge variant="warning">대기</Badge>
      ) : (
        <Badge variant={isUse ? "secondary" : "outline"}>
          {entry.quantity}개 {isUse ? "사용" : "구매"}
        </Badge>
      )}
    </div>
  );
}

function HistoryModal<T extends { id: number }>({
  open,
  onClose,
  title,
  items,
  renderItem,
  emptyText,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  emptyText: string;
}) {
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      setVisibleCount((prev) => Math.min(prev + HISTORY_PAGE_SIZE, items.length));
    }
  }

  const visibleItems = items.slice(0, visibleCount);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {items.length === 0 ? (
        <EmptyState className="rounded-2xl">{emptyText}</EmptyState>
      ) : (
        <>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1" onScroll={handleScroll}>
            {visibleItems.map((item) => (
              <div key={item.id}>{renderItem(item)}</div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-muted">
            {visibleItems.length} / {items.length}개 표시 중
          </p>
        </>
      )}
    </Modal>
  );
}

export default function CharacterInfo({
  characters,
  loading,
  showSelector = true,
  showId = true,
  focusCharacterId = null,
  readOnly = false,
  showHistory,
  onDeleted,
  adminMode = false,
}: Props) {
  const canViewHistory = showHistory ?? !readOnly;
  const { toast } = useToast();
  const { confirm } = useDialog();
  const [selectedCharacterIdState, setSelectedCharacterIdState] = useState<number | null>(focusCharacterId);
  const [detail, setDetail] = useState<CharacterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statUpgradeLoading, setStatUpgradeLoading] = useState<GradeStat | null>(null);
  const [adminSaving, setAdminSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [itemActionLoadingId, setItemActionLoadingId] = useState<number | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [deletingCharacter, setDeletingCharacter] = useState(false);
  const [rewardModalOpen, setRewardModalOpen] = useState(false);
  const [itemHistoryModalOpen, setItemHistoryModalOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    fetchItems().then(setItems).catch(console.error);
  }, []);

  const selectedCharacterId = characters.some(
    (character) => character.id === selectedCharacterIdState,
  )
    ? selectedCharacterIdState
    : (characters[0]?.id ?? null);
  const selectedDetail =
    detail != null && detail.id === selectedCharacterId ? detail : null;

  useEffect(() => {
    const characterId = selectedCharacterId;
    if (characterId == null) {
      return;
    }

    let cancelled = false;

    async function loadDetail(currentCharacterId: number) {
      try {
        setDetailLoading(true);
        const nextDetail = await fetchCharacterDetail(currentCharacterId);

        if (cancelled) return;

        setDetail(nextDetail);
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        toast(
          error instanceof Error ? error.message : "캐릭터 상세 정보를 불러오지 못했습니다.",
          "error",
        );
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    loadDetail(characterId);

    return () => {
      cancelled = true;
    };
  }, [selectedCharacterId, toast]);

  async function handleItemAction(
    itemId: number,
    action: (characterId: number, itemId: number, selection?: UseItemSelection) => Promise<CharacterDetail>,
    selection?: UseItemSelection,
  ) {
    if (selectedDetail == null) return;
    setItemActionLoadingId(itemId);
    try {
      const nextDetail = await action(selectedDetail.id, itemId, selection);
      setDetail(nextDetail);
    } catch (error) {
      toast(error instanceof Error ? error.message : "아이템 처리에 실패했습니다.", "error");
    } finally {
      setItemActionLoadingId(null);
    }
  }

  const canAdminEdit = adminMode && !readOnly && selectedDetail?.member_id === null;

  async function saveAdminFaction(nextFaction: Faction) {
    if (!selectedDetail) return;
    setAdminSaving(true);
    try { setDetail(await patchAdminCharacter(selectedDetail.id, { faction: nextFaction })); }
    catch (error) { toast(error instanceof Error ? error.message : "포지션 변경 실패", "error"); }
    finally { setAdminSaving(false); }
  }

  async function saveAdminStat(key: string, value: number | boolean) {
    if (!selectedDetail || !canAdminEdit) return;
    setAdminSaving(true);
    try { setDetail(await patchAdminCharacter(selectedDetail.id, { stats: { [key]: value } })); }
    finally { setAdminSaving(false); }
  }

  async function handleStatUpgrade(stat: GradeStat, label: string, cost: number) {
    if (selectedDetail == null) return;
    const accepted = await confirm({
      description: `${label} 등급을 올리시겠습니까?`,
      content: (
        <p className="text-xs text-muted">
          소모 AP {numberFormatter.format(cost)} / 보유 AP {numberFormatter.format(selectedDetail.ap)}
          <span className="mt-2 block">{Object.entries(selectedDetail.stat_upgrades?.[stat]?.changes ?? {}).map(([key, delta]) => formatEffect({ stat: key as ItemEffect["stat"], delta })).join(" · ")}</span>
        </p>
      ),
      maxWidthClassName: "max-w-xs",
    });
    if (!accepted) return;
    setStatUpgradeLoading(stat);
    try {
      const next = await upgradeCharacterStat(selectedDetail.id, stat, 1);
      setDetail(next);
    } catch (error) {
      toast(error instanceof Error ? error.message : "능력치 강화에 실패했습니다.", "error");
    } finally {
      setStatUpgradeLoading(null);
    }
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || selectedDetail == null) return;
    setImageUploading(true);
    setImageError(null);
    try {
      const next = await uploadCharacterImage(selectedDetail.id, file);
      setDetail(next);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "이미지 업로드에 실패했습니다.");
    } finally {
      setImageUploading(false);
    }
  }

  async function handleDeleteCharacter() {
    if (selectedDetail == null) return;
    const ok = await confirm({
      title: "캐릭터 삭제",
      description: "관련된 정보가 전부 사라집니다. 삭제하시겠습니까?",
      confirmText: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    setDeletingCharacter(true);
    try {
      await deleteCharacter(selectedDetail.id);
      onDeleted?.(selectedDetail.id);
    } catch (error) {
      toast(error instanceof Error ? error.message : "캐릭터 삭제에 실패했습니다.", "error");
    } finally {
      setDeletingCharacter(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted">
          캐릭터 정보를 준비하는 중입니다.
        </CardContent>
      </Card>
    );
  }

  if (characters.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted">
          조회할 캐릭터가 없습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {showSelector && (
        <Card>
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <CardTitle>캐릭터 정보</CardTitle>
            <div className="w-full md:w-60">
              <Select
                value={selectedCharacterId?.toString() ?? ""}
                onValueChange={(value) => setSelectedCharacterIdState(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="캐릭터 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {characters.map((character) => (
                      <SelectItem key={character.id} value={character.id.toString()}>
                        {character.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
        </Card>
      )}

      {detailLoading ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted">
            캐릭터 상세 정보를 불러오는 중입니다.
          </CardContent>
        </Card>
      ) : selectedDetail == null ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted">
            표시할 캐릭터 정보가 없습니다.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-6 pt-6 sm:flex-row sm:items-start">
              {/* 명함 좌측: 캐릭터 이미지 (정사각형 고정, 편집 가능) */}
              <div className="relative flex w-full shrink-0 flex-col gap-2 sm:w-40">
                <InfoTooltip
                  content={
                    <div className="max-w-52 whitespace-pre-line text-left">
                      <div className="font-semibold">
                        모험가 등급 {selectedDetail.rank} · {getRankGrade(selectedDetail.rank).name}
                      </div>
                      <div className="mt-1 text-muted">
                        {getRankGrade(selectedDetail.rank).description}
                      </div>
                    </div>
                  }
                >
                  <Image
                    src={getRankGrade(selectedDetail.rank).medalImage}
                    alt={`모험가 등급 ${getRankGrade(selectedDetail.rank).name}패`}
                    width={48}
                    height={48}
                    className="absolute -left-3 -top-3 z-10 cursor-help drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                  />
                </InfoTooltip>
                <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-line bg-inset">
                  {selectedDetail.image_url ? (
                    <Image src={selectedDetail.image_url} alt={`${selectedDetail.name} 이미지`} fill sizes="160px" unoptimized className="object-cover" />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-1 text-muted">
                      <ImageIcon size={30} />
                      <span className="text-xs font-medium">이미지</span>
                    </div>
                  )}
                  {!readOnly && (
                    <label className="group absolute inset-0 flex cursor-pointer items-center justify-center bg-ground/0 text-xs font-semibold text-ivory transition-colors hover:bg-ground/60">
                      <span className="flex flex-col items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="flex items-center gap-1">
                          <ImageIcon size={12} />
                          {imageUploading ? "업로드 중..." : "편집"}
                        </span>
                        <span className="text-[10px] font-normal text-ivory/80">(200*200 권장)</span>
                      </span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={imageUploading} />
                    </label>
                  )}
                </div>
                {imageError && <span className="text-[11px] text-red-500">{imageError}</span>}
                {/* key는 목록용이 아니라 캐릭터가 바뀔 때 내부 상태를 버리고 다시 마운트하려는 것이다.
                    형제끼리 값이 같으면 안 되므로 컴포넌트 이름을 앞에 붙여 구분한다. */}
                <div className="flex items-start gap-2">
                  <CharacterOwnedSkills key={`skills:${selectedDetail.id}`} characterId={selectedDetail.id} readOnly={readOnly} adminMode={canAdminEdit} onUpdated={setDetail} />
                  <CharacterClonedSkills key={`cloned:${selectedDetail.id}`} characterId={selectedDetail.id} readOnly={readOnly} />
                  <CharacterEquipmentSlots key={`equipment:${selectedDetail.id}`} character={selectedDetail} onUpdated={setDetail} readOnly={readOnly} />
                </div>
              </div>

              {/* 명함 우측: 정보 */}
              <div className="flex min-w-0 flex-1 flex-col gap-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="inline-flex w-fit items-center bg-linear-to-b from-gold/90 via-gold/55 to-gold/85 p-0.75 shadow-[0_2px_5px_rgba(0,0,0,0.55)] [clip-path:polygon(6%_0,94%_0,100%_50%,94%_100%,6%_100%,0_50%)]">
                    <div className="flex items-center gap-2 bg-linear-to-b from-primary-light/45 via-surface to-inset px-4 py-1.5 [clip-path:polygon(6%_0,94%_0,100%_50%,94%_100%,6%_100%,0_50%)]">
                      {selectedDetail.faction && (
                        <Image
                          src={FACTION_POSITION_IMAGE[selectedDetail.faction]}
                          alt={selectedDetail.faction}
                          width={28}
                          height={28}
                          className="[image-rendering:pixelated]"
                        />
                      )}
                      <CardTitle className="text-xl text-gold drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                        {selectedDetail.name}
                      </CardTitle>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedDetail.attendance_streak > 0 && (
                      <Badge className="gap-1 border border-orange-300 bg-orange-500/20 font-num text-orange-300">
                        <Flame size={12} />
                        연속 {selectedDetail.attendance_streak}일 출석!
                      </Badge>
                    )}
                    {showId && <Badge variant="outline" className="font-num">ID {selectedDetail.id}</Badge>}
                  </div>
                </div>

                {/* 성장 등급 · 경험치 */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="gap-1 font-num">
                    <Trophy size={12} />
                    {canAdminEdit ? <Select value={String(selectedDetail.lv)} disabled={adminSaving} onValueChange={async (value) => {
                      setAdminSaving(true);
                      try { setDetail(await patchAdminCharacter(selectedDetail.id, { lv: Number(value) })); }
                      catch (error) { toast(error instanceof Error ? error.message : "레벨 변경 실패", "error"); }
                      finally { setAdminSaving(false); }
                    }}><SelectTrigger aria-label="캐릭터 레벨" className="h-7 w-24"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: Math.max(MAX_CHARACTER_LEVEL, selectedDetail.lv) }, (_, index) => index + 1).map((level) => <SelectItem key={level} value={String(level)}>Lv.{level}</SelectItem>)}</SelectContent></Select> : `Lv.${selectedDetail.lv}`}
                  </Badge>
                  {canAdminEdit && (
                    <Badge variant="outline" className="gap-1">
                      <Select value={selectedDetail.faction ?? undefined} disabled={adminSaving}
                        onValueChange={(value) => saveAdminFaction(value as Faction)}>
                        <SelectTrigger aria-label="캐릭터 포지션" className="h-7 w-24"><SelectValue placeholder="포지션" /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(FACTION_POSITION_IMAGE) as Faction[]).map((value) => (
                            <SelectItem key={value} value={value}>{value}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Badge>
                  )}
                  <ExperienceBar
                    value={selectedDetail.exp}
                    max={GROWTH_EXP_PER_LEVEL}
                    cumulativeValue={(selectedDetail.lv - 1) * GROWTH_EXP_PER_LEVEL + selectedDetail.exp}
                    cumulativeMax={selectedDetail.lv * GROWTH_EXP_PER_LEVEL}
                  />
                  <Badge variant="outline" className="gap-1 font-num">
                    <Gauge size={12} className="text-gold" />
                    AP <EditableValue value={selectedDetail.ap} display={numberFormatter.format(selectedDetail.ap)}
                      label="AP" disabled={adminSaving}
                      onSave={canAdminEdit ? (value) => saveAdminStat("ap", value) : undefined} />
                  </Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <StatBar
                    onValueSave={canAdminEdit ? (value) => saveAdminStat("hp", value) : undefined}
                    onMaxSave={canAdminEdit ? (value) => saveAdminStat("hp_max", value) : undefined}
                    label="HP"
                    icon={Heart}
                    value={selectedDetail.hp}
                    max={selectedDetail.hp_max}
                    iconAccent="text-rose-500"
                    barColor="bg-rose-500"
                  />
                  <StatBar
                    onValueSave={canAdminEdit ? (value) => saveAdminStat("mp", value) : undefined}
                    onMaxSave={canAdminEdit ? (value) => saveAdminStat("mp_max", value) : undefined}
                    label="MP"
                    icon={Zap}
                    value={selectedDetail.mp}
                    max={selectedDetail.mp_max}
                    iconAccent="text-sky-500"
                    barColor="bg-sky-500"
                  />
                </div>

                {canAdminEdit && <p className="text-xs text-muted">레벨당 AP 2점이 지급됩니다. 능력치와 상세정보의 수치를 더블클릭하거나 키보드로 선택 후 Enter를 누르면 직접 수정할 수 있습니다.</p>}
                {/* 핵심 능력치 */}
                <div className="grid gap-2 sm:grid-cols-2 sm:gap-x-8">
                  {CORE_STATS.map(({ key, label, icon: Icon, accent }) => {
                    const cost = selectedDetail.stat_upgrades?.[key]?.cost ?? null;
                    const canUpgrade = !readOnly && cost != null && selectedDetail.ap >= cost;
                    return (
                      <CoreStatLine
                        key={key}
                        label={label}
                        icon={Icon}
                        value={selectedDetail[key]}
                        accent={accent}
                        canUpgrade={canUpgrade}
                        upgrading={statUpgradeLoading === key}
                        onUpgrade={() => cost != null && handleStatUpgrade(key, label, cost)}
                        onEdit={canAdminEdit ? (value) => saveAdminStat(key, value) : undefined}
                      />
                    );
                  })}
                </div>

                {/* 상세정보 (테두리 없는 펼치기 버튼) */}
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDetails((prev) => !prev)}
                    className="h-auto px-0 text-muted hover:bg-transparent hover:text-ivory"
                  >
                    {showDetails ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    상세정보 {showDetails ? "접기" : "펼치기"}
                  </Button>
                  {showDetails && (
                    <div className="mt-4 flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
                        {DETAIL_STATS.map(({ key, label, isFloat, rawPercent, description }) => (
                          <InfoTooltip key={key} side="top" content={description}>
                            <div className="flex min-w-0 cursor-help items-center justify-between gap-2 rounded-lg bg-inset px-2.5 py-2 text-[clamp(13px,0.95vw,15px)]">
                              <span className="shrink-0 whitespace-nowrap text-muted">{label}</span>
                              <span className="min-w-0 whitespace-nowrap font-bold tracking-normal tabular-nums text-ivory">
                                <EditableValue key={`${selectedDetail.id}:${key}`} label={label} disabled={adminSaving}
                                  value={isFloat ? Math.round((rawPercent ? Number(selectedDetail[key]) : 1 + Number(selectedDetail[key])) * 10000) / 100 : selectedDetail[key]}
                                  display={isFloat ? `${percentageFormatter.format((rawPercent ? Number(selectedDetail[key]) : 1 + Number(selectedDetail[key])) * 100)}%` : numberFormatter.format(selectedDetail[key])}
                                  onSave={canAdminEdit ? (value) => saveAdminStat(key, isFloat ? Number(value) / 100 - (rawPercent ? 0 : 1) : value) : undefined} />
                              </span>
                            </div>
                          </InfoTooltip>
                        ))}
                      </div>

                      {selectedDetail.start_sh != null && (
                        <div className="flex flex-col gap-3 border-t border-line pt-4">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                            <Lock size={12} />
                            관리자 전용 능력치
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
                            {ADMIN_ONLY_STATS.map(({ key, label, description, type }) => {
                              const value = selectedDetail[key];
                              if (value == null) return null;
                              return (
                                <InfoTooltip key={key} side="top" content={description}>
                                  <div className="flex min-w-0 cursor-help items-center justify-between gap-2 rounded-lg bg-gold/10 px-2.5 py-2 text-[clamp(13px,0.95vw,15px)]">
                                    <span className="shrink-0 whitespace-nowrap text-gold">{label}</span>
                                    <span className="min-w-0 whitespace-nowrap font-bold tracking-normal tabular-nums text-gold">
                                      <EditableValue key={`${selectedDetail.id}:${key}`} label={label} boolean={type === "boolean"} disabled={adminSaving} value={type === "percent" ? Number(value) * 100 : value} display={formatAdminOnlyStat(type, value)} onSave={canAdminEdit ? (next) => saveAdminStat(key, type === "percent" ? Number(next) / 100 : next) : undefined} />
                                    </span>
                                  </div>
                                </InfoTooltip>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>보유 중인 아이템</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1 font-num">
                  <Coins size={12} className="text-gold" />
                  {numberFormatter.format(selectedDetail.gold)} G
                </Badge>
                <Badge variant="outline" className="gap-1 font-num">
                  <Gem size={12} className="text-cyan-500" />
                  {numberFormatter.format(selectedDetail.cp)} CP
                </Badge>
                <Badge variant="outline" className="gap-1 font-num">
                  <Zap size={12} className="text-violet-500" />
                  SP {numberFormatter.format(selectedDetail.sp)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-4">
                <GroupBadgeTile />
                {selectedDetail.owned_items.map((item) => (
                  <OwnedItemTile
                    key={item.item_id}
                    item={item}
                    characterId={selectedDetail.id}
                    readOnly={readOnly}
                    loading={itemActionLoadingId === item.item_id}
                    currentFaction={selectedDetail.faction}
                    onUse={(selection) => handleItemAction(item.item_id, consumeItem, selection)}
                    onEquip={(selection) => handleItemAction(item.item_id, equipItem, selection)}
                    onUnequip={() => handleItemAction(item.item_id, unequipItem)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle>달성한 임무</CardTitle>
                <Badge variant="success" className="shrink-0 whitespace-nowrap">{selectedDetail.achieved_missions.length}개</Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {selectedDetail.achieved_missions.length > 0 ? (
                  <div className="flex flex-wrap gap-4">
                    {selectedDetail.achieved_missions.map((mission) => (
                      <AchievedTile
                        key={mission.mission_id}
                        name={mission.name}
                        description={mission.description}
                        imageUrl={mission.image_url}
                        rewardItems={mission.reward_items}
                        items={items}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState className="rounded-2xl">
                    아직 달성한 임무가 없습니다.
                  </EmptyState>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle>달성한 도전과제</CardTitle>
                <Badge variant="success" className="shrink-0 whitespace-nowrap">{selectedDetail.achieved_challenges.length}개</Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {selectedDetail.achieved_challenges.length > 0 ? (
                  <div className="flex flex-wrap gap-4">
                    {selectedDetail.achieved_challenges.map((challenge) => (
                      <AchievedTile
                        key={challenge.challenge_id}
                        name={challenge.name}
                        description={challenge.description}
                        imageUrl={challenge.image_url}
                        rewardItems={challenge.reward_items}
                        items={items}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState className="rounded-2xl">
                    아직 달성한 도전과제가 없습니다.
                  </EmptyState>
                )}
              </CardContent>
            </Card>
          </div>

          {canViewHistory && <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle>보상 이력</CardTitle>
                {selectedDetail.reward_history.length > HISTORY_PREVIEW_COUNT && (
                  <button
                    type="button"
                    onClick={() => setRewardModalOpen(true)}
                    className="shrink-0 text-sm font-semibold text-gold hover:underline"
                  >
                    더보기
                  </button>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {selectedDetail.reward_history.length > 0 ? (
                  selectedDetail.reward_history
                    .slice(0, HISTORY_PREVIEW_COUNT)
                    .map((reward) => <RewardHistoryRow key={reward.id} reward={reward} />)
                ) : (
                  <EmptyState className="rounded-2xl">
                    지급된 보상이 없습니다.
                  </EmptyState>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle>구매/사용 이력</CardTitle>
                {selectedDetail.item_history.length > HISTORY_PREVIEW_COUNT && (
                  <button
                    type="button"
                    onClick={() => setItemHistoryModalOpen(true)}
                    className="shrink-0 text-sm font-semibold text-gold hover:underline"
                  >
                    더보기
                  </button>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {selectedDetail.item_history.length > 0 ? (
                  selectedDetail.item_history
                    .slice(0, HISTORY_PREVIEW_COUNT)
                    .map((entry) => <ItemHistoryRow key={entry.id} entry={entry} />)
                ) : (
                  <EmptyState className="rounded-2xl">
                    구매/사용 이력이 없습니다.
                  </EmptyState>
                )}
              </CardContent>
            </Card>

            {rewardModalOpen && (
              <HistoryModal
                open={rewardModalOpen}
                onClose={() => setRewardModalOpen(false)}
                title="보상 이력"
                items={selectedDetail.reward_history}
                renderItem={(reward) => <RewardHistoryRow reward={reward} />}
                emptyText="지급된 보상이 없습니다."
              />
            )}
            {itemHistoryModalOpen && (
              <HistoryModal
                open={itemHistoryModalOpen}
                onClose={() => setItemHistoryModalOpen(false)}
                title="구매/사용 이력"
                items={selectedDetail.item_history}
                renderItem={(entry) => <ItemHistoryRow entry={entry} />}
                emptyText="구매/사용 이력이 없습니다."
              />
            )}
          </div>}

          {!readOnly && onDeleted && (
            <div className="flex justify-end gap-2">
              <Button variant="destructive" onClick={handleDeleteCharacter} disabled={deletingCharacter}>
                  <Trash2 size={15} />
                  {deletingCharacter ? "삭제 중..." : "캐릭터 삭제하기"}
                </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
