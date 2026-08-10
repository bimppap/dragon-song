"use client";

import { useState, useEffect } from "react";
import { Store, ClipboardList, PlusSquare } from "lucide-react";
import ItemGrid from "./components/ItemGrid";
import PurchaseGrid from "./components/PurchaseGrid";
import AddItemForm from "./components/AddItemForm";
import Cart from "./components/Cart";
import type { CartEntry } from "./components/Cart";
import { fetchCharacters, bulkPurchase } from "@/lib/api";
import type { Character, Item } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRequireMember } from "@/lib/auth";

function usePurchaseCart(characterId: number | null, onPurchased: () => void) {
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [cartLoading, setCartLoading] = useState(false);

  function handleAddToCart(item: Item) {
    setCart((prev) => {
      const existing = prev.find((e) => e.item.id === item.id);
      if (existing)
        return prev.map((e) =>
          e.item.id === item.id ? { ...e, qty: e.qty + 1 } : e,
        );
      return [...prev, { item, qty: 1 }];
    });
  }

  function handleUpdateQty(itemId: number, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((e) => e.item.id !== itemId));
    } else {
      setCart((prev) =>
        prev.map((e) => (e.item.id === itemId ? { ...e, qty } : e)),
      );
    }
  }

  function handleRemove(itemId: number) {
    setCart((prev) => prev.filter((e) => e.item.id !== itemId));
  }

  async function handlePurchase() {
    if (!characterId || cart.length === 0) return;
    setCartLoading(true);
    try {
      await bulkPurchase(
        characterId,
        cart.map((e) => ({ item_id: e.item.id, quantity: e.qty })),
      );
      setCart([]);
      onPurchased();
    } catch (e) {
      alert(e instanceof Error ? e.message : "구매 실패");
    } finally {
      setCartLoading(false);
    }
  }

  return { cart, setCart, cartLoading, handleAddToCart, handleUpdateQty, handleRemove, handlePurchase };
}

function RunnerShop({ characterId }: { characterId: number }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { cart, cartLoading, handleAddToCart, handleUpdateQty, handleRemove, handlePurchase } =
    usePurchaseCart(characterId, () => setRefreshKey((k) => k + 1));
  const cartItemIds = new Set(cart.map((e) => e.item.id));

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">상점</h1>
        <p className="text-sm text-slate-500">보유 골드로 아이템을 구매할 수 있습니다.</p>
      </div>

      <div className={cn("flex gap-6 items-start", cart.length > 0 ? "flex-row" : "")}>
        <div className="flex-1 min-w-0">
          <ItemGrid
            characterId={characterId}
            cartItemIds={cartItemIds}
            onAddToCart={handleAddToCart}
            refreshKey={refreshKey}
          />
        </div>
        {cart.length > 0 && (
          <Cart
            entries={cart}
            loading={cartLoading}
            onUpdateQty={handleUpdateQty}
            onRemove={handleRemove}
            onPurchase={handlePurchase}
          />
        )}
      </div>
    </main>
  );
}

type Tab = "items" | "purchases" | "add";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "items", label: "상점", icon: Store },
  { id: "purchases", label: "구매 내역", icon: ClipboardList },
  { id: "add", label: "아이템 추가", icon: PlusSquare },
];

function AdminShop() {
  const [tab, setTab] = useState<Tab>("items");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterId, setCharacterId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const { cart, setCart, cartLoading, handleAddToCart, handleUpdateQty, handleRemove, handlePurchase } =
    usePurchaseCart(characterId, () => setRefreshKey((k) => k + 1));

  useEffect(() => {
    fetchCharacters()
      .then((list) => {
        setCharacters(list);
        if (list.length > 0) setCharacterId(list[0].id);
      })
      .catch(console.error);
  }, []);

  const cartItemIds = new Set(cart.map((e) => e.item.id));

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      {/* 캐릭터 선택 */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-slate-600 whitespace-nowrap">
          아이템을 구매할 캐릭터
        </span>
        <Select
          value={characterId?.toString() ?? ""}
          onValueChange={(v) => {
            setCharacterId(Number(v));
            setCart([]);
          }}
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
            onClick={() => {
              if (id === "add") {
                setEditingItem(null);
              }
              setTab(id);
            }}
            className={cn(
              "gap-2 rounded-none border-b-2 -mb-px h-11 px-5 font-semibold",
              tab === id
                ? "border-indigo-600 text-indigo-600 bg-transparent hover:bg-transparent hover:text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-transparent",
            )}
          >
            <Icon size={15} />
            {label}
          </Button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      <div>
        {tab === "items" && characterId == null && (
          <p className="py-12 text-center text-sm text-slate-400">
            캐릭터를 선택해 주세요.
          </p>
        )}
        {tab === "items" && characterId != null && (
          <div
            className={cn(
              "flex gap-6 items-start",
              cart.length > 0 ? "flex-row" : "",
            )}
          >
            <div className="flex-1 min-w-0">
              <ItemGrid
                characterId={characterId}
                cartItemIds={cartItemIds}
                onAddToCart={handleAddToCart}
                refreshKey={refreshKey}
                showAvailability
                showEffects
                onEditItem={(item) => {
                  setEditingItem(item);
                  setTab("add");
                }}
              />
            </div>
            {cart.length > 0 && (
              <Cart
                entries={cart}
                loading={cartLoading}
                onUpdateQty={handleUpdateQty}
                onRemove={handleRemove}
                onPurchase={handlePurchase}
              />
            )}
          </div>
        )}
        {tab === "purchases" && <PurchaseGrid refreshKey={refreshKey} />}
        {tab === "add" && (
          <AddItemForm
            key={editingItem?.id ?? "create"}
            item={editingItem}
            onSubmitted={() => {
              setRefreshKey((k) => k + 1);
              if (editingItem) {
                setEditingItem(null);
                setTab("items");
              }
            }}
            onCancelEdit={() => setEditingItem(null)}
          />
        )}
      </div>
    </main>
  );
}

export default function ShopPage() {
  const member = useRequireMember();

  if (!member) return null;

  return member.role === "ADMIN" ? (
    <AdminShop />
  ) : (
    <RunnerShop characterId={member.character_id!} />
  );
}
