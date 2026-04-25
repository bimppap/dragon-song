"use client";

import { useEffect, useState, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { Search } from "lucide-react";
import { fetchPurchases } from "@/lib/api";
import type { Purchase } from "@/lib/api";

ModuleRegistry.registerModules([AllCommunityModule]);

interface Props {
  refreshKey: number;
}

const inputCls =
  "border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition placeholder:text-gray-300 w-36";

export default function PurchaseGrid({ refreshKey }: Props) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [charFilter, setCharFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const charId = charFilter ? Number(charFilter) : undefined;
      const itemId = itemFilter ? Number(itemFilter) : undefined;
      const data = await fetchPurchases(charId, itemId);
      setPurchases(data);
    } catch (e) {
      console.error(e);
    }
  }, [charFilter, itemFilter]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const colDefs: ColDef<Purchase>[] = [
    { headerName: "캐릭터 ID", field: "character_id", width: 120, filter: true },
    { headerName: "아이템명", field: "item_name", flex: 1, filter: true },
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
        <input
          type="number"
          placeholder="캐릭터 ID"
          value={charFilter}
          onChange={(e) => setCharFilter(e.target.value)}
          className={inputCls}
        />
        <input
          type="number"
          placeholder="아이템 ID"
          value={itemFilter}
          onChange={(e) => setItemFilter(e.target.value)}
          className={inputCls}
        />
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition"
        >
          <Search size={14} />
          조회
        </button>
      </div>

      <div className="ag-theme-quartz rounded-lg overflow-hidden" style={{ height: 440 }}>
        <AgGridReact rowData={purchases} columnDefs={colDefs} rowHeight={44} />
      </div>
    </div>
  );
}
