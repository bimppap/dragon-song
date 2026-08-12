"use client";

import { useEffect, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { fetchCharacters, fetchItems, fetchPurchases } from "@/lib/api";
import type { Character, Item, Purchase } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

ModuleRegistry.registerModules([AllCommunityModule]);

interface Props {
  refreshKey: number;
}

const ALL_CHARACTERS = "all-characters";
const ALL_ITEMS = "all-items";

export default function PurchaseGrid({ refreshKey }: Props) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [charFilter, setCharFilter] = useState(ALL_CHARACTERS);
  const [itemFilter, setItemFilter] = useState(ALL_ITEMS);

  useEffect(() => {
    let cancelled = false;

    async function loadFilters() {
      try {
        const [characterList, itemList] = await Promise.all([
          fetchCharacters(),
          fetchItems(),
        ]);

        if (cancelled) return;

        setCharacters(characterList);
        setItems(itemList);
      } catch (e) {
        console.error(e);
      }
    }

    loadFilters();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadPurchases() {
      try {
        const characterId =
          charFilter === ALL_CHARACTERS ? undefined : Number(charFilter);
        const itemId = itemFilter === ALL_ITEMS ? undefined : Number(itemFilter);
        const purchaseList = await fetchPurchases(characterId, itemId);

        if (cancelled) return;

        setPurchases(purchaseList);
      } catch (e) {
        console.error(e);
      }
    }

    loadPurchases();

    return () => {
      cancelled = true;
    };
  }, [charFilter, itemFilter, refreshKey]);

  const colDefs: ColDef<Purchase>[] = [
    { headerName: "캐릭터명", field: "character_name", width: 160, filter: true },
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={charFilter}
          onValueChange={setCharFilter}
          disabled={characters.length === 0}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="캐릭터 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_CHARACTERS}>전체 캐릭터</SelectItem>
              {characters.map((character) => (
                <SelectItem key={character.id} value={character.id.toString()}>
                  {character.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          value={itemFilter}
          onValueChange={setItemFilter}
          disabled={items.length === 0}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="아이템 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_ITEMS}>전체 아이템</SelectItem>
              {items.map((item) => (
                <SelectItem key={item.id} value={item.id.toString()}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Button
          variant="secondary"
          onClick={() => {
            setCharFilter(ALL_CHARACTERS);
            setItemFilter(ALL_ITEMS);
          }}
        >
          초기화
        </Button>
      </div>

      <div className={`ag-theme-quartz rounded-lg overflow-hidden`} style={{ height: 440 }}>
        <AgGridReact rowData={purchases} columnDefs={colDefs} rowHeight={44} />
      </div>
    </div>
  );
}
