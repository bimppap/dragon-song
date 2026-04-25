"use client";

import { useState, useEffect } from "react";
import { Store, ClipboardList, PlusSquare, ChevronDown } from "lucide-react";
import ItemGrid from "./components/ItemGrid";
import PurchaseGrid from "./components/PurchaseGrid";
import AddItemForm from "./components/AddItemForm";
import { fetchCharacters } from "@/lib/api";
import type { Character } from "@/lib/api";

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
        <div className="relative">
          <select
            value={characterId ?? ""}
            onChange={(e) => setCharacterId(Number(e.target.value))}
            disabled={characters.length === 0}
            className="appearance-none border border-slate-200 bg-white text-slate-800 text-sm font-medium rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition disabled:opacity-50 cursor-pointer"
          >
            {characters.length === 0 && (
              <option value="">캐릭터 없음</option>
            )}
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
        </div>
        {characterId != null && (
          <span className="text-xs text-slate-400">ID: {characterId}</span>
        )}
      </div>

      {/* 탭 바 */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={[
              "flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors",
              tab === id
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800",
            ].join(" ")}
          >
            <Icon size={15} />
            {label}
          </button>
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
