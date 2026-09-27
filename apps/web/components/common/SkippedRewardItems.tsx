import type { SkippedRewardItem } from "@/lib/api";

/** 지급 결과창에 붙이는 안내. 이미 상점에서 사서 임무 보상에서 뺀 아이템(기술 서적 등)을 보여준다. */
export default function SkippedRewardItems({ items }: { items: SkippedRewardItem[] }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">지급 제외 ({items.length})</p>
      <p className="mt-1 text-sm text-ivory/85">상점에서 이미 구매한 아이템이라 보상으로 지급하지 않았습니다.</p>
      <ul className="mt-2 flex flex-col gap-1 text-sm text-ivory">
        {items.map((item, index) => (
          <li key={`${item.character_id}:${item.item_id}:${index}`}>
            {item.character_name} · {item.item_name} ×{item.quantity}
          </li>
        ))}
      </ul>
    </div>
  );
}
