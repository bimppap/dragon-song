"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Lock, Settings, Unlock } from "lucide-react";
import ShopGrid from "./components/ShopGrid";
import Cart from "./components/Cart";
import type { CartEntry } from "./components/Cart";
import GiftCart from "./components/GiftCart";
import ShopAdminPanel from "./components/ShopAdminPanel";
import {
  fetchCharacterDetail,
  fetchCharacters,
  fetchShopStatus,
  bulkPurchase,
  consumeItem,
  equipItem,
  sendAdminGift,
  updateShopStatus,
} from "@/lib/api";
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

function ShopCurtain() {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden rounded-2xl border border-gold/30 bg-primary/90 shadow-inner backdrop-blur-[1px]">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-60 bg-[radial-gradient(circle,rgba(245,158,11,0.45)_1px,transparent_1.5px)] bg-size-[12px_12px]"
      />
      <div className="relative rounded-lg border border-gold/40 bg-primary px-5 py-3 text-sm font-semibold text-ivory shadow-lg">
        지금은 상점 이용이 불가능합니다.
      </div>
    </div>
  );
}

function ShopContentFrame({ closed, children }: { closed: boolean; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl">
      {children}
      {closed && <ShopCurtain />}
    </div>
  );
}

function usePurchaseCart(characterId: number | null, shopOpen: boolean, onPurchased: () => void) {
  const { confirm, alert } = useDialog();
  const { cart, setCart, handleAddToCart, handleUpdateQty, handleRemove } = useCartEntries();
  const [cartLoading, setCartLoading] = useState(false);

  async function handlePurchase() {
    if (!shopOpen) {
      await alert("지금은 상점 이용이 불가능합니다.");
      return;
    }
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

function RunnerShop({ characterId, shopOpen }: { characterId: number; shopOpen: boolean }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [balance, setBalance] = useState<{ gold: number; cp: number } | null>(null);
  const { cart, cartLoading, handleAddToCart, handleUpdateQty, handleRemove, handlePurchase } =
    usePurchaseCart(characterId, shopOpen, () => setRefreshKey((k) => k + 1));
  const cartItemIds = new Set(cart.map((e) => e.item.id));

  useEffect(() => {
    let cancelled = false;
    fetchCharacterDetail(characterId)
      .then((character) => {
        if (!cancelled) setBalance({ gold: character.gold, cp: character.cp });
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      });
    return () => { cancelled = true; };
  }, [characterId, refreshKey]);

  return (
    <PageContainer className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-ivory">상점</h1>
        <p className="text-sm text-muted">보유 골드로 아이템을 구매할 수 있습니다.</p>
      </div>

      <ShopContentFrame closed={!shopOpen}>
        <div className="flex flex-col items-start gap-6 lg:flex-row">
          <div className="w-full min-w-0 flex-1">
            <ShopGrid
              characterId={characterId}
              cartItemIds={cartItemIds}
              onAddToCart={handleAddToCart}
              refreshKey={refreshKey}
            />
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 lg:w-72">
            <p className="text-sm text-muted" aria-live="polite">
              보유 골드 <span className="font-num font-semibold text-gold">{balance ? `${balance.gold.toLocaleString()} G` : "-"}</span>
              <span className="px-2 text-line">·</span>
              보유 CP <span className="font-num font-semibold text-cyan-600">{balance ? balance.cp.toLocaleString() : "-"}</span>
            </p>
            <Cart
              entries={cart}
              loading={cartLoading}
              onUpdateQty={handleUpdateQty}
              onRemove={handleRemove}
              onPurchase={handlePurchase}
            />
          </div>
        </div>
      </ShopContentFrame>
    </PageContainer>
  );
}

function AdminShop({ shopOpen, onShopOpenChange }: { shopOpen: boolean; onShopOpenChange: (isOpen: boolean) => void }) {
  const { confirm, alert } = useDialog();
  const [managing, setManaging] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<number[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const { cart, setCart, handleAddToCart, handleUpdateQty, handleRemove } = useCartEntries();
  const [gold, setGold] = useState(0);
  const [cp, setCp] = useState(0);
  const [sending, setSending] = useState(false);
  const [shopStatusSaving, setShopStatusSaving] = useState(false);

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

  async function handleToggleShopOpen() {
    const nextOpen = !shopOpen;
    setShopStatusSaving(true);
    try {
      const status = await updateShopStatus(nextOpen);
      onShopOpenChange(status.is_open);
    } catch (e) {
      await alert(e instanceof Error ? e.message : "상점 상태 변경 실패");
    } finally {
      setShopStatusSaving(false);
    }
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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={shopOpen ? "outline" : "cta"}
            className="gap-1.5"
            disabled={shopStatusSaving}
            onClick={handleToggleShopOpen}
          >
            {shopOpen ? <Lock size={15} /> : <Unlock size={15} />}
            {shopStatusSaving ? "변경 중..." : shopOpen ? "상점 닫기" : "상점 열기"}
          </Button>
          <Button variant="link" className="gap-1.5 px-0" onClick={() => setManaging((v) => !v)}>
            <Settings size={15} />
            {managing ? "상점으로 돌아가기" : "상점 관리"}
          </Button>
        </div>
      </div>

      {managing ? (
        <ShopAdminPanel />
      ) : (
        <ShopContentFrame closed={!shopOpen}>
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
        </ShopContentFrame>
      )}
    </PageContainer>
  );
}

export default function ShopPage() {
  const member = useRequireMember();
  const [shopOpen, setShopOpen] = useState(true);

  useEffect(() => {
    if (!member) return;
    let cancelled = false;
    fetchShopStatus()
      .then((status) => {
        if (!cancelled) setShopOpen(status.is_open);
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [member?.id]);

  if (!member) return null;

  return member.role === "ADMIN" ? (
    <AdminShop shopOpen={shopOpen} onShopOpenChange={setShopOpen} />
  ) : (
    <RunnerShop characterId={member.character_id!} shopOpen={shopOpen} />
  );
}
