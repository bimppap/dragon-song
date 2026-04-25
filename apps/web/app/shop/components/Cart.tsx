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

export default function Cart({ entries, loading, onUpdateQty, onRemove, onPurchase }: Props) {
  const totalPrice = entries.reduce((sum, e) => sum + e.item.price * e.qty, 0);
  const totalQty   = entries.reduce((sum, e) => sum + e.qty, 0);

  return (
    <aside className="w-72 shrink-0 border border-slate-200 rounded-xl bg-white overflow-hidden flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
        <ShoppingCart size={16} className="text-indigo-500" />
        <span className="text-sm font-semibold text-slate-700">장바구니</span>
        <span className="ml-auto text-xs text-slate-400 font-medium">{totalQty}개</span>
      </div>

      {/* 아이템 목록 */}
      <ul className="flex-1 overflow-y-auto divide-y divide-slate-50">
        {entries.map(({ item, qty }) => (
          <li key={item.id} className="px-4 py-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-slate-800 leading-tight">{item.name}</span>
              <button
                onClick={() => onRemove(item.id)}
                className="text-slate-300 hover:text-red-400 transition-colors shrink-0 mt-0.5"
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
                  className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition"
                >
                  <Minus size={11} />
                </button>
                <span className="w-7 text-center text-sm font-semibold text-slate-700">{qty}</span>
                <button
                  onClick={() => onUpdateQty(item.id, qty + 1)}
                  className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-100 transition"
                >
                  <Plus size={11} />
                </button>
              </div>

              {/* 소계 */}
              <span className="text-sm font-semibold text-yellow-600">
                {(item.price * qty).toLocaleString()} G
              </span>
            </div>

            <div className="text-xs text-slate-400">
              단가 {item.price.toLocaleString()} G
            </div>
          </li>
        ))}
      </ul>

      {/* 합계 + 구매 버튼 */}
      <div className="border-t border-slate-100 px-4 py-4 space-y-3 bg-slate-50">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">총 금액</span>
          <span className="text-base font-bold text-indigo-600">
            {totalPrice.toLocaleString()} G
          </span>
        </div>
        <Button
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
