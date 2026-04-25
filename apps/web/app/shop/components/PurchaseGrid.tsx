"use client";

import { useEffect, useState, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { Search } from "lucide-react";
import { fetchPurchases } from "@/lib/api";
import type { Purchase } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

ModuleRegistry.registerModules([AllCommunityModule]);

interface Props {
  refreshKey: number;
}

export default function PurchaseGrid({ refreshKey }: Props) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [charFilter, setCharFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const charId = charFilter ? Number(charFilter) : undefined;
      const itemId = itemFilter ? Number(itemFilter) : undefined;
      setPurchases(await fetchPurchases(charId, itemId));
    } catch (e) {
      console.error(e);
    }
  }, [charFilter, itemFilter]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const colDefs: ColDef<Purchase>[] = [
    { headerName: "캐릭터 ID", field: "character_id", width: 120, filter: true },
    { headerName: "아이템명", field: "item_name", flex: 1, filter: true },
    {
      headerName: "수량",
      field: "quantity",
      width: 90,
      cellRenderer: (p: ICellRendererParams<Purchase>) => (
        <Badge variant={p.value > 1 ? "default" : "secondary"}>
          {p.value}개
        </Badge>
      ),
    },
    {
      headerName: "구매 시간",
      field: "created_at",
      flex: 1,
      cellRenderer: (p: { value: string }) =>
        new Date(p.value).toLocaleString("ko-KR"),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder="캐릭터 ID"
          value={charFilter}
          onChange={(e) => setCharFilter(e.target.value)}
          className="w-36"
        />
        <Input
          type="number"
          placeholder="아이템 ID"
          value={itemFilter}
          onChange={(e) => setItemFilter(e.target.value)}
          className="w-36"
        />
        <Button variant="secondary" onClick={load}>
          <Search size={14} />
          조회
        </Button>
      </div>

      <div className="ag-theme-quartz rounded-lg overflow-hidden" style={{ height: 440 }}>
        <AgGridReact rowData={purchases} columnDefs={colDefs} rowHeight={44} />
      </div>
    </div>
  );
}
