import {
  CalendarDays,
  Coins,
  Gift,
  HeartPulse,
  RotateCcw,
  Sparkles,
  Swords,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { EFFECT_STAT_LABELS } from "./api";
import type { Reward } from "./api";

/** Reward.type → 보상 이력에 표시할 한글 라벨. */
export const REWARD_TYPE_LABELS: Record<string, string> = {
  attendance: "출석 보상",
  battle: "전투",
  challenge: "도전과제",
  mission: "임무",
  admin_gift: "관리자의 선물",
  settlement: "로그 정산",
  revoke: "보상 회수",
  growth: "성장",
  heal: "치료",
};

interface RewardVisual {
  icon: LucideIcon;
  iconClassName: string;
}

const DEFAULT_REWARD_VISUAL: RewardVisual = {
  icon: Gift,
  iconClassName: "bg-white/10 text-ivory/85",
};

const REWARD_TYPE_VISUALS: Record<string, RewardVisual> = {
  attendance: { icon: CalendarDays, iconClassName: "bg-sky-500/15 text-sky-300" },
  battle: { icon: Swords, iconClassName: "bg-rose-500/15 text-rose-300" },
  challenge: { icon: Trophy, iconClassName: "bg-amber-500/15 text-amber-300" },
  mission: { icon: Target, iconClassName: "bg-violet-500/15 text-violet-300" },
  admin_gift: { icon: Gift, iconClassName: "bg-emerald-500/15 text-emerald-400" },
  settlement: { icon: Coins, iconClassName: "bg-gold/10 text-gold" },
  revoke: { icon: RotateCcw, iconClassName: "bg-red-500/15 text-red-300" },
  growth: { icon: Sparkles, iconClassName: "bg-cyan-500/15 text-cyan-300" },
  heal: { icon: HeartPulse, iconClassName: "bg-emerald-500/15 text-emerald-300" },
};

/** 보상 이력에 표시할 라벨. 커스텀 label(예: "OO의 치료")이 있으면 그걸 우선한다. */
export function rewardLabel(reward: Reward): string {
  return reward.label ?? REWARD_TYPE_LABELS[reward.type] ?? reward.type;
}

/** 보상 이력의 좌측 배지에 사용할 아이콘과 톤. */
export function rewardVisual(reward: Reward): RewardVisual {
  return REWARD_TYPE_VISUALS[reward.type] ?? DEFAULT_REWARD_VISUAL;
}

function signed(amount: number): string {
  return `${amount >= 0 ? "+" : ""}${amount.toLocaleString()}`;
}

/** 보상 항목 목록을 "골드 +10G / CP +1" 형태의 문자열로 표현한다. */
export function formatRewardItems(reward: Reward): string {
  if (!reward.reward_items || reward.reward_items.length === 0) return "보상 없음";
  return reward.reward_items
    .map((item) => {
      const amount = item.amount ?? 0;
      switch (item.type) {
        case "gold": return `골드 ${signed(amount)}G`;
        case "experience": return `경험치 ${signed(amount)}`;
        case "ap": return `AP ${signed(amount)}`;
        case "lv": return `성장등급 ${signed(amount)}`;
        case "stat_hp": return `HP ${signed(amount)}`;
        case "stat_attack": return `공격력 ${signed(amount)}`;
        case "stat_defense": return `방어력 ${signed(amount)}`;
        case "stat": return `${EFFECT_STAT_LABELS[item.stat ?? ""] ?? item.stat ?? "능력치"} ${signed(amount)}`;
        case "item": return `${item.item_name ?? `아이템 ID${item.item_id}`} ×${item.quantity ?? 1}`;
        default: return item.type;
      }
    })
    .join("  /  ");
}
