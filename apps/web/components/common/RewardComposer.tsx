"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface RewardValues {
  reward_gold: string;
  reward_experience: string;
  reward_ap: string;
  reward_hp: string;
  reward_attack: string;
  reward_defense: string;
}

export interface RewardItemEntry {
  item_id: string;
  quantity: string;
}

const REWARD_FIELDS: { key: keyof RewardValues; label: string }[] = [
  { key: "reward_gold", label: "골드 (G)" },
  { key: "reward_experience", label: "경험치" },
  { key: "reward_ap", label: "AP" },
  { key: "reward_hp", label: "HP 증가" },
  { key: "reward_attack", label: "공격력 증가" },
  { key: "reward_defense", label: "방어력 증가" },
];

interface Props {
  rewards: RewardValues;
  onRewardChange: (key: keyof RewardValues, value: string) => void;
  items: { id: number; name: string }[];
  rewardItems: RewardItemEntry[];
  onAddItem: () => void;
  onUpdateItem: (index: number, key: keyof RewardItemEntry, value: string) => void;
  onRemoveItem: (index: number) => void;
}

/** 도전과제·임무 등에서 공용으로 쓰는 보상 구성(수치 + 지급 아이템) 편집 UI. */
export default function RewardComposer({
  rewards,
  onRewardChange,
  items,
  rewardItems,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
}: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">보상 구성</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {REWARD_FIELDS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</label>
            <Input
              type="number"
              min={0}
              value={rewards[key]}
              onChange={(e) => onRewardChange(key, e.target.value)}
              placeholder="0"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">지급 아이템</label>
          <Button type="button" variant="outline" onClick={onAddItem} className="h-7 px-3 text-xs">
            + 추가
          </Button>
        </div>
        {rewardItems.length > 0 ? (
          <div className="flex flex-col gap-2">
            {rewardItems.map((entry, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select value={entry.item_id} onValueChange={(v) => onUpdateItem(index, "item_id", v)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="아이템 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  value={entry.quantity}
                  onChange={(e) => onUpdateItem(index, "quantity", e.target.value)}
                  placeholder="수량"
                  className="w-20"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onRemoveItem(index)}
                  className="h-8 px-2 text-slate-400 dark:text-slate-500 hover:text-red-500"
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500">아이템 없음</p>
        )}
      </div>
    </div>
  );
}
