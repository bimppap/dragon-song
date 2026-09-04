"use client";

import { Plus, Trash2 } from "lucide-react";
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
import { ITEM_EFFECT_STAT_OPTIONS, PERCENT_EFFECT_STATS, type ItemEffectStat } from "@/lib/api";

type RewardableStat = Exclude<ItemEffectStat, "ap_reset" | "grade_choice_1" | "grade_choice_2" | "challenge_acquisition">;

export type RewardFormEntry =
  | { id: string; type: "stat"; stat: RewardableStat; amount: string }
  | { id: string; type: "item"; item_id: string; quantity: string };

interface Props {
  entries: RewardFormEntry[];
  items: { id: number; name: string }[];
  onChange: (entries: RewardFormEntry[]) => void;
}

const EXCLUDED_STATS = new Set<ItemEffectStat>(["ap_reset", "grade_choice_1", "grade_choice_2", "challenge_acquisition"]);
const STAT_OPTIONS = ITEM_EFFECT_STAT_OPTIONS.filter((option) => !EXCLUDED_STATS.has(option.value)) as {
  value: RewardableStat;
  label: string;
}[];

/** 퍼센트형 능력치는 DB에 비율(0.02)로 저장되지만, 입력/표시는 사람이 읽는 퍼센트 값(2)으로 다룬다. */
export function rewardAmountToDisplay(stat: RewardableStat, storedAmount: number): string {
  return String(PERCENT_EFFECT_STATS.has(stat) ? storedAmount * 100 : storedAmount);
}

export function rewardAmountToStored(stat: RewardableStat, displayAmount: number): number {
  return PERCENT_EFFECT_STATS.has(stat) ? displayAmount / 100 : displayAmount;
}

function createEntry(type: RewardFormEntry["type"]): RewardFormEntry {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return type === "item"
    ? { id, type, item_id: "", quantity: "1" }
    : { id, type, stat: "gold", amount: "1" };
}

/** 임무·도전과제에서 아이템과 모든 캐릭터 능력치를 동일한 행 추가 방식으로 구성한다. */
export default function RewardComposer({ entries, items, onChange }: Props) {
  function replace(index: number, entry: RewardFormEntry) {
    onChange(entries.map((current, currentIndex) => currentIndex === index ? entry : current));
  }

  function changeType(index: number, type: RewardFormEntry["type"]) {
    replace(index, { ...createEntry(type), id: entries[index].id });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-inset px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">보상 구성</p>
          <p className="text-xs text-muted">아이템과 능력치를 필요한 만큼 추가할 수 있습니다.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...entries, createEntry("stat")])}>
          <Plus data-icon="inline-start" />
          보상 추가
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted">구성된 보상이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry, index) => (
            <div key={entry.id} className="grid grid-cols-[110px_minmax(0,1fr)_88px_36px] items-center gap-2">
              <Select value={entry.type} onValueChange={(value: RewardFormEntry["type"]) => changeType(index, value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="stat">능력치</SelectItem>
                    <SelectItem value="item">아이템</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>

              {entry.type === "stat" ? (
                <Select
                  value={entry.stat}
                  onValueChange={(stat: RewardableStat) => replace(index, { ...entry, stat })}
                >
                  <SelectTrigger><SelectValue placeholder="능력치 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {STAT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={entry.item_id}
                  onValueChange={(item_id) => replace(index, { ...entry, item_id })}
                >
                  <SelectTrigger><SelectValue placeholder="아이템 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}

              <Input
                type="number"
                min={entry.type === "item" ? 1 : 0.0001}
                step={entry.type === "item" ? 1 : "any"}
                value={entry.type === "item" ? entry.quantity : entry.amount}
                onChange={(event) => entry.type === "item"
                  ? replace(index, { ...entry, quantity: event.target.value })
                  : replace(index, { ...entry, amount: event.target.value })}
                placeholder={entry.type === "item" ? "수량" : PERCENT_EFFECT_STATS.has(entry.stat) ? "수치(%)" : "수치"}
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="보상 삭제"
                onClick={() => onChange(entries.filter((_, currentIndex) => currentIndex !== index))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
