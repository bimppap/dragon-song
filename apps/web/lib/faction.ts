import type { Faction } from "@/lib/api";

/** 포지션 아이콘 이미지. 키 순서가 곧 포지션 정렬 순서(공격 → 수비 → 치유)다. */
export const FACTION_POSITION_IMAGE: Record<Faction, string> = {
  공격: "/position/position_1.png",
  수비: "/position/position_2.png",
  치유: "/position/position_3.png",
};

const FACTION_ORDER = Object.keys(FACTION_POSITION_IMAGE) as Faction[];

/** 포지션 정렬용 순위. 포지션이 없는 캐릭터는 맨 뒤로 보낸다. */
export function factionRank(faction: Faction | null): number {
  const index = faction ? FACTION_ORDER.indexOf(faction) : -1;
  return index < 0 ? FACTION_ORDER.length : index;
}
