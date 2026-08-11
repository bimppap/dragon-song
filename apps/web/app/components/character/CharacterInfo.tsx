"use client";

import { useEffect, useState } from "react";
import {
  Award,
  Backpack,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Coins,
  Flame,
  Gauge,
  Gem,
  Gift,
  Heart,
  HeartHandshake,
  Image as ImageIcon,
  Lock,
  Package,
  Receipt,
  Shield,
  Trophy,
  Zap,
} from "lucide-react";
import InfoTooltip from "@/components/common/InfoTooltip";
import CharacterOwnedSkills from "./CharacterOwnedSkills";

const REWARD_TYPE_LABELS: Record<string, string> = {
  attendance: "출석",
  challenge: "도전과제",
  mission: "임무",
};

function formatRewardItems(reward: Reward): string {
  if (!reward.reward_items || reward.reward_items.length === 0) return "보상 없음";
  return reward.reward_items
    .map((item) => {
      switch (item.type) {
        case "gold": return `골드 +${(item.amount ?? 0).toLocaleString()}G`;
        case "experience": return `경험치 +${(item.amount ?? 0).toLocaleString()}`;
        case "ap": return `AP +${item.amount ?? 0}`;
        case "stat_hp": return `HP +${item.amount ?? 0}`;
        case "stat_attack": return `공격력 +${item.amount ?? 0}`;
        case "stat_defense": return `방어력 +${item.amount ?? 0}`;
        case "item": return `아이템 ID${item.item_id} ×${item.quantity ?? 1}`;
        default: return item.type;
      }
    })
    .join("  /  ");
}
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { equipItem, fetchCharacterDetail, unequipItem, useItem } from "@/lib/api";
import type { Character, CharacterDetail, CharacterOwnedItem, Reward } from "@/lib/api";

interface Props {
  characters: Character[];
  loading: boolean;
  showSelector?: boolean;
  showId?: boolean;
  focusCharacterId?: number | null;
}

const numberFormatter = new Intl.NumberFormat("ko-KR");

const CORE_STATS: {
  key: keyof Pick<CharacterDetail, "stat_courage" | "stat_endurance" | "stat_charity" | "stat_wisdom">;
  label: string;
  icon: React.ElementType;
  accent: string;
}[] = [
  { key: "stat_courage", label: "용기", icon: Flame, accent: "text-red-500" },
  { key: "stat_endurance", label: "인내", icon: Shield, accent: "text-blue-500" },
  { key: "stat_charity", label: "자애", icon: HeartHandshake, accent: "text-pink-500" },
  { key: "stat_wisdom", label: "지혜", icon: BookOpen, accent: "text-indigo-500" },
];

