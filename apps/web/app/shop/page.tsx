"use client";

import { useState, useEffect } from "react";
import { Store, ClipboardList, PlusSquare } from "lucide-react";
import ItemGrid from "./components/ItemGrid";
import PurchaseGrid from "./components/PurchaseGrid";
import AddItemForm from "./components/AddItemForm";
import { fetchCharacters } from "@/lib/api";
import type { Character } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "items" | "purchases" | "add";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "items",     label: "아이템 리스트", icon: Store },
  { id: "purchases", label: "구매 내역",    icon: ClipboardList },
  { id: "add",       label: "아이템 추가",  icon: PlusSquare },
];

export default function ShopPage() {
  const [tab, setTab] = useState<Tab>("items");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterId, setCharacterId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchCharacters()
      .then((list) => {
        setCharacters(list);
        if (list.length > 0) setCharacterId(list[0].id);
      })
      .catch(console.error);
  }, []);

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">

      {/* 캐릭터 선택 */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-slate-600 whitespace-nowrap">캐릭터 선택</span>
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
        {characterId != null && (
          <span className="text-xs text-slate-400">ID: {characterId}</span>
        )}
      </div>

      {/* 탭 바 */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant="ghost"
            onClick={() => setTab(id)}
            className={cn(
              "gap-2 rounded-none border-b-2 -mb-px h-11 px-5 font-semibold",
              tab === id
                ? "border-indigo-600 text-indigo-600 bg-transparent hover:bg-transparent hover:text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-transparent"
            )}
          >
            <Icon size={15} />
            {label}
          </Button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      <div>
        {tab === "items" && characterId != null && (
          <ItemGrid characterId={characterId} onPurchased={refresh} />
        )}
        {tab === "items" && characterId == null && (
          <p className="py-12 text-center text-sm text-slate-400">캐릭터를 선택해 주세요.</p>
        )}
        {tab === "purchases" && <PurchaseGrid refreshKey={refreshKey} />}
        {tab === "add" && <AddItemForm onCreated={refresh} />}
      </div>
    </main>
  );
}
