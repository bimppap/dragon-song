"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { ShoppingCart, Package } from "lucide-react";
import { fetchItems, purchaseItem } from "@/lib/api";
import type { Item } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

ModuleRegistry.registerModules([AllCommunityModule]);

interface Props {
  characterId: number;
  onPurchased: () => void;
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

export default function ItemGrid({ characterId, onPurchased }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const gridRef = useRef<AgGridReact>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchItems(characterId));
    } catch (e) {
      console.error(e);
    }
  }, [characterId]);

  useEffect(() => { load(); }, [load]);

  async function handlePurchase(item: Item) {
    if (loading) return;
    setLoading(true);
    try {
      await purchaseItem(characterId, item.id);
      alert(`"${item.name}" 구매 완료!`);
      await load();
      onPurchased();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "구매 실패");
    } finally {
      setLoading(false);
    }
  }

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
      headerName: "구매",
      width: 100,
      sortable: false,
      filter: false,
      cellRenderer: (p: ICellRendererParams<Item>) => {
        const soldOut = calcStock(p.data!) === 0;
        return (
          <Button
            size="sm"
            variant={soldOut ? "outline" : "default"}
            disabled={loading || soldOut}
            onClick={() => handlePurchase(p.data!)}
          >
            <ShoppingCart size={13} />
            {soldOut ? "품절" : "구매"}
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
