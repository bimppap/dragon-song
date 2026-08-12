"use client";

import { useEffect, useState } from "react";
import { Package, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import InfoTooltip from "@/components/common/InfoTooltip";
import { fetchItems, formatEffect, type Item } from "@/lib/api";

interface Props {
  characterId: number;
  cartItemIds: Set<number>;
  onAddToCart: (item: Item) => void;
  refreshKey: number;
}

/** 무제한이 아니면 남은 구매 수, 무제한이면 null. */
function remainingStock(item: Item): number | null {
  if (item.remaining_global !== null && item.remaining_per_character !== null)
    return Math.min(item.remaining_global, item.remaining_per_character);
  if (item.remaining_global !== null) return item.remaining_global;
  if (item.remaining_per_character !== null) return item.remaining_per_character;
  return null;
}

function PriceText({ item }: { item: Item }) {
  return (
    <span className="font-num text-sm font-semibold">
      {item.price_gold != null && <span className="text-yellow-600">{item.price_gold.toLocaleString()} G</span>}
      {item.price_gold != null && item.price_cp != null && <span className="text-muted"> + </span>}
      {item.price_cp != null && <span className="text-cyan-600">{item.price_cp.toLocaleString()} CP</span>}
    </span>
  );
}

function ItemImage({ url, className }: { url: string | null; className: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={`${className} object-cover`} />;
  }
  return (
    <div className={`${className} flex items-center justify-center bg-gold/10 text-gold`}>
      <Package size={26} />
    </div>
  );
}

function ItemTooltip({ item }: { item: Item }) {
  return (
    <div className="max-w-64 space-y-2 text-left">
      <ItemImage url={item.image_url} className="h-28 w-full rounded-lg" />
      <div className="flex items-center gap-2">
        <span className="font-semibold text-ivory">{item.name}</span>
        <Badge variant={item.item_type === "equipment" ? "secondary" : "outline"} className="text-[10px]">
          {item.item_type === "equipment" ? "장착형" : "소모형"}
        </Badge>
      </div>
      {item.description_user && <p className="text-xs text-muted">{item.description_user}</p>}
      <div className="text-xs text-muted">
        <span className="font-semibold text-ivory">효과 </span>
        {item.effects.length > 0 ? item.effects.map(formatEffect).join(", ") : "효과 없음"}
      </div>
    </div>
  );
}

export default function ShopGrid({ characterId, cartItemIds, onAddToCart, refreshKey }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchItems(characterId)
      .then((list) => { if (!cancelled) setItems(list); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [characterId, refreshKey]);

  if (loading) return <p className="py-12 text-center text-sm text-muted">아이템을 불러오는 중...</p>;
  if (items.length === 0)
    return <p className="py-12 text-center text-sm text-muted">판매 중인 아이템이 없습니다.</p>;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
      {items.map((item) => {
        const stock = remainingStock(item);
        const soldOut = stock === 0;
        const inCart = cartItemIds.has(item.id);
        return (
          <InfoTooltip key={item.id} side="top" content={<ItemTooltip item={item} />}>
            <div className="flex min-h-24 min-w-0 cursor-default gap-3 rounded-xl border border-line bg-surface p-3 transition hover:border-gold hover:shadow-sm">
              <ItemImage url={item.image_url} className="size-16 shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
                <div className="min-w-0">
                  <p className="whitespace-nowrap text-sm font-semibold text-ivory">{item.name}</p>
                  <PriceText item={item} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  {stock !== null ? (
                    <span className="shrink-0 whitespace-nowrap font-num text-xs text-muted">{soldOut ? "품절" : `${stock}개 남음`}</span>
                  ) : (
                    <span />
                  )}
                  <Button
                    className="shrink-0"
                    size="sm"
                    variant={inCart ? "secondary" : soldOut ? "outline" : "default"}
                    disabled={soldOut}
                    onClick={() => onAddToCart(item)}
                  >
                    <ShoppingCart size={13} />
                    {soldOut ? "품절" : inCart ? "추가" : "담기"}
                  </Button>
                </div>
              </div>
            </div>
          </InfoTooltip>
        );
      })}
    </div>
  );
}
