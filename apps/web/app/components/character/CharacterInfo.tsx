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
  Gem,
  Gift,
  Heart,
  HeartHandshake,
  Package,
  Receipt,
  Shield,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";

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
import { fetchCharacterDetail } from "@/lib/api";
import type { Character, CharacterDetail, Reward } from "@/lib/api";

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
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="flex items-center justify-between text-sm font-semibold text-slate-500">
        <span className="flex items-center gap-2">
          <Icon size={15} className={iconAccent} />
          {label}
        </span>
        <span className="text-slate-700">
          {numberFormatter.format(value)} / {numberFormatter.format(max)}
        </span>
      </div>
      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function CharacterInfo({
  characters,
  loading,
  showSelector = true,
  showId = true,
  focusCharacterId = null,
}: Props) {
  const [selectedCharacterIdState, setSelectedCharacterIdState] = useState<number | null>(null);
  const [detail, setDetail] = useState<CharacterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (focusCharacterId != null) setSelectedCharacterIdState(focusCharacterId);
  }, [focusCharacterId]);

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
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-1.5">
                  <CardTitle className="text-xl">{selectedDetail.name}</CardTitle>
                  <CardDescription>
                    캐릭터 목록에서 보이는 기본 정보와 추가 능력치를 함께 제공합니다.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {showId && <Badge variant="outline">ID {selectedDetail.id}</Badge>}
                  {selectedDetail.faction && <Badge variant="secondary">{selectedDetail.faction}</Badge>}
                  <Badge variant="outline" className="gap-1">
                    <Coins size={12} className="text-amber-500" />
                    {numberFormatter.format(selectedDetail.gold)} G
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Gem size={12} className="text-cyan-500" />
                    {numberFormatter.format(selectedDetail.cp)} CP
                  </Badge>
                </div>
              </div>

              {/* 성장 등급 배지 */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge className="gap-1">
                  <Trophy size={12} />
                  성장 등급 Lv.{selectedDetail.lv}
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <Award size={12} />
                  모험가 등급 {selectedDetail.rank}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Sparkles size={12} className="text-violet-500" />
                  경험치 {numberFormatter.format(selectedDetail.exp)}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-6">
              {/* 자주 변하는 스탯: 상태 바 */}
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

              {/* 적게 변하는 능력치 */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {CORE_STATS.map(({ key, label, icon: Icon, accent }) => (
                  <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                      <Icon size={15} className={accent} />
                      {label}
                    </div>
                    <p className="mt-3 text-2xl font-bold text-slate-900">
                      {numberFormatter.format(selectedDetail[key])}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <CardTitle>상세정보</CardTitle>
                <CardDescription>공격·방어·체력·마나·기술 관련 세부 능력치입니다.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowDetails((prev) => !prev)}>
                {showDetails ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                {showDetails ? "접기" : "펼치기"}
              </Button>
            </CardHeader>
            {showDetails && (
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {DETAIL_STATS.map(({ key, label, isFloat }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold text-slate-800">
                      {isFloat
                        ? Number(selectedDetail[key]).toFixed(2)
                        : numberFormatter.format(selectedDetail[key])}
                    </span>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <CardTitle>보유 중인 아이템</CardTitle>
                  <CardDescription>
                    구매 기록을 기준으로 현재 보유한 아이템 수량을 집계했습니다.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="shrink-0 whitespace-nowrap">{selectedDetail.owned_items.length}종</Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {selectedDetail.owned_items.length > 0 ? (
                  selectedDetail.owned_items.map((item) => (
                    <div
                      key={item.item_id}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                          <Package size={18} />
                        </span>
                        <div className="flex flex-col gap-1">
                          <p className="font-semibold text-slate-900">{item.item_name}</p>
                          <p className="text-sm text-slate-500">아이템 ID {item.item_id}</p>
                        </div>
                      </div>
                      <Badge variant="default">{item.quantity}개</Badge>
                    </div>
                  ))
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
