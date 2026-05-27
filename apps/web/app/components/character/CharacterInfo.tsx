"use client";

import { useEffect, useState } from "react";
import {
  Backpack,
  Coins,
  Flame,
  Gift,
  Heart,
  Package,
  Receipt,
  Shield,
  Sparkles,
  Sword,
  Trophy,
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
import { fetchCharacterDetail } from "@/lib/api";
import type { Character, CharacterDetail, Reward } from "@/lib/api";

interface Props {
  characters: Character[];
  loading: boolean;
}

const numberFormatter = new Intl.NumberFormat("ko-KR");

const SUMMARY_FIELDS: {
  key: keyof Pick<
    CharacterDetail,
    "hp" | "attack" | "defense" | "gold" | "ap" | "experience"
  >;
  label: string;
  icon: React.ElementType;
  accent: string;
  suffix?: string;
}[] = [
  { key: "hp", label: "HP", icon: Heart, accent: "text-rose-500" },
  { key: "attack", label: "공격력", icon: Sword, accent: "text-orange-500" },
  { key: "defense", label: "방어력", icon: Shield, accent: "text-blue-500" },
  { key: "gold", label: "골드", icon: Coins, accent: "text-amber-500", suffix: "G" },
  { key: "ap", label: "AP", icon: Flame, accent: "text-indigo-500" },
  { key: "experience", label: "경험치", icon: Sparkles, accent: "text-violet-500" },
];

export default function CharacterInfo({ characters, loading }: Props) {
  const [selectedCharacterIdState, setSelectedCharacterIdState] = useState<number | null>(null);
  const [detail, setDetail] = useState<CharacterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
                  <Badge variant="outline">ID {selectedDetail.id}</Badge>
                  <Badge variant="secondary">보유 아이템 {selectedDetail.owned_items.length}종</Badge>
                  <Badge variant="success">
                    달성 도전과제 {selectedDetail.achieved_challenges.length}개
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {SUMMARY_FIELDS.map(({ key, label, icon: Icon, accent, suffix }) => (
                <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                    <Icon size={15} className={accent} />
                    {label}
                  </div>
                  <p className="mt-3 text-2xl font-bold text-slate-900">
                    {numberFormatter.format(selectedDetail[key])}
                    {suffix ? ` ${suffix}` : ""}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>보유 중인 아이템</CardTitle>
                <CardDescription>
                  구매 기록을 기준으로 현재 보유한 아이템 수량을 집계했습니다.
                </CardDescription>
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
              <CardHeader>
                <CardTitle>달성한 도전과제</CardTitle>
                <CardDescription>
                  캐릭터가 완료 처리한 도전과제만 표시합니다.
                </CardDescription>
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
