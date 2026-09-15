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
import { EQUIP_PASSIVE_EFFECT_STATS, ITEM_EFFECT_STAT_OPTIONS, PERCENT_EFFECT_STATS, type Chapter, type ItemEffect } from "@/lib/api";

interface Props {
  effects: ItemEffect[];
  onChange: (effects: ItemEffect[]) => void;
  /** ap_reset 등 아이템 전용 특수 효과 노출 여부. */
  allowSpecialStats?: boolean;
  allowGradeChoice?: boolean;
  /** 부활·기술 재발동처럼 장착해야 동작하는 전투 패시브 효과 노출 여부(동반자·장신구). */
  allowEquipPassives?: boolean;
  chapters?: Chapter[];
}

const SPECIAL_STATS = new Set<ItemEffect["stat"]>([
  "ap_reset", "stat_reset", "full_reset", "grade_choice_1", "grade_choice_2", "cleanse_debuffs",
  "mission_exp_recollection", "challenge_acquisition",
  "delivery_date_slot", "delivery_freeform",
  "battle_revive_once", "battle_auto_revive",
]);

/** 퍼센트형 효과는 비율(0.2)로 저장하지만 입력창에는 퍼센트(20)로 보여준다. 부동소수 오차(0.07*100)는 반올림해 숨긴다. */
function toDisplayDelta(effect: ItemEffect): number {
  return PERCENT_EFFECT_STATS.has(effect.stat) ? Math.round(effect.delta * 100 * 1e6) / 1e6 : effect.delta;
}

function toStoredDelta(stat: ItemEffect["stat"], displayValue: number): number {
  return PERCENT_EFFECT_STATS.has(stat) ? displayValue / 100 : displayValue;
}

/** 아이템·기술 등에서 공용으로 쓰는 효과 목록 편집 UI. */
export default function EffectListEditor({ effects, onChange, allowSpecialStats = false, allowGradeChoice = false, allowEquipPassives = false, chapters = [] }: Props) {
  const options = ITEM_EFFECT_STAT_OPTIONS.filter((option) => {
    if (EQUIP_PASSIVE_EFFECT_STATS.has(option.value)) return allowEquipPassives;
    if (allowSpecialStats) return true;
    return !SPECIAL_STATS.has(option.value) || (allowGradeChoice && (option.value === "grade_choice_1" || option.value === "grade_choice_2"));
  });

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
            const isPercent = PERCENT_EFFECT_STATS.has(effect.stat);
            return (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <Select
                  value={effect.stat}
                  onValueChange={(value) => handleUpdate(index, {
                    stat: value as ItemEffect["stat"],
                    // 입력창에 보이던 숫자는 유지하고, 퍼센트형 여부가 바뀌면 저장값만 다시 환산한다.
                    delta: toStoredDelta(value as ItemEffect["stat"], toDisplayDelta(effect)),
                    chapter: (value === "mission_exp_recollection" || value === "challenge_acquisition") ? effect.chapter ?? null : null,
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
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="any"
                    value={toDisplayDelta(effect)}
                    onChange={(e) => handleUpdate(index, { delta: toStoredDelta(effect.stat, Number(e.target.value)) })}
                    placeholder={isPercent ? "변동값 (%)" : "변동값 (+/-)"}
                    className="w-32"
                    disabled={isSpecial}
                  />
                  {isPercent && <span className="text-sm text-muted">%</span>}
                </div>
                {(effect.stat === "mission_exp_recollection" || effect.stat === "challenge_acquisition") && (
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
