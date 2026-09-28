/**
 * 캐릭터 카드의 스택 툴팁 계산.
 *
 * 한 줄은 "이름 (수치) × 개수" 꼴이라, 수치는 **스택 하나당** 값으로 적어야 개수와 두 번 곱해
 * 읽히지 않는다(perStack). 맨 위 "종합" 줄에서만 개수를 곱해 실제 합계를 보여준다.
 */

/** 종합 줄에서 같은 이름표끼리 합산하는 수치 한 개. */
export interface StackAmount {
  /** 합산 기준이 되는 이름표(예: "턴마다 피해", "피해 감소") */
  label: string;
  value: number;
  /** 비율값이라 퍼센트로 보여줄지 */
  percent?: boolean;
  /** +/- 부호를 붙일지(피해량처럼 크기만 뜻하는 값은 붙이지 않는다) */
  signed?: boolean;
  /** 스택 하나당 값. 줄에는 그대로 보여주고, 종합 줄에서만 개수를 곱한다. */
  perStack?: boolean;
}

export interface StackBarItem {
  key: string;
  label: string;
  count: number;
  /** 환경 스택처럼 색이 데이터로 오는 경우 */
  color?: string;
  /** 상태이상처럼 강화/약화로 색이 정해지는 경우 */
  tone?: "buff" | "debuff";
  direction?: "left" | "right";
  /** 이 항목이 주는 수치. 줄에서 "(공격력 -15)"로 보여주고 종합 줄에서 합산한다. */
  amounts?: StackAmount[];
  /** 수치로 합산할 수 없는 효과의 짧은 설명. */
  note?: string;
}

export function formatStackAmount({ label, value, percent, signed }: StackAmount): string {
  const rounded = percent ? Math.round(value * 1000) / 10 : Math.round(value * 100) / 100;
  const sign = signed && rounded >= 0 ? "+" : "";
  return `${label} ${sign}${rounded}${percent ? "%" : ""}`;
}

export function formatStackAmounts(amounts: StackAmount[] | undefined): string {
  return (amounts ?? []).map(formatStackAmount).join(" · ");
}

/** 카드에 걸린 모든 스택의 수치를 이름표별로 합쳐 "종합" 줄을 만든다. */
export function summarizeStackAmounts(items: StackBarItem[]): string {
  const totals = new Map<string, StackAmount>();
  for (const item of items) {
    for (const amount of item.amounts ?? []) {
      const key = `${amount.label}:${amount.percent ? "%" : ""}`;
      const value = amount.perStack ? amount.value * item.count : amount.value;
      const existing = totals.get(key);
      if (existing) existing.value += value;
      else totals.set(key, { ...amount, value });
    }
  }
  return [...totals.values()]
    .filter((amount) => Math.abs(amount.value) > 1e-9)
    .map(formatStackAmount)
    .join(" | ");
}

/** 이름과 수치가 똑같이 보이는 항목은 한 줄로 합쳐 개수만 늘린다(출처가 여럿인 같은 약화 등). */
export function mergeSameStackBarItems(items: StackBarItem[]): StackBarItem[] {
  const merged = new Map<string, StackBarItem>();
  for (const item of items) {
    const key = `${item.label}|${item.color ?? "-"}|${item.tone ?? "-"}|${formatStackAmounts(item.amounts)}|${item.note ?? ""}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...item, key });
      continue;
    }
    // 스택당 값은 합친 뒤에도 그대로 두고 개수만 늘린다. 총합이 담긴 값만 서로 더한다.
    existing.amounts = (existing.amounts ?? []).map((amount, index) => (amount.perStack
      ? amount
      : { ...amount, value: amount.value + ((item.amounts ?? [])[index]?.value ?? 0) }));
    existing.count += item.count;
  }
  return [...merged.values()];
}
