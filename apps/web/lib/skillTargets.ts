import type { SkillTargetSide } from "@/lib/api";

export const ALL_SKILL_TARGETS = ["아군 전원", "에너미+하수인 전원", "에너미 전원"] as const;

export type AllSkillTarget = (typeof ALL_SKILL_TARGETS)[number];

export function isAllSkillTarget(target: string | null | undefined): target is AllSkillTarget {
  return ALL_SKILL_TARGETS.some((value) => value === target);
}

/** 전체 대상이면 그 대상의 진영을 준다(아군 전원은 아군, 나머지는 적군). 전체 대상이 아니면 undefined. */
export function allTargetSide(target: string | null | undefined): SkillTargetSide | undefined {
  if (!isAllSkillTarget(target)) return undefined;
  return target === "아군 전원" ? "ALLY" : "ENEMY";
}
