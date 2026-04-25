"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { ShoppingCart, Package } from "lucide-react";
import { fetchItems } from "@/lib/api";
import type { Item } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

ModuleRegistry.registerModules([AllCommunityModule]);

interface Props {
  characterId: number;
  cartItemIds: Set<number>;
  onAddToCart: (item: Item) => void;
  refreshKey: number;
}

function StockBadge({ value }: { value: number | null }) {
  if (value === null) return <Badge variant="secondary">무제한</Badge>;
  if (value === 0)    return <Badge variant="destructive">품절</Badge>;
  return <Badge variant="success">{value}개</Badge>;
}

function calcStock(item: Item): number | null {
  if (item.remaining_global !== null && item.remaining_per_character !== null)
    return Math.min(item.remaining_global, item.remaining_per_character);
  if (item.remaining_global !== null) return item.remaining_global;
  if (item.remaining_per_character !== null) return item.remaining_per_character;
  return null;
}

export default function ItemGrid({ characterId, cartItemIds, onAddToCart, refreshKey }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const gridRef = useRef<AgGridReact>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchItems(characterId));
    } catch (e) {
      console.error(e);
    }
  }, [characterId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const colDefs: ColDef<Item>[] = [
    {
      headerName: "",
      width: 52,
      sortable: false,
      filter: false,
      cellRenderer: () => (
        <div className="flex items-center justify-center h-full">
          <Package size={18} className="text-indigo-400" />
        </div>
      ),
    },
    { headerName: "아이템명", field: "name", flex: 1, filter: true },
    { headerName: "유저 설명", field: "description_user", flex: 2, filter: true },
    { headerName: "내부 설명", field: "description_internal", flex: 2 },
    {
      headerName: "가격",
      field: "price",
      width: 110,
      cellRenderer: (p: ICellRendererParams<Item>) => (
        <span className="text-sm font-semibold text-yellow-600">
          {(p.value as number).toLocaleString()} G
        </span>
      ),
    },
    {
      headerName: "남은 구매 수",
      width: 130,
      cellRenderer: (p: ICellRendererParams<Item>) => (
        <StockBadge value={calcStock(p.data!)} />
      ),
    },
    {
      headerName: "장바구니",
      width: 110,
      sortable: false,
      filter: false,
      cellRenderer: (p: ICellRendererParams<Item>) => {
        const soldOut = calcStock(p.data!) === 0;
        const inCart = cartItemIds.has(p.data!.id);
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
    },
  ];

  return (
    <div className="ag-theme-quartz rounded-lg overflow-hidden" style={{ height: 480 }}>
      <AgGridReact ref={gridRef} rowData={items} columnDefs={colDefs} rowHeight={46} />
    </div>
  );
}
