import { Badge } from "@/components/ui/badge";
import { EFFECT_STAT_LABELS, type Item, type RewardGrant } from "@/lib/api";

interface Props {
  entries: RewardGrant[];
  items: Item[];
  className?: string;
}

function formatGrant(grant: RewardGrant, items: Item[]): string {
  if (grant.type === "item") {
    const name = items.find((item) => item.id === grant.item_id)?.name ?? `아이템 #${grant.item_id}`;
    return `${name} ×${grant.quantity}`;
  }
  const label = EFFECT_STAT_LABELS[grant.stat] ?? grant.stat;
  const sign = grant.amount >= 0 ? "+" : "";
  return `${label} ${sign}${grant.amount}`;
}

/** 임무·도전과제 리스트에서 보상 구성을 뱃지 목록으로 요약해 보여준다. */
export default function RewardSummary({ entries, items, className }: Props) {
  if (entries.length === 0) {
    return <span className="text-xs text-muted">구성된 보상 없음</span>;
  }
  return (
    <div className={className ? `flex flex-wrap gap-1 ${className}` : "flex flex-wrap gap-1"}>
      {entries.map((grant, index) => (
        <Badge key={index} variant="secondary" className="font-normal">
          {formatGrant(grant, items)}
        </Badge>
      ))}
    </div>
  );
}
