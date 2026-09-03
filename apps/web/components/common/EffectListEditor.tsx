"use client";

import { Plus, X } from "lucide-react";
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
import { ITEM_EFFECT_STAT_OPTIONS, type Chapter, type ItemEffect } from "@/lib/api";

interface Props {
  effects: ItemEffect[];
  onChange: (effects: ItemEffect[]) => void;
  /** ap_reset 등 아이템 전용 특수 효과 노출 여부. */
  allowSpecialStats?: boolean;
  chapters?: Chapter[];
}

const SPECIAL_STATS = new Set<ItemEffect["stat"]>([
  "ap_reset", "grade_choice_1", "grade_choice_2", "cleanse_debuffs", "mission_exp_recollection",
]);

/** 아이템·기술 등에서 공용으로 쓰는 효과 목록 편집 UI. */
export default function EffectListEditor({ effects, onChange, allowSpecialStats = false, chapters = [] }: Props) {
  const options = allowSpecialStats
    ? ITEM_EFFECT_STAT_OPTIONS
    : ITEM_EFFECT_STAT_OPTIONS.filter((option) => !SPECIAL_STATS.has(option.value));

  function handleAdd() {
    onChange([...effects, { stat: options[0].value, delta: 0 }]);
  }

  function handleUpdate(index: number, patch: Partial<ItemEffect>) {
    onChange(effects.map((effect, i) => (i === index ? { ...effect, ...patch } : effect)));
  }

  function handleRemove(index: number) {
    onChange(effects.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-inset px-4 py-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wide text-ivory/85">효과</label>
        <Button type="button" variant="outline" onClick={handleAdd} className="h-7 px-3 text-xs">
          <Plus size={12} />
          효과 추가
        </Button>
      </div>
      {effects.length > 0 ? (
        <div className="flex flex-col gap-2">
          {effects.map((effect, index) => {
            const isSpecial = SPECIAL_STATS.has(effect.stat);
            return (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <Select
                  value={effect.stat}
                  onValueChange={(value) => handleUpdate(index, {
                    stat: value as ItemEffect["stat"],
                    chapter: value === "mission_exp_recollection" ? effect.chapter ?? null : null,
                  })}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="능력치 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="any"
                  value={effect.delta}
                  onChange={(e) => handleUpdate(index, { delta: Number(e.target.value) })}
                  placeholder="변동값 (+/-)"
                  className="w-32"
                  disabled={isSpecial}
                />
                {effect.stat === "mission_exp_recollection" && (
                  <Select
                    value={effect.chapter ?? undefined}
                    onValueChange={(chapter) => handleUpdate(index, { chapter })}
                  >
                    <SelectTrigger className="min-w-48 flex-1">
                      <SelectValue placeholder="대상 챕터 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {chapters.map((chapter) => (
                          <SelectItem key={chapter.id} value={chapter.name}>{chapter.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleRemove(index)}
                  className="h-8 px-2 text-muted hover:text-red-500"
                >
                  <X size={14} />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted">효과 없음</p>
      )}
    </div>
  );
}
