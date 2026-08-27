"use client";

import { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import ShopGrid from "./components/ShopGrid";
import Cart from "./components/Cart";
import type { CartEntry } from "./components/Cart";
import GiftCart from "./components/GiftCart";
import ShopAdminPanel from "./components/ShopAdminPanel";
import { fetchCharacters, bulkPurchase, consumeItem, equipItem, sendAdminGift } from "@/lib/api";
import type { Character, Item } from "@/lib/api";
import { Button } from "@/components/ui/button";
import PageContainer from "@/components/common/PageContainer";
import { useRequireMember } from "@/lib/auth";
import { useDialog } from "@/components/common/DialogProvider";

function useCartEntries() {
  const [cart, setCart] = useState<CartEntry[]>([]);

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

  return { cart, setCart, handleAddToCart, handleUpdateQty, handleRemove };
}

function usePurchaseCart(characterId: number | null, onPurchased: () => void) {
  const { confirm, alert } = useDialog();
  const { cart, setCart, handleAddToCart, handleUpdateQty, handleRemove } = useCartEntries();
  const [cartLoading, setCartLoading] = useState(false);

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
            try { await consumeItem(characterId, item.id); }
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

  return { cart, cartLoading, handleAddToCart, handleUpdateQty, handleRemove, handlePurchase };
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
        <Cart
          entries={cart}
          loading={cartLoading}
          onUpdateQty={handleUpdateQty}
          onRemove={handleRemove}
          onPurchase={handlePurchase}
        />
      </div>
    </PageContainer>
  );
}

function AdminShop() {
  const { confirm, alert } = useDialog();
  const [managing, setManaging] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<number[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const { cart, setCart, handleAddToCart, handleUpdateQty, handleRemove } = useCartEntries();
  const [gold, setGold] = useState(0);
  const [cp, setCp] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchCharacters().then(setCharacters).catch(console.error);
  }, []);

  const cartItemIds = new Set(cart.map((e) => e.item.id));

  function handleSelectCharacter(id: number) {
    setSelectedCharacterIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function handleUnselectCharacter(id: number) {
    setSelectedCharacterIds((prev) => prev.filter((existing) => existing !== id));
  }

  async function handleSend() {
    if (selectedCharacterIds.length === 0) return;
    const characterNames = selectedCharacterIds
      .map((id) => characters.find((c) => c.id === id)?.name ?? String(id))
      .join(", ");
    const contents = [
      gold > 0 ? `골드 ${gold.toLocaleString()}G` : null,
      cp > 0 ? `CP ${cp.toLocaleString()}` : null,
      ...cart.map((e) => `${e.item.name} ×${e.qty}`),
    ].filter(Boolean).join(", ");

    const ok = await confirm({
      title: "선물 보내기",
      description: `${characterNames}에게 각각 다음 선물을 보낼까요?\n${contents}`,
      confirmText: "보내기",
    });
    if (!ok) return;

    setSending(true);
    try {
      await sendAdminGift({
        character_ids: selectedCharacterIds,
        gold,
        cp,
        items: cart.map((e) => ({ item_id: e.item.id, quantity: e.qty })),
      });
      await alert(`${characterNames}에게 선물을 보냈습니다. 보상 이력에 '관리자의 선물'로 기록됩니다.`);
      setCart([]);
      setGold(0);
      setCp(0);
      setSelectedCharacterIds([]);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      await alert(e instanceof Error ? e.message : "선물 보내기 실패");
    } finally {
      setSending(false);
    }
  }

  return (
    <PageContainer className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-ivory">상점</h1>
          <p className="text-sm text-muted">
            {managing
              ? "아이템을 관리하고 구매 내역을 확인할 수 있습니다."
              : "캐릭터를 선택해 골드·CP·아이템을 선물로 보낼 수 있습니다."}
          </p>
        </div>
        <Button variant="link" className="gap-1.5 px-0" onClick={() => setManaging((v) => !v)}>
          <Settings size={15} />
          {managing ? "상점으로 돌아가기" : "상점 관리"}
        </Button>
      </div>

      {managing ? (
        <ShopAdminPanel />
      ) : (
        <div className="flex flex-col items-start gap-6 lg:flex-row">
          <div className="w-full min-w-0 flex-1">
            <ShopGrid
              cartItemIds={cartItemIds}
              onAddToCart={handleAddToCart}
              refreshKey={refreshKey}
            />
          </div>
          <GiftCart
            characters={characters}
            selectedCharacterIds={selectedCharacterIds}
            onSelectCharacter={handleSelectCharacter}
            onUnselectCharacter={handleUnselectCharacter}
            entries={cart}
            gold={gold}
            cp={cp}
            loading={sending}
            onGoldChange={setGold}
            onCpChange={setCp}
            onUpdateQty={handleUpdateQty}
            onRemove={handleRemove}
            onSend={handleSend}
          />
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
