"use client";

import InfoTooltip from "@/components/common/InfoTooltip";
import { cn } from "@/lib/utils";

export interface EnemyAttackMark {
  key: string;
  enemyName: string;
  actionNumber: number;
  skillName: string;
  summary: string;
  color: string;
  /** 방어 계산 전 예상 피해. */
  damage: number;
  /** 방어·피해 감소를 무시하는 추가 피해. */
  trueDamage: number;
  /** 피해 말고 남는 효과의 짧은 이름(디버프·강제 퇴각·환경 스택). */
  sideEffects: string[];
}

// 16×32 칸을 4px 계단으로 깎은 오른쪽 방향 삼각형. clip-path가 hover 판정도 모양대로 자른다.
const PIXEL_ARROW = "[clip-path:polygon(0_0,25%_0,25%_12.5%,50%_12.5%,50%_25%,75%_25%,75%_37.5%,100%_37.5%,100%_62.5%,75%_62.5%,75%_75%,50%_75%,50%_87.5%,25%_87.5%,25%_100%,0_100%)]";

const numberFormatter = new Intl.NumberFormat("ko-KR");

/** 공격 순서마다 밝은 빨강에서 어두운 빨강으로 나눠 색을 정한다. */
export function enemyAttackColor(index: number, total: number): string {
  const lightness = total <= 1 ? 55 : 80 - (index * 50) / (total - 1);
  return `hsl(0 85% ${lightness}%)`;
}

/** 이 캐릭터가 받는 공격 전체의 종합 정보와 목록. 커서를 올린 화살표의 공격을 강조한다. */
function AttackListTooltip({ items, activeKey }: { items: EnemyAttackMark[]; activeKey: string }) {
  const damage = items.reduce((sum, item) => sum + item.damage, 0);
  const trueDamage = items.reduce((sum, item) => sum + item.trueDamage, 0);
  const sideEffects = [...new Set(items.flatMap((item) => item.sideEffects))];
  return (
    <div className="max-w-72 text-left">
      <div className="border-b border-gold/35 pb-1.5">
        <p className="font-semibold">받는 공격 {items.length}회</p>
        {(damage > 0 || trueDamage > 0) && (
          <p className="mt-0.5">
            예상 피해 합계 {numberFormatter.format(damage)}
            {trueDamage > 0 && ` + 방어 무시 ${numberFormatter.format(trueDamage)}`}
          </p>
        )}
        {sideEffects.length > 0 && <p className="mt-0.5">부가 효과: {sideEffects.join(", ")}</p>}
      </div>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item) => (
          <li key={item.key} className={cn(item.key !== activeKey && "opacity-70")}>
            <p className={cn("flex items-center gap-1.5", item.key === activeKey && "font-semibold")}>
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              {item.enemyName} · {item.actionNumber}번째 행동
            </p>
            <p className="mt-0.5">{item.skillName} · {item.summary}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 캐릭터 카드 왼쪽에 이 캐릭터를 노리는 에너미 공격을 겹친 화살표로 붙인다. 부모는 relative여야 한다. */
export default function EnemyAttackArrows({ items }: { items: EnemyAttackMark[] }) {
  if (!items.length) return null;
  return (
    <div className="absolute right-full top-3 isolate flex flex-col [&>button+button]:-mt-5" aria-label="이 캐릭터를 노리는 에너미 공격">
      {items.map((item) => (
        <InfoTooltip key={item.key} side="left" content={<AttackListTooltip items={items} activeKey={item.key} />}>
          <button
            type="button"
            aria-label={`${item.enemyName} ${item.actionNumber}번째 행동 ${item.skillName}`}
            className={`relative h-8 w-4 shrink-0 cursor-help bg-black/70 hover:z-10 hover:brightness-125 focus-visible:z-10 focus-visible:brightness-150 focus-visible:outline-none ${PIXEL_ARROW}`}
          >
            <span className={`absolute inset-y-1 left-0 right-1 ${PIXEL_ARROW}`} style={{ backgroundColor: item.color }} />
          </button>
        </InfoTooltip>
      ))}
    </div>
  );
}
