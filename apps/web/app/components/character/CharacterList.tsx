"use client";

import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams, RowClickedEvent } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { Card, CardContent } from "@/components/ui/card";
import type { Character } from "@/lib/api";

ModuleRegistry.registerModules([AllCommunityModule]);

interface Props {
  characters: Character[];
  loading: boolean;
  onSelectCharacter?: (character: Character) => void;
}

const defaultColDef: ColDef<Character> = {
  resizable: false,
  suppressMovable: true,
  cellClass: "whitespace-nowrap",
};

const colDefs: ColDef<Character>[] = [
  {
    headerName: "ID",
    field: "id",
    flex: 0.6,
    minWidth: 52,
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num text-xs text-muted">{p.value}</span>
    ),
  },
  { headerName: "이름", field: "name", flex: 1.8, minWidth: 96, filter: true },
  {
    headerName: "Lv",
    field: "lv",
    flex: 0.6,
    minWidth: 52,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-semibold text-emerald-400">{(p.value as number).toLocaleString()}</span>
    ),
  },
  {
    headerName: "HP",
    flex: 1.4,
    minWidth: 116,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-semibold text-rose-400">
        {p.data!.hp.toLocaleString()} / {p.data!.hp_max.toLocaleString()}
      </span>
    ),
  },
  {
    headerName: "공격",
    field: "atk",
    flex: 0.8,
    minWidth: 66,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-semibold text-orange-400">{(p.value as number).toLocaleString()}</span>
    ),
  },
  {
    headerName: "방어",
    field: "def",
    flex: 0.8,
    minWidth: 66,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-semibold text-sky-400">{(p.value as number).toLocaleString()}</span>
    ),
  },
  {
    headerName: "골드",
    field: "gold",
    flex: 1,
    minWidth: 84,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-semibold text-yellow-400">{(p.value as number).toLocaleString()} G</span>
    ),
  },
  {
    headerName: "CP",
    field: "cp",
    flex: 0.8,
    minWidth: 62,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-semibold text-cyan-400">{(p.value as number).toLocaleString()}</span>
    ),
  },
  {
    headerName: "AP",
    field: "ap",
    flex: 0.6,
    minWidth: 54,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-semibold text-gold">{(p.value as number).toLocaleString()}</span>
    ),
  },
  {
    headerName: "경험치",
    field: "exp",
    flex: 0.9,
    minWidth: 76,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-semibold text-gold">{(p.value as number).toLocaleString()}</span>
    ),
  },
];

export default function CharacterList({ characters, loading, onSelectCharacter }: Props) {

  if (loading) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted">
          캐릭터 목록을 불러오는 중입니다.
        </CardContent>
      </Card>
    );
  }

  if (characters.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted">
          등록된 캐릭터가 없습니다.
        </CardContent>
      </Card>
    );
  }

  function handleRowClicked(event: RowClickedEvent<Character>) {
    if (event.data) onSelectCharacter?.(event.data);
  }

  return (
    <div className={`ag-theme-quartz h-120 rounded-lg overflow-hidden`}>
      <AgGridReact
        rowData={characters}
        columnDefs={colDefs}
        defaultColDef={defaultColDef}
        rowHeight={44}
        onRowClicked={handleRowClicked}
        rowStyle={{ cursor: onSelectCharacter ? "pointer" : "default" }}
      />
    </div>
  );
}
