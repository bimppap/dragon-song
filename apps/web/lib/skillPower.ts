import type { SkillNode } from "@/lib/api";

export type PowerSlot = SkillNode["power_slots"][number];
export type PowerUnit = PowerSlot["unit"];

const DEFAULT_POWER_SLOTS: PowerSlot[] = [{ key: "power", label: "기술 위력", unit: "percent" }];

/** 서버가 기술마다 내려주는 위력 칸 정의. 예전 응답 호환을 위해 비어 있으면 단일 위력으로 본다. */
export function powerSlotsOf(node: Pick<SkillNode, "power_slots">): PowerSlot[] {
  return node.power_slots?.length ? node.power_slots : DEFAULT_POWER_SLOTS;
}

/** 위력 칸의 값. key "power"는 power 필드를, 나머지는 powers의 같은 키를 가리킨다. */
export function powerOf(node: Pick<SkillNode, "power" | "powers">, key: string): number | null {
  return key === "power" ? node.power : node.powers?.[key] ?? null;
}

/** 배율(1.5)을 퍼센트 수(150)로 바꾼다. 부동소수 오차는 소수 6자리에서 정리한다. */
export function ratioToPercent(value: number): number {
  return Number((value * 100).toFixed(6));
}
