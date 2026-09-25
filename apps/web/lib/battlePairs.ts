import type { BattleSession } from "./api";

/** 페어 전투는 당분간 쓰지 않아 전투 편성 화면에서 선택지를 감춘다. 다시 쓰려면 true로 바꾼다. */
export const PAIR_BATTLE_ENABLED = false;

/** REST/소켓으로 편성만 갱신되면 작성 중인 행동을 초기화하지 않는다. */
export function sameBattleCombatState(previous: BattleSession, next: BattleSession): boolean {
  const combatState = (session: BattleSession) => Object.entries(session).filter(
    ([key]) => key !== "pairs" && key !== "pair_battle" && key !== "created_at" && key !== "updated_at",
  );
  return JSON.stringify(combatState(previous)) === JSON.stringify(combatState(next));
}

/** 짝이 달라진 캐릭터 id. 빌린 스탯·기술이 바뀌므로 해당 캐릭터의 초안은 다시 만든다. */
export function changedPairPartnerIds(previous: BattleSession, next: BattleSession): Set<number> {
  const partners = (session: BattleSession) => new Map(session.pairs.flatMap((pair) =>
    pair.map((id) => [id, pair.filter((other) => other !== id).toSorted((a, b) => a - b).join(",")] as const),
  ));
  const before = partners(previous);
  const after = partners(next);
  return new Set([...before.keys(), ...after.keys()].filter((id) => before.get(id) !== after.get(id)));
}

/** 완성된 페어는 유지하고, 빠지거나 추가된 캐릭터만 다시 연결한다. */
export function reconcileBattlePairs(pairs: number[][], characterIds: number[]): number[][] {
  const remaining = new Set(characterIds);
  const complete: number[][] = [];
  const waiting: number[] = [];
  for (const pair of pairs) {
    const kept = pair.filter((id) => {
      if (!remaining.has(id)) return false;
      remaining.delete(id);
      return true;
    });
    if (kept.length === 2) complete.push(kept);
    else waiting.push(...kept);
  }
  waiting.push(...remaining);
  for (let index = 0; index < waiting.length; index += 2) complete.push(waiting.slice(index, index + 2));
  return complete;
}

export function randomizeBattlePairs(characterIds: number[]): number[][] {
  const shuffled = [...characterIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return reconcileBattlePairs([], shuffled);
}

export function swapBattlePairMembers(pairs: number[][], sourceId: number, targetId: number): number[][] {
  const sourcePair = pairs.findIndex((pair) => pair.includes(sourceId));
  const targetPair = pairs.findIndex((pair) => pair.includes(targetId));
  if (sourcePair < 0 || targetPair < 0 || sourcePair === targetPair) return pairs;
  return pairs.map((pair) => pair.map((id) => id === sourceId ? targetId : id === targetId ? sourceId : id));
}
