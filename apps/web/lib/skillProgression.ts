import type { CharacterSkillNode } from "@/lib/api";

/** 루트를 제외하고 가장 깊은 기술을 선택한다. 같은 깊이라면 최근 습득한 기술을 우선한다.
 *  비공개(is_public=false) 기술은 이미지가 내려오지 않아 슬롯에 표시할 수 없으므로 제외한다. */
export function deepestLearnedSkill(nodes: CharacterSkillNode[]): CharacterSkillNode | null {
  let deepest: CharacterSkillNode | null = null;
  for (const node of nodes) {
    if (!node.unlocked || node.tier === 0 || !node.is_public) continue;
    if (!deepest || node.tier > deepest.tier
      || (node.tier === deepest.tier && (node.unlocked_at ?? "") > (deepest.unlocked_at ?? ""))) {
      deepest = node;
    }
  }
  return deepest;
}

export function isExcludedSkillPath(nodes: CharacterSkillNode[], node: CharacterSkillNode): boolean {
  if (node.tier === 0) return false;
  return nodes.some((chosen) => chosen.unlocked && chosen.tier > 0 && (
    chosen.book !== node.book
    || chosen.branch !== node.branch
    || (chosen.tier >= 2 && node.tier >= 2 && chosen.col !== node.col)
  ));
}
