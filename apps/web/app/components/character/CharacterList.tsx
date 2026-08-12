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
  wrapText: true,
  autoHeight: true,
  wrapHeaderText: true,
  autoHeaderHeight: true,
};

const colDefs: ColDef<Character>[] = [
  {
    headerName: "ID",
    field: "id",
    width: 80,
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-mono text-xs text-muted">{p.value}</span>
    ),
  },
  { headerName: "이름", field: "name", flex: 1, minWidth: 140, filter: true },
  {
    headerName: "Lv",
    field: "lv",
    width: 80,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-semibold text-emerald-600">{(p.value as number).toLocaleString()}</span>
    ),
  },
  {
    headerName: "HP",
    width: 130,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-semibold text-rose-600">
        {p.data!.hp.toLocaleString()} / {p.data!.hp_max.toLocaleString()}
      </span>
    ),
  },
  {
    headerName: "공격력",
    field: "atk",
    width: 110,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-semibold text-orange-600">{(p.value as number).toLocaleString()}</span>
    ),
  },
  {
    headerName: "방어력",
    field: "def",
    width: 110,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-semibold text-blue-600">{(p.value as number).toLocaleString()}</span>
    ),
  },
  {
    headerName: "골드",
    field: "gold",
    width: 130,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-semibold text-yellow-600">{(p.value as number).toLocaleString()} G</span>
    ),
  },
  {
    headerName: "CP",
    field: "cp",
    width: 110,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-semibold text-cyan-600">{(p.value as number).toLocaleString()}</span>
    ),
  },
  {
    headerName: "AP",
    field: "ap",
    width: 100,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-num font-semibold text-gold">{(p.value as number).toLocaleString()}</span>
    ),
  },
  {
    headerName: "경험치",
    field: "exp",
    width: 120,
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
