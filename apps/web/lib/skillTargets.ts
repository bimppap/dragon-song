export const ALL_SKILL_TARGETS = ["아군 전원", "에너미+하수인 전원", "에너미 전원"] as const;

export type AllSkillTarget = (typeof ALL_SKILL_TARGETS)[number];

export function isAllSkillTarget(target: string | null | undefined): target is AllSkillTarget {
  return ALL_SKILL_TARGETS.some((value) => value === target);
}