const RANK_GRADES = [
  {
    name: "동",
    description: "기본적인 전투 감각을 익히는 입문 등급입니다.",
    badgeClass: "border-amber-800 bg-amber-100 text-amber-900",
  },
  {
    name: "은",
    description: "기본 전투를 안정적으로 수행할 수 있는 숙련 등급입니다.",
    badgeClass: "border-slate-400 bg-slate-200 text-slate-700",
  },
  {
    name: "금",
    description: "전투와 파티 운영에서 중심 역할을 맡는 상위 등급입니다.",
    badgeClass: "border-yellow-500 bg-yellow-100 text-yellow-800",
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
    "atk" | "atk_p" | "def" | "def_p" | "def_eff" | "attn" | "presence" | "hp" | "hp_max" |
    "hp_max_p" | "hp_regen_true" | "hp_regen_fixed" | "heal_eff" | "heal_eff_p" | "mp" |
    "mp_max" | "mp_regen" | "sh" | "dmg_p" | "dmg_r" | "skill_lv" | "skill_eff_true" |
    "skill_eff_fixed" | "skill_cost" | "skill_target"
  >;
  label: string;
  isFloat?: boolean;
}[] = [
  { key: "atk", label: "공격력" },
  { key: "atk_p", label: "공격력 증폭(%)", isFloat: true },
  { key: "def", label: "방어력" },
  { key: "def_p", label: "방어력 증폭(%)", isFloat: true },
  { key: "def_eff", label: "방어 효율", isFloat: true },
  { key: "attn", label: "주목도" },
  { key: "presence", label: "존재감", isFloat: true },
  { key: "hp", label: "현재 체력" },
  { key: "hp_max", label: "최대 체력" },
  { key: "hp_max_p", label: "체력 증폭(%)", isFloat: true },
  { key: "hp_regen_true", label: "체력 재생력(고정)" },
  { key: "hp_regen_fixed", label: "체력 재생력(비례)", isFloat: true },
  { key: "heal_eff", label: "치유 효율", isFloat: true },
  { key: "heal_eff_p", label: "치유 효율 증폭", isFloat: true },
  { key: "mp", label: "마나" },
  { key: "mp_max", label: "마나 최대치" },
  { key: "mp_regen", label: "마나 재생력" },
  { key: "sh", label: "보호막" },
  { key: "dmg_p", label: "피해 증폭", isFloat: true },
  { key: "dmg_r", label: "피해 감소", isFloat: true },
  { key: "skill_lv", label: "기술 등급" },
  { key: "skill_eff_true", label: "기술 효율(고정)" },
  { key: "skill_eff_fixed", label: "기술 효율(비례)", isFloat: true },
  { key: "skill_cost", label: "기술 비용" },
  { key: "skill_target", label: "기술 대상" },
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

function StatBar({
  label,
  icon: Icon,
  value,
  max,
  iconAccent,
  barColor,
}: {
  label: string;
  icon: React.ElementType;
  value: number;
  max: number;
  iconAccent: string;
  barColor: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
        <span className="flex items-center gap-2">
          <Icon size={15} className={iconAccent} />
          {label}
        </span>
        <span className="font-num text-slate-700">
          {numberFormatter.format(value)} / {numberFormatter.format(max)}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
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
}: {
  label: string;
  icon: React.ElementType;
  value: number;
  accent: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 py-2 last:border-b-0">
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <Icon size={15} className={accent} />
        {label}
      </span>
      <span className="font-num text-base font-semibold text-slate-900">
        {numberFormatter.format(value)}
      </span>
    </div>
  );
}

function getExperienceCap(level: number, experience: number) {
  return Math.max(1000, level * 1000, experience);
}

function ExperienceBar({
  value,
  max,
}: {
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <InfoTooltip content={`경험치 ${numberFormatter.format(value)} / ${numberFormatter.format(max)}`}>
      <span className="inline-flex w-40 items-center">
        <span className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
          <span
            className="block h-full rounded-full bg-violet-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </span>
      </span>
    </InfoTooltip>
  );
}

function OwnedItemTile({
  item,
  loading,
  onUse,
  onEquip,
  onUnequip,
}: {
  item: CharacterOwnedItem;
  loading: boolean;
  onUse: () => void;
  onEquip: () => void;
  onUnequip: () => void;
}) {
  const isConsumable = item.item_type === "consumable";
  const remainingUses = item.quantity - item.used_quantity;
  const badgeCount = isConsumable ? remainingUses : item.quantity;

  return (
    <div className="flex flex-col items-center gap-2">
      <InfoTooltip
        side="top"
        content={
          <div className="max-w-56 text-left">
            <div className="font-semibold">{item.item_name}</div>
            {item.item_description && (
              <div className="mt-1 text-slate-300">{item.item_description}</div>
            )}
          </div>
        }
      >
        <div
          className={cn(
            "relative flex size-14 shrink-0 cursor-default items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600",
            item.equipped && "ring-2 ring-indigo-500",
          )}
        >
          <Package size={22} />
          <span className="font-num pointer-events-none absolute -bottom-1.5 -right-1.5 text-sm font-bold text-slate-900 [text-shadow:0_0_3px_white,0_0_3px_white,0_0_3px_white]">
            {badgeCount}
          </span>
        </div>
      </InfoTooltip>
      {isConsumable ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => { if (window.confirm(`'${item.item_name}'을(를) 사용하시겠습니까?`)) onUse(); }}
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
          onClick={() => { if (window.confirm(`'${item.item_name}'을(를) 장착하시겠습니까?`)) onEquip(); }}
          disabled={loading || item.quantity <= 0}
        >
          장착
        </Button>
      )}
    </div>
  );
}

