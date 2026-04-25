"use client";

import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { Card, CardContent } from "@/components/ui/card";
import type { Character } from "@/lib/api";

ModuleRegistry.registerModules([AllCommunityModule]);

interface Props {
  characters: Character[];
  loading: boolean;
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
  {
    headerName: "AP",
    field: "ap",
    width: 100,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-semibold text-indigo-600">{(p.value as number).toLocaleString()}</span>
    ),
  },
  {
    headerName: "경험치",
    field: "experience",
    width: 120,
    type: "numericColumn",
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className="font-semibold text-violet-600">{(p.value as number).toLocaleString()}</span>
    ),
  },
];

export default function CharacterList({ characters, loading }: Props) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-slate-500">
          캐릭터 목록을 불러오는 중입니다.
        </CardContent>
      </Card>
    );
  }

  if (characters.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-slate-500">
          등록된 캐릭터가 없습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="ag-theme-quartz h-[480px] rounded-lg overflow-hidden">
      <AgGridReact rowData={characters} columnDefs={colDefs} rowHeight={44} />
    </div>
  );
}
