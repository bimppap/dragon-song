"use client";

import { useState, useEffect } from "react";
import ShopGrid from "./components/ShopGrid";
import Cart from "./components/Cart";
import type { CartEntry } from "./components/Cart";
import { fetchCharacters, bulkPurchase, equipItem, useItem } from "@/lib/api";
import type { Character, Item } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PageContainer from "@/components/common/PageContainer";
import { useRequireMember } from "@/lib/auth";
import { useDialog } from "@/components/common/DialogProvider";

function usePurchaseCart(characterId: number | null, onPurchased: () => void) {
  const { confirm, alert } = useDialog();
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
      // 구매 직후 바로 장착/사용할지 아이템별로 확인
      for (const { item } of cart) {
        if (item.item_type === "equipment") {
          if (await confirm({ title: "아이템 장착", description: `'${item.name}'을(를) 지금 장착하시겠습니까?` })) {
            try { await equipItem(characterId, item.id); }
            catch (e) { await alert(e instanceof Error ? e.message : "장착 실패"); }
          }
        } else if (item.item_type === "consumable") {
          if (await confirm({ title: "아이템 사용", description: `'${item.name}'을(를) 지금 사용하시겠습니까?` })) {
            try { await useItem(characterId, item.id); }
            catch (e) { await alert(e instanceof Error ? e.message : "사용 실패"); }
          }
        }
      }
      setCart([]);
      onPurchased();
    } catch (e) {
      await alert(e instanceof Error ? e.message : "구매 실패");
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
    <PageContainer className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-ivory">상점</h1>
        <p className="text-sm text-muted">보유 골드로 아이템을 구매할 수 있습니다.</p>
      </div>

      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <div className="w-full min-w-0 flex-1">
          <ShopGrid
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
    </PageContainer>
  );
}

function AdminShop() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterId, setCharacterId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
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
    <PageContainer className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-ivory">상점</h1>
        <p className="text-sm text-muted">캐릭터를 선택해 아이템을 구매할 수 있습니다.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="whitespace-nowrap text-sm font-semibold text-ivory/85">
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
      </div>

      {characterId == null ? (
        <p className="py-12 text-center text-sm text-muted">캐릭터를 선택해 주세요.</p>
      ) : (
        <div className="flex flex-col items-start gap-6 lg:flex-row">
          <div className="w-full min-w-0 flex-1">
            <ShopGrid
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
      )}
    </PageContainer>
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
