import { EFFECT_STAT_LABELS } from "./api";
import type { Reward } from "./api";

/** Reward.type → 보상 이력에 표시할 한글 라벨. */
export const REWARD_TYPE_LABELS: Record<string, string> = {
  attendance: "출석 보상",
  challenge: "도전과제",
  mission: "임무",
  admin_gift: "관리자의 선물",
  settlement: "로그 정산",
  revoke: "보상 회수",
};

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
        case "stat_hp": return `HP ${signed(amount)}`;
        case "stat_attack": return `공격력 ${signed(amount)}`;
        case "stat_defense": return `방어력 ${signed(amount)}`;
        case "stat": return `${EFFECT_STAT_LABELS[item.stat ?? ""] ?? item.stat ?? "능력치"} ${signed(amount)}`;
        case "item": return `아이템 ID${item.item_id} ×${item.quantity ?? 1}`;
        default: return item.type;
      }
    })
    .join("  /  ");
}
