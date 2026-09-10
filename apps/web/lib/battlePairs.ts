import type { BattleSession } from "./api";

/** REST/소켓으로 편성만 갱신되면 작성 중인 행동을 초기화하지 않는다. */
export function sameBattleCombatState(previous: BattleSession, next: BattleSession): boolean {
  const combatState = (session: BattleSession) => Object.entries(session).filter(
    ([key]) => key !== "pairs" && key !== "pair_battle" && key !== "created_at" && key !== "updated_at",
  );
  return JSON.stringify(combatState(previous)) === JSON.stringify(combatState(next));
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
