"use client";

import { useEffect, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { Ban, Package, Settings2, ShoppingCart } from "lucide-react";
import { fetchItems, ITEM_EFFECT_STAT_OPTIONS } from "@/lib/api";
import type { Item } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

ModuleRegistry.registerModules([AllCommunityModule]);

interface Props {
  characterId: number;
  cartItemIds?: Set<number>;
  onAddToCart?: (item: Item) => void;
  refreshKey: number;
  showAvailability?: boolean;
  showEffects?: boolean;
  onEditItem?: (item: Item) => void;
}

const EFFECT_STAT_LABELS: Record<string, string> = Object.fromEntries(
  ITEM_EFFECT_STAT_OPTIONS.map((option) => [option.value, option.label]),
);

function StockBadge({ value }: { value: number | null }) {
  if (value === null) return <Badge variant="secondary">무제한</Badge>;
  if (value === 0)    return <Badge variant="destructive">품절</Badge>;
  return <Badge variant="success" className="font-num">{value}개</Badge>;
}

function formatAvailability(item: Item): string {
  const { available_from_chapter: from, available_until_chapter: until } = item;
  if (!from && !until) return "전체";
  if (from && until && from === until) return `${from}만`;
  if (from && until) return `${from} ~ ${until}`;
  if (from) return `${from}부터`;
  return `~${until}`;
}

function formatEffects(item: Item): string {
  if (item.effects.length === 0) return "효과 없음";
  return item.effects
    .map((effect) => {
      const label = EFFECT_STAT_LABELS[effect.stat] ?? effect.stat;
      const sign = effect.delta >= 0 ? "+" : "";
      return `${label} ${sign}${effect.delta}`;
    })
    .join(", ");
}

function calcStock(item: Item): number | null {
  if (item.remaining_global !== null && item.remaining_per_character !== null)
    return Math.min(item.remaining_global, item.remaining_per_character);
  if (item.remaining_global !== null) return item.remaining_global;
  if (item.remaining_per_character !== null) return item.remaining_per_character;
  return null;
}

export default function ItemGrid({
  characterId,
  cartItemIds,
  onAddToCart,
  refreshKey,
  showAvailability = false,
  showEffects = false,
  onEditItem,
}: Props) {
  const cartIds = cartItemIds ?? new Set<number>();
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      try {
        const nextItems = await fetchItems(characterId);
        if (!cancelled) {
          setItems(nextItems);
        }
      } catch (e) {
        console.error(e);
      }
    }

    void loadItems();

    return () => {
      cancelled = true;
    };
  }, [characterId, refreshKey]);

  const textColDef: ColDef<Item> = {
    wrapText: true,
    autoHeight: true,
    cellStyle: {
      whiteSpace: "normal",
      lineHeight: "1.45",
      paddingTop: "10px",
      paddingBottom: "10px",
    },
  };

  const defaultColDef: ColDef<Item> = {
    wrapHeaderText: true,
    autoHeaderHeight: true,
  };

  const availabilityColDef: ColDef<Item>[] = showAvailability ? [
    {
      headerName: "노출 범위",
      minWidth: 150,
      width: 150,
      sortable: false,
      filter: false,
      cellRenderer: (p: ICellRendererParams<Item>) => (
        <div className="flex items-center gap-1.5">
          <span className={p.data!.purchasable ? "text-ivory/85" : "text-muted"}>
            {formatAvailability(p.data!)}
          </span>
          {p.data!.sale_paused ? (
            <Badge variant="destructive">판매 중단</Badge>
          ) : (
            !p.data!.purchasable && <Badge variant="secondary">비활성</Badge>
          )}
        </div>
      ),
    },
  ] : [];

  const effectsColDef: ColDef<Item>[] = showEffects ? [
    {
      headerName: "종류",
      width: 96,
      minWidth: 96,
      sortable: false,
      filter: false,
      cellStyle: {
        display: "flex",
        alignItems: "center",
        overflow: "visible",
        textOverflow: "clip",
      },
      cellRenderer: (p: ICellRendererParams<Item>) => (
        <Badge
          variant={p.data!.item_type === "equipment" ? "secondary" : "outline"}
          className="whitespace-nowrap"
        >
          {p.data!.item_type === "equipment" ? "장착형" : "소모형"}
        </Badge>
      ),
    },
    {
      headerName: "효과",
      minWidth: 220,
      flex: 2,
      sortable: false,
      filter: false,
      cellRenderer: (p: ICellRendererParams<Item>) => (
        <span className="font-num text-sm text-ivory/85">{formatEffects(p.data!)}</span>
      ),
      ...textColDef,
    },
  ] : [];

  const editColDef: ColDef<Item>[] = onEditItem ? [
    {
      headerName: "설정",
      width: 84,
      minWidth: 84,
      pinned: "right",
      sortable: false,
      filter: false,
      suppressMovable: true,
      cellRenderer: (p: ICellRendererParams<Item>) => (
        <div className="flex h-full items-center justify-center">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted hover:text-ivory"
            onClick={(event) => {
              event.stopPropagation();
              onEditItem(p.data!);
            }}
            aria-label={`${p.data!.name} 수정`}
          >
            <Settings2 size={15} />
          </Button>
        </div>
      ),
    },
  ] : [];

  const colDefs: ColDef<Item>[] = [
    {
      headerName: "",
      width: 52,
      sortable: false,
      filter: false,
      cellRenderer: (p: ICellRendererParams<Item>) =>
        p.data!.sale_paused ? (
          <div className="flex h-full items-center justify-center grayscale">
            <Ban size={18} className="text-muted" />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <Package size={18} className="text-gold" />
          </div>
        ),
    },
    {
      headerName: "아이템명",
      field: "name",
      minWidth: 180,
      flex: 1.2,
      filter: true,
      ...textColDef,
    },
    {
      headerName: "유저 설명",
      field: "description_user",
      minWidth: 260,
      flex: 2.4,
      filter: true,
      ...textColDef,
    },
    ...effectsColDef,
    {
      headerName: "가격",
      width: 150,
      sortable: false,
      filter: false,
      cellRenderer: (p: ICellRendererParams<Item>) => (
        <span className="font-num text-sm font-semibold">
          {p.data!.price_gold != null && (
            <span className="text-yellow-600">{p.data!.price_gold.toLocaleString()} G</span>
          )}
          {p.data!.price_gold != null && p.data!.price_cp != null && (
            <span className="text-muted"> + </span>
          )}
          {p.data!.price_cp != null && (
            <span className="text-cyan-600">{p.data!.price_cp.toLocaleString()} CP</span>
          )}
        </span>
      ),
    },
    ...availabilityColDef,
    {
      headerName: "남은 구매 수",
      width: 130,
      cellRenderer: (p: ICellRendererParams<Item>) => (
        <StockBadge value={calcStock(p.data!)} />
      ),
    },
    ...(onAddToCart
      ? [
          {
            headerName: "장바구니",
            width: 110,
            sortable: false,
            filter: false,
            cellRenderer: (p: ICellRendererParams<Item>) => {
              const soldOut = calcStock(p.data!) === 0;
              const inCart = cartIds.has(p.data!.id);
              return (
                <Button
                  size="sm"
                  variant={inCart ? "secondary" : soldOut ? "outline" : "default"}
                  disabled={soldOut}
                  onClick={() => onAddToCart(p.data!)}
                >
                  <ShoppingCart size={13} />
                  {soldOut ? "품절" : inCart ? "추가" : "담기"}
                </Button>
              );
            },
          } as ColDef<Item>,
        ]
      : []),
    ...editColDef,
  ];

  return (
    <div className={`ag-theme-quartz rounded-lg overflow-hidden`} style={{ height: 480 }}>
      <AgGridReact
        rowData={items}
        columnDefs={colDefs}
        defaultColDef={defaultColDef}
        rowHeight={46}
      />
    </div>
  );
}
