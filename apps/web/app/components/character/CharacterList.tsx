"use client";

import { AgGridReact } from "ag-grid-react";
import type { CellClickedEvent, CellValueChangedEvent, ColDef, ICellRendererParams } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/common/ToastProvider";
import { updateCharacterFlags } from "@/lib/api";
import type { Character } from "@/lib/api";

ModuleRegistry.registerModules([AllCommunityModule]);

interface Props {
  characters: Character[];
  loading: boolean;
  onSelectCharacter?: (character: Character) => void;
  /** admin 전용: 주의/경고 편집 컬럼을 노출한다. */
  showAdminFlags?: boolean;
}

const defaultColDef: ColDef<Character> = {
  resizable: false,
  suppressMovable: true,
  cellClass: "whitespace-nowrap",
};

const baseColDefs: ColDef<Character>[] = [
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
    field: "hp",
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

const ADMIN_FLAG_FIELDS = new Set(["caution", "warning_count"]);

const adminFlagColDefs: ColDef<Character>[] = [
  {
    headerName: "주의",
    field: "caution",
    flex: 0.7,
    minWidth: 60,
    editable: true,
    cellRenderer: "agCheckboxCellRenderer",
    cellEditor: "agCheckboxCellEditor",
  },
  {
    headerName: "경고",
    field: "warning_count",
    flex: 0.7,
    minWidth: 62,
    type: "numericColumn",
    editable: true,
    cellEditor: "agNumberCellEditor",
    cellEditorParams: { min: 0, precision: 0 },
    cellRenderer: (p: ICellRendererParams<Character>) => (
      <span className={`font-num font-semibold ${Number(p.value) > 0 ? "text-red-400" : "text-muted"}`}>
        {Number(p.value ?? 0).toLocaleString()}
      </span>
    ),
  },
];

export default function CharacterList({ characters, loading, onSelectCharacter, showAdminFlags = false }: Props) {
  const { toast } = useToast();

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

  const colDefs = showAdminFlags ? [...baseColDefs, ...adminFlagColDefs] : baseColDefs;

  function handleCellClicked(event: CellClickedEvent<Character>) {
    // 관리 플래그 컬럼 클릭은 편집이므로 상세 이동을 막는다.
    if (ADMIN_FLAG_FIELDS.has(event.column.getColId())) return;
    if (event.data) onSelectCharacter?.(event.data);
  }

  async function handleCellValueChanged(event: CellValueChangedEvent<Character>) {
    if (!ADMIN_FLAG_FIELDS.has(event.column.getColId()) || !event.data) return;
    const row = event.data;
    try {
      const updated = await updateCharacterFlags(row.id, {
        caution: Boolean(row.caution),
        warning_count: Math.max(0, Number(row.warning_count ?? 0)),
      });
      event.node.setData({ ...row, ...updated });
    } catch (error) {
      event.node.setDataValue(event.column.getColId(), event.oldValue);
      toast(error instanceof Error ? error.message : "관리 플래그 저장 실패", "error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={`ag-theme-quartz h-120 rounded-lg overflow-hidden`}>
        <AgGridReact
          rowData={characters}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          rowHeight={44}
          singleClickEdit
          onCellClicked={handleCellClicked}
          onCellValueChanged={handleCellValueChanged}
          rowStyle={{ cursor: onSelectCharacter ? "pointer" : "default" }}
        />
      </div>
    </div>
  );
}
