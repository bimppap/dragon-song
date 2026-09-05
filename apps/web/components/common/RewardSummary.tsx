"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EFFECT_STAT_LABELS, PERCENT_EFFECT_STATS, fetchItemNames, type Item, type RewardGrant } from "@/lib/api";

interface Props {
  entries: RewardGrant[];
  items: Item[];
  className?: string;
}

function formatGrant(grant: RewardGrant, items: Item[], fallbackNames: Record<number, string>): string {
  if (grant.type === "item") {
    const name =
      items.find((item) => item.id === grant.item_id)?.name
      ?? fallbackNames[grant.item_id]
      ?? `아이템 #${grant.item_id}`;
    return `${name} ×${grant.quantity}`;
  }
  const label = EFFECT_STAT_LABELS[grant.stat] ?? grant.stat;
  const sign = grant.amount >= 0 ? "+" : "";
  if (PERCENT_EFFECT_STATS.has(grant.stat)) {
    const percentValue = Math.round(grant.amount * 1000) / 10;
    return `${label} ${sign}${percentValue}%`;
  }
  return `${label} ${sign}${grant.amount}`;
}

/** 임무·도전과제 리스트에서 보상 구성을 뱃지 목록으로 요약해 보여준다. */
export default function RewardSummary({ entries, items, className }: Props) {
  const [fallbackNames, setFallbackNames] = useState<Record<number, string>>({});

  // 상점에 아직 공개되지 않은 아이템은 items 목록에 없으므로, 그때만 이름 목록을 따로 받아온다.
  const hasUnknownItem = entries.some(
    (grant) =>
      grant.type === "item"
      && !items.some((item) => item.id === grant.item_id)
      && fallbackNames[grant.item_id] === undefined,
  );

  useEffect(() => {
    if (!hasUnknownItem) return;
    let cancelled = false;
    fetchItemNames()
      .then((names) => {
        if (!cancelled) setFallbackNames(Object.fromEntries(names.map((item) => [item.id, item.name])));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [hasUnknownItem]);

  if (entries.length === 0) {
    return <span className="text-xs text-muted">구성된 보상 없음</span>;
  }
  return (
    <div className={className ? `flex flex-wrap gap-1 ${className}` : "flex flex-wrap gap-1"}>
      {entries.map((grant, index) => (
        <Badge key={index} variant="secondary" className="font-normal">
          {formatGrant(grant, items, fallbackNames)}
        </Badge>
      ))}
    </div>
  );
}
