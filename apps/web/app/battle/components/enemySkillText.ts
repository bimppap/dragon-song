import type { EnemyOnHitEffect, EnemySkill } from "@/lib/api";

export const EFFECT_STATS = [
  ["atk", "공격력"], ["atk_p", "공격력 증가율 (%)"], ["def", "방어력"], ["def_p", "방어력 증가율 (%)"],
  ["def_eff", "방어 효율 (%)"], ["dmg_p", "피해 증가율 (%)"], ["dmg_r", "피해 감소율 (%)"], ["heal_eff", "치유 효율 (%)"],
  ["attn", "주목도"], ["presence", "존재감 (%)"], ["skill_eff_fixed", "기술 효율 (%)"], ["skill_eff_true", "고정 기술 효율"],
  ["skill_lv", "기술 레벨"], ["skill_cost", "기술 비용"], ["sh", "보호막"], ["skill_target", "기술 대상 수"], ["hp_regen_true", "고정 체력 재생"], ["hp_regen_fixed", "체력 재생률 (%)"], ["mp_regen", "마나 재생"],
];

export const ON_HIT_EFFECT_OPTIONS: [EnemyOnHitEffect, string][] = [
  ["dot", "턴마다 고정 피해"],
  ["stat", "상세 능력치 변경"],
  ["true_damage", "방어 무시 피해"],
];

export function debuffStatText(skill: EnemySkill): string {
  const label = EFFECT_STATS.find(([key]) => key === skill.debuff_stat)?.[1] ?? skill.debuff_stat;
  return `${label} ${skill.debuff_direction === "increase" ? "+" : "-"}${skill.debuff_amount} · ${skill.debuff_stackable ? "중첩 허용" : "중첩 불가"}`;
}

// 공격 스킬 요약: 피해율(0%면 생략)과 피격 디버프.
export function attackSkillEffectParts(skill: EnemySkill): string[] {
  const parts = skill.damage_percent ? [`피해 ${skill.damage_percent}%`] : [];
  if (skill.on_hit_dot) {
    const effect = skill.on_hit_effect ?? "dot";
    const detail = effect === "stat" ? debuffStatText(skill) : `${ON_HIT_EFFECT_OPTIONS.find(([key]) => key === effect)?.[1]} ${skill.dot_damage ?? 1}`;
    parts.push(`디버프 ${skill.dot_name || "지속 피해"} (${detail})`);
  }
  return parts;
}
