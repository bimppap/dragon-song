"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import SpecialMerchantRibbon from "./SpecialMerchantRibbon";
import { ITEM_TYPE_LABELS } from "@/lib/api";
import { Package, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import InfoTooltip from "@/components/common/InfoTooltip";
import { fetchChapters, fetchItems, formatEffect, type Chapter, type Item } from "@/lib/api";

interface Props {
  characterId?: number;
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

// 아이템 이미지는 원본이 100×100 고정 크기라, 카드/툴팁 박스가 더 커도 확대하지 않고
// 원본 해상도 그대로(scale-down) 가운데 보여준다. 억지로 늘리면 깨져 보이기 때문.
function ItemImage({ url, className }: { url: string | null; className: string }) {
  if (url) {
    return (
      <span className={`${className} relative block overflow-hidden`}>
        <Image src={url} alt="" fill sizes="100px" className="object-scale-down" />
      </span>
    );
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
      {/* 전체 이미지가 잘리지 않도록 object-contain으로 표시 */}
      <ItemImage url={item.image_url} className="h-28 w-full rounded-lg bg-inset" />
      <div className="flex items-center gap-2">
        <span className="font-semibold text-ivory">{item.name}</span>
        <Badge variant={item.item_type === "equipment" ? "secondary" : "outline"} className="text-[10px]">
          {ITEM_TYPE_LABELS[item.item_type]}
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

/** 아이템이 아직 시작되지 않은 챕터부터 판매되는(=곧 열릴) 상태인지 판정한다.
 *  종료 챕터가 이미 지났거나(만료) 활성 챕터가 없으면(판정 불가) 곧 열림으로 표시하지 않는다. */
function isUpcoming(item: Item, chaptersByName: Map<string, Chapter>, activeChapter: Chapter | null): boolean {
  if (!item.available_from_chapter || !activeChapter) return false;
  const fromChapter = chaptersByName.get(item.available_from_chapter);
  if (!fromChapter || activeChapter.start_date >= fromChapter.start_date) return false;
  const untilChapter = item.available_until_chapter ? chaptersByName.get(item.available_until_chapter) : null;
  if (untilChapter && activeChapter.start_date > untilChapter.start_date) return false;
  return true;
}

export default function ShopGrid({ characterId, cartItemIds, onAddToCart, refreshKey }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [list, chapterList] = await Promise.all([fetchItems(characterId), fetchChapters()]);
        if (!cancelled) {
          setItems(list);
          setChapters(chapterList);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [characterId, refreshKey]);

  if (loading) return <p className="py-12 text-center text-sm text-muted">아이템을 불러오는 중...</p>;
  if (items.length === 0)
    return <p className="py-12 text-center text-sm text-muted">판매 중인 아이템이 없습니다.</p>;

  const chaptersByName = new Map(chapters.map((c) => [c.name, c]));
  const activeChapter = chapters.find((c) => c.is_active) ?? null;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => {
        const stock = remainingStock(item);
        const soldOut = stock === 0;
        const inCart = cartItemIds.has(item.id);
        const notYetAvailable = !item.sale_paused && !item.purchasable && isUpcoming(item, chaptersByName, activeChapter);
        const dimmed = item.sale_paused || notYetAvailable;
        return (
          <InfoTooltip key={item.id} side="top" content={<ItemTooltip item={item} />}>
            <div className="flex cursor-default flex-col overflow-hidden rounded-xl border border-line bg-surface transition hover:border-gold hover:shadow-sm">
              <div className="relative aspect-square w-full shrink-0">
                <ItemImage
                  url={item.image_url}
                  className={`absolute inset-0 size-full ${dimmed ? "grayscale" : ""}`}
                />
                {item.special_merchant && <SpecialMerchantRibbon />}
                {item.sale_paused ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/40">
                    <Badge variant="destructive">비공개</Badge>
                  </div>
                ) : notYetAvailable && (
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/40">
                    <Badge variant="secondary">{item.available_from_chapter}~</Badge>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-1 p-2.5">
                <p className="truncate text-xs font-semibold text-ivory">{item.name}</p>
                <PriceText item={item} />
                <div className="flex items-center justify-between gap-1.5">
                  {stock !== null ? (
                    <span className="shrink-0 whitespace-nowrap font-num text-[10px] text-muted">{soldOut ? "품절" : `${stock}개 남음`}</span>
                  ) : (
                    <span />
                  )}
                  <Button
                    className="ml-auto shrink-0"
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
