"use client";

import { ITEM_TYPE_LABELS } from "@/lib/api";

import { useEffect, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GridApi, GridReadyEvent, ICellRendererParams, RowDragEndEvent } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { Ban, GripVertical, Package, Settings2, ShoppingCart } from "lucide-react";
import { fetchItems, formatEffect, reorderItems } from "@/lib/api";
import type { Item } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDialog } from "@/components/common/DialogProvider";

ModuleRegistry.registerModules([AllCommunityModule]);

interface Props {
  characterId?: number;
  cartItemIds?: Set<number>;
  onAddToCart?: (item: Item) => void;
  refreshKey: number;
  showAvailability?: boolean;
  showEffects?: boolean;
  onEditItem?: (item: Item) => void;
  /** 행을 드래그해 노출 순서를 바꾼다. 켜는 동안은 정렬·필터를 잠근다(둘 중 하나라도 걸리면
   *  ag-grid가 드래그 핸들을 비활성화하고, 화면 순서와 저장할 순서도 어긋나기 때문). */
  reorderable?: boolean;
}

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
  return item.effects.map(formatEffect).join(", ");
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
  reorderable = false,
}: Props) {
  const { alert } = useDialog();
  const cartIds = cartItemIds ?? new Set<number>();
  const [items, setItems] = useState<Item[]>([]);
  const gridApiRef = useRef<GridApi<Item> | null>(null);

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

  // 정렬이나 필터가 걸려 있으면 ag-grid가 드래그 핸들을 아무 안내 없이 비활성화한다. 컬럼에서
  // 정렬·필터 UI를 없애도 이미 걸려 있던 상태는 남으므로, 순서 편집에 들어갈 때 직접 해제한다.
  useEffect(() => {
    if (!reorderable) return;
    gridApiRef.current?.setFilterModel(null);
    gridApiRef.current?.applyColumnState({ defaultState: { sort: null } });
  }, [reorderable]);

  /** ag-grid가 이미 옮겨 놓은 행 순서를 그대로 서버에 저장한다. 실패하면 원래 순서로 되돌린다. */
  async function handleRowDragEnd(event: RowDragEndEvent<Item>) {
    const reordered: Item[] = [];
    event.api.forEachNodeAfterFilterAndSort((node) => {
      if (node.data) reordered.push(node.data);
    });
    const previous = items;
    setItems(reordered);
    try {
      await reorderItems(reordered.map((item) => item.id));
    } catch (e) {
      setItems(previous);
      await alert(e instanceof Error ? e.message : "아이템 순서 변경 실패");
    }
  }

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

  // 순서 편집 중에는 정렬·필터를 한곳에서 잠근다. 컬럼별로 끄는 설정은 그대로 우선한다.
  const defaultColDef: ColDef<Item> = {
    wrapHeaderText: true,
    autoHeaderHeight: true,
    sortable: !reorderable,
    filter: !reorderable,
  };

  const dragColDef: ColDef<Item>[] = reorderable ? [
    {
      headerName: "",
      width: 44,
      minWidth: 44,
      rowDrag: true,
      sortable: false,
      filter: false,
      suppressMovable: true,
      cellClass: "cursor-grab active:cursor-grabbing",
      // 손잡이 아이콘은 앱의 다른 순서 변경 UI(BattlePairGrid)와 같은 GripVertical을 쓴다.
      cellRenderer: () => (
        <div className="flex h-full items-center justify-center text-muted">
          <GripVertical size={14} />
        </div>
      ),
    },
  ] : [];

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
            <Badge variant="destructive">비공개</Badge>
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
          variant={p.data!.item_type !== "consumable" ? "secondary" : "outline"}
          className="whitespace-nowrap"
        >
          {ITEM_TYPE_LABELS[p.data!.item_type]}
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
    ...dragColDef,
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
      ...textColDef,
    },
    {
      headerName: "유저 설명",
      field: "description_user",
      minWidth: 260,
      flex: 2.4,
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
      filter: false,
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
        getRowId={(p) => String(p.data.id)}
        onGridReady={(event: GridReadyEvent<Item>) => { gridApiRef.current = event.api; }}
        rowDragManaged={reorderable}
        onRowDragEnd={handleRowDragEnd}
      />
    </div>
  );
}
