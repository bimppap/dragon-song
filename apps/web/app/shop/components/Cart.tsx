"use client";

import { Minus, Plus, Trash2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Item } from "@/lib/api";

export interface CartEntry {
  item: Item;
  qty: number;
}

interface Props {
  entries: CartEntry[];
  loading: boolean;
  onUpdateQty: (itemId: number, qty: number) => void;
  onRemove: (itemId: number) => void;
  onPurchase: () => void;
}

function formatPrice(goldAmount: number, cpAmount: number): string {
  const parts: string[] = [];
  if (goldAmount > 0) parts.push(`${goldAmount.toLocaleString()} G`);
  if (cpAmount > 0) parts.push(`${cpAmount.toLocaleString()} CP`);
  return parts.length > 0 ? parts.join(" + ") : "-";
}

export default function Cart({ entries, loading, onUpdateQty, onRemove, onPurchase }: Props) {
  const totalGold = entries.reduce((sum, e) => sum + (e.item.price_gold ?? 0) * e.qty, 0);
  const totalCp = entries.reduce((sum, e) => sum + (e.item.price_cp ?? 0) * e.qty, 0);
  const totalQty = entries.reduce((sum, e) => sum + e.qty, 0);

  return (
    <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface lg:w-72">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line bg-inset">
        <ShoppingCart size={16} className="text-gold" />
        <span className="text-sm font-semibold text-ivory">장바구니</span>
        <span className="font-num ml-auto text-xs text-muted font-medium">{totalQty}개</span>
      </div>

      {/* 아이템 목록 */}
      <ul className="flex-1 overflow-y-auto divide-y divide-line">
        {entries.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-muted">
            장바구니가 비어있습니다.
          </li>
        )}
        {entries.map(({ item, qty }) => (
          <li key={item.id} className="px-4 py-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-ivory leading-tight">{item.name}</span>
              <button
                onClick={() => onRemove(item.id)}
                className="text-muted hover:text-red-400 transition-colors shrink-0 mt-0.5"
                aria-label="삭제"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              {/* 수량 조절 */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onUpdateQty(item.id, qty - 1)}
                  disabled={qty <= 1}
                  className="w-6 h-6 flex items-center justify-center rounded border border-line text-muted hover:bg-primary-light/20 disabled:opacity-30 transition"
                >
                  <Minus size={11} />
                </button>
                <span className="font-num w-7 text-center text-sm font-semibold text-ivory">{qty}</span>
                <button
                  onClick={() => onUpdateQty(item.id, qty + 1)}
                  className="w-6 h-6 flex items-center justify-center rounded border border-line text-muted hover:bg-primary-light/20 transition"
                >
                  <Plus size={11} />
                </button>
              </div>

              {/* 소계 */}
              <span className="font-num text-sm font-semibold text-yellow-600">
                {formatPrice((item.price_gold ?? 0) * qty, (item.price_cp ?? 0) * qty)}
              </span>
            </div>

            <div className="font-num text-xs text-muted">
              단가 {formatPrice(item.price_gold ?? 0, item.price_cp ?? 0)}
            </div>
          </li>
        ))}
      </ul>

      {/* 합계 + 구매 버튼 */}
      <div className="border-t border-line px-4 py-4 space-y-3 bg-inset">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">총 금액</span>
          <span className="font-num text-base font-bold text-gold">
            {formatPrice(totalGold, totalCp)}
          </span>
        </div>
        <Button
          variant="cta"
          className="w-full"
          disabled={loading || entries.length === 0}
          onClick={onPurchase}
        >
          <ShoppingCart size={15} />
          {loading ? "구매 중..." : "구매하기"}
        </Button>
      </div>
    </aside>
  );
}