export default function CharacterInfo({
  characters,
  loading,
  showSelector = true,
  showId = true,
}: Props) {
  const [selectedCharacterIdState, setSelectedCharacterIdState] = useState<number | null>(null);
  const [detail, setDetail] = useState<CharacterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [itemActionLoadingId, setItemActionLoadingId] = useState<number | null>(null);
  const [itemActionError, setItemActionError] = useState<string | null>(null);

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
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setErrorMessage(
          error instanceof Error ? error.message : "캐릭터 상세 정보를 불러오지 못했습니다.",
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
  }, [selectedCharacterId]);

  async function handleItemAction(
    itemId: number,
    action: (characterId: number, itemId: number) => Promise<CharacterDetail>,
  ) {
    if (selectedDetail == null) return;
    setItemActionLoadingId(itemId);
    setItemActionError(null);
    try {
      const nextDetail = await action(selectedDetail.id, itemId);
      setDetail(nextDetail);
    } catch (error) {
      setItemActionError(error instanceof Error ? error.message : "아이템 처리에 실패했습니다.");
    } finally {
      setItemActionLoadingId(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-slate-500">
          캐릭터 정보를 준비하는 중입니다.
        </CardContent>
      </Card>
    );
  }

  if (characters.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-slate-500">
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
            <div className="flex flex-col gap-1.5">
              <CardTitle>캐릭터 정보</CardTitle>
              <CardDescription>
                캐릭터를 이름으로 선택하면 기본 능력치, 아이템, 도전과제, 구매 이력을 확인할 수 있습니다.
              </CardDescription>
            </div>
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

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMessage}
        </div>
      )}

      {detailLoading ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-slate-500">
            캐릭터 상세 정보를 불러오는 중입니다.
          </CardContent>
        </Card>
      ) : selectedDetail == null ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-slate-500">
            표시할 캐릭터 정보가 없습니다.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-6 pt-6 sm:flex-row sm:items-start">
              {/* 명함 좌측: 캐릭터 이미지 자리 (상세정보 펼침과 무관하게 고정 크기) */}
              <div className="flex aspect-3/4 w-full shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 sm:w-40">
                <div className="flex flex-col items-center gap-1 text-slate-300">
                  <ImageIcon size={30} />
                  <span className="text-xs font-medium">이미지</span>
                </div>
              </div>

              {/* 명함 우측: 정보 */}
              <div className="flex min-w-0 flex-1 flex-col gap-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <CardTitle className="text-xl">{selectedDetail.name}</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    {showId && <Badge variant="outline" className="font-num">ID {selectedDetail.id}</Badge>}
                    {selectedDetail.faction && <Badge variant="secondary">{selectedDetail.faction}</Badge>}
                    <Badge variant="outline" className="gap-1 font-num">
                      <Coins size={12} className="text-amber-500" />
                      {numberFormatter.format(selectedDetail.gold)} G
                    </Badge>
                    <Badge variant="outline" className="gap-1 font-num">
                      <Gem size={12} className="text-cyan-500" />
                      {numberFormatter.format(selectedDetail.cp)} CP
                    </Badge>
                  </div>
                </div>

                {/* 성장 등급 · 경험치 · AP */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="gap-1 font-num">
                    <Trophy size={12} />
                    성장 등급 Lv.{selectedDetail.lv}
                  </Badge>
                  <InfoTooltip
                    content={
                      <div className="max-w-52 whitespace-pre-line text-left">
                        <div className="font-semibold">
                          {getRankGrade(selectedDetail.rank).name}
                        </div>
                        <div className="mt-1 text-slate-300">
                          {getRankGrade(selectedDetail.rank).description}
                        </div>
                      </div>
                    }
                  >
                    <Badge className={cn("gap-1 font-num cursor-help border", getRankGrade(selectedDetail.rank).badgeClass)}>
                      <Award size={12} />
                      모험가 등급 {selectedDetail.rank}
                    </Badge>
                  </InfoTooltip>
                  <ExperienceBar
                    value={selectedDetail.exp}
                    max={getExperienceCap(selectedDetail.lv, selectedDetail.exp)}
                  />
                  <Badge variant="outline" className="gap-1 font-num">
                    <Gauge size={12} className="text-indigo-500" />
                    AP {numberFormatter.format(selectedDetail.ap)}
                  </Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <StatBar
                    label="HP"
                    icon={Heart}
                    value={selectedDetail.hp}
                    max={selectedDetail.hp_max}
                    iconAccent="text-rose-500"
                    barColor="bg-rose-500"
                  />
                  <StatBar
                    label="MP"
                    icon={Zap}
                    value={selectedDetail.mp}
                    max={selectedDetail.mp_max}
                    iconAccent="text-sky-500"
                    barColor="bg-sky-500"
                  />
                </div>

                {/* 핵심 능력치 + 보유 기술 */}
                <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
                  <div className="grid gap-2 sm:grid-cols-2 sm:gap-x-8">
                    {CORE_STATS.map(({ key, label, icon: Icon, accent }) => (
                      <CoreStatLine
                        key={key}
                        label={label}
                        icon={Icon}
                        value={selectedDetail[key]}
                        accent={accent}
                      />
                    ))}
                  </div>
                  <CharacterOwnedSkills
                    characterId={selectedDetail.id}
                    faction={selectedDetail.faction}
                  />
                </div>

                {/* 상세정보 (테두리 없는 펼치기 버튼) */}
                <div className="border-t border-slate-200 pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDetails((prev) => !prev)}
                    className="h-auto px-0 text-slate-500 hover:bg-transparent hover:text-slate-800"
                  >
                    {showDetails ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    상세정보 {showDetails ? "접기" : "펼치기"}
                  </Button>
                  {showDetails && (
                    <div className="mt-4 flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {DETAIL_STATS.map(({ key, label, isFloat }) => (
                          <div
                            key={key}
                            className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                          >
                            <span className="text-slate-500">{label}</span>
                            <span className="font-num font-semibold text-slate-800">
                              {isFloat
                                ? `${(Number(selectedDetail[key]) * 100).toFixed(1)}%`
                                : numberFormatter.format(selectedDetail[key])}
                            </span>
                          </div>
                        ))}
                      </div>

                      {selectedDetail.start_sh != null && (
                        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                            <Lock size={12} />
                            관리자 전용 능력치
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                            {ADMIN_ONLY_STATS.map(({ key, label, description, type }) => {
                              const value = selectedDetail[key];
                              if (value == null) return null;
                              return (
                                <InfoTooltip key={key} side="top" content={description}>
                                  <div className="flex cursor-help items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm">
                                    <span className="text-amber-700">{label}</span>
                                    <span className="font-num font-semibold text-amber-900">
                                      {formatAdminOnlyStat(type, value)}
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

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>보유 중인 아이템</CardTitle>
                <CardDescription>
                  구매 기록을 기준으로 현재 보유한 아이템 수량을 집계했습니다. 아이템에 마우스를 올리면 이름과 설명이 보입니다.
                  소모형은 &apos;사용&apos;해야, 장착형은 &apos;장착&apos;해야 능력치에 반영됩니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {itemActionError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
                    {itemActionError}
                  </div>
                )}
                {selectedDetail.owned_items.length > 0 ? (
                  <div className="flex flex-wrap gap-4">
                    {selectedDetail.owned_items.map((item) => (
                      <OwnedItemTile
                        key={item.item_id}
                        item={item}
                        loading={itemActionLoadingId === item.item_id}
                        onUse={() => handleItemAction(item.item_id, useItem)}
                        onEquip={() => handleItemAction(item.item_id, equipItem)}
                        onUnequip={() => handleItemAction(item.item_id, unequipItem)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                    보유 중인 아이템이 없습니다.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <CardTitle>달성한 도전과제</CardTitle>
                  <CardDescription>
                    캐릭터가 완료 처리한 도전과제만 표시합니다.
                  </CardDescription>
                </div>
                <Badge variant="success" className="shrink-0 whitespace-nowrap">{selectedDetail.achieved_challenges.length}개</Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {selectedDetail.achieved_challenges.length > 0 ? (
                  selectedDetail.achieved_challenges.map((challenge) => (
                    <div
                      key={challenge.challenge_id}
                      className="rounded-2xl border border-slate-200 px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-1">
                          <p className="font-semibold text-slate-900">{challenge.name}</p>
                          <p className="text-sm text-slate-500">{challenge.description}</p>
                        </div>
                        <Badge variant="outline">{challenge.chapter}</Badge>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                        <Trophy size={14} className="text-indigo-500" />
                        {challenge.reward}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                    아직 달성한 도전과제가 없습니다.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle>보상 이력</CardTitle>
                <CardDescription>
                  지급된 보상 내역을 최신순으로 표시합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {selectedDetail.reward_history.length > 0 ? (
                  selectedDetail.reward_history.map((reward) => (
                    <div
                      key={reward.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                          <Gift size={18} />
                        </span>
                        <div className="flex flex-col gap-1">
                          <p className="font-semibold text-slate-900">
                            {formatRewardItems(reward)}
                          </p>
                          <p className="text-sm text-slate-500">
                            {reward.rewarded_at} ·{" "}
                            <Badge variant="secondary" className="text-xs">
                              {REWARD_TYPE_LABELS[reward.type] ?? reward.type}
                            </Badge>
                          </p>
                        </div>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Receipt size={12} />
                        #{reward.id}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                    지급된 보상이 없습니다.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>구매 이력</CardTitle>
                <CardDescription>
                  아이템 구매 기록을 최신순으로 표시합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {selectedDetail.purchase_history.length > 0 ? (
                  selectedDetail.purchase_history.map((purchase) => (
                    <div
                      key={purchase.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                          <Backpack size={18} />
                        </span>
                        <div className="flex flex-col gap-1">
                          <p className="font-semibold text-slate-900">{purchase.item_name}</p>
                          <p className="text-sm text-slate-500">
                            {new Date(purchase.created_at).toLocaleString("ko-KR")}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="secondary">{purchase.quantity}개 구매</Badge>
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Receipt size={12} />
                          구매 ID {purchase.id}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                    구매 이력이 없습니다.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
