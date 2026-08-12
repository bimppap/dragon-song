"use client";

import { useEffect, useState } from "react";
import { ClipboardList, PlusSquare, Settings2 } from "lucide-react";
import { fetchCharacters } from "@/lib/api";
import type { Character, Item } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TabBar from "@/components/common/TabBar";
import ItemGrid from "@/app/shop/components/ItemGrid";
import PurchaseGrid from "@/app/shop/components/PurchaseGrid";
import AddItemForm from "@/app/shop/components/AddItemForm";

type Tab = "manage" | "purchases" | "add";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "manage", label: "아이템 관리", icon: Settings2 },
  { id: "purchases", label: "구매 내역", icon: ClipboardList },
  { id: "add", label: "아이템 추가", icon: PlusSquare },
];

/** /admin 페이지에 임베드되는 아이템 관리 콘솔. */
export default function ItemAdmin() {
  const [tab, setTab] = useState<Tab>("manage");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterId, setCharacterId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  useEffect(() => {
    fetchCharacters()
      .then((list) => {
        setCharacters(list);
        if (list.length > 0) setCharacterId(list[0].id);
      })
      .catch(console.error);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {tab === "manage" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="whitespace-nowrap text-sm font-semibold text-slate-600">재고 기준 캐릭터</span>
          <Select
            value={characterId?.toString() ?? ""}
            onValueChange={(v) => setCharacterId(Number(v))}
            disabled={characters.length === 0}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="캐릭터 없음" />
            </SelectTrigger>
            <SelectContent>
              {characters.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <TabBar
        tabs={TABS}
        active={tab}
        onChange={(id) => {
          if (id === "add") setEditingItem(null);
          setTab(id);
        }}
      />

      {tab === "manage" &&
        (characterId == null ? (
          <p className="py-12 text-center text-sm text-slate-400">캐릭터를 선택해 주세요.</p>
        ) : (
          <ItemGrid
            characterId={characterId}
            refreshKey={refreshKey}
            showAvailability
            showEffects
            onEditItem={(item) => {
              setEditingItem(item);
              setTab("add");
            }}
          />
        ))}
      {tab === "purchases" && <PurchaseGrid refreshKey={refreshKey} />}
      {tab === "add" && (
        <AddItemForm
          key={editingItem?.id ?? "create"}
          item={editingItem}
          onSubmitted={() => {
            setRefreshKey((k) => k + 1);
            if (editingItem) {
              setEditingItem(null);
              setTab("manage");
            }
          }}
          onCancelEdit={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}
