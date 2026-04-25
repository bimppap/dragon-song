"use client";

import { useEffect, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { fetchCharacters } from "@/lib/api";
import type { Character } from "@/lib/api";

ModuleRegistry.registerModules([AllCommunityModule]);

interface Props {
  characters: Character[];
  onLoad: (list: Character[]) => void;
}

const colDefs: ColDef<Character>[] = [
  {
    headerName: "ID",
    field: "id",
    width: 80,
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-mono text-xs text-slate-400">{p.value}</span>
    ),
  },
  { headerName: "이름", field: "name", flex: 1, filter: true },
  {
    headerName: "HP",
    field: "hp",
    width: 110,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-semibold text-rose-600">{(p.value as number).toLocaleString()}</span>
    ),
  },
  {
    headerName: "공격력",
    field: "attack",
    width: 110,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-semibold text-orange-600">{(p.value as number).toLocaleString()}</span>
    ),
  },
  {
    headerName: "방어력",
    field: "defense",
    width: 110,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-semibold text-blue-600">{(p.value as number).toLocaleString()}</span>
    ),
  },
  {
    headerName: "골드",
    field: "gold",
    width: 130,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-semibold text-yellow-600">{(p.value as number).toLocaleString()} G</span>
    ),
  },
];

export default function CharacterList({ characters, onLoad }: Props) {
  const load = useCallback(async () => {
    onLoad(await fetchCharacters());
  }, [onLoad]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="ag-theme-quartz rounded-lg overflow-hidden" style={{ height: 480 }}>
      <AgGridReact rowData={characters} columnDefs={colDefs} rowHeight={44} />
    </div>
  );
}
