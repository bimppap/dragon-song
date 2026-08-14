"use client";

import { Coins, Gift, Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parsePositiveInt } from "@/lib/utils";
import type { CartEntry } from "./Cart";

interface Props {
  entries: CartEntry[];
  gold: number;
  cp: number;
  loading: boolean;
  onGoldChange: (value: number) => void;
  onCpChange: (value: number) => void;
  onUpdateQty: (itemId: number, qty: number) => void;
  onRemove: (itemId: number) => void;
  onSend: () => void;
}

/** 관리자 상점의 선물 바구니: 골드·CP·아이템을 담아 캐릭터에게 보낸다. */
export default function GiftCart({
  entries,
  gold,
  cp,
  loading,
  onGoldChange,
  onCpChange,
  onUpdateQty,
  onRemove,
  onSend,
}: Props) {
  const totalQty = entries.reduce((sum, e) => sum + e.qty, 0);
  const hasContent = gold > 0 || cp > 0 || entries.length > 0;

  return (
    <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface lg:w-72">
      <div className="flex items-center gap-2 border-b border-line bg-inset px-4 py-3">
        <Gift size={16} className="text-gold" />
        <span className="text-sm font-semibold text-ivory">선물 바구니</span>
        <span className="font-num ml-auto text-xs font-medium text-muted">아이템 {totalQty}개</span>
      </div>

      {/* 골드 / CP */}
      <div className="grid grid-cols-2 gap-3 border-b border-line px-4 py-3">
        <label className="space-y-1">
          <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <Coins size={11} className="text-gold" />골드
          </span>
          <Input
            type="number"
            min={0}
            value={gold === 0 ? "" : gold}
            placeholder="0"
            onChange={(event) => onGoldChange(parsePositiveInt(event.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <Sparkles size={11} className="text-gold" />CP
          </span>
          <Input
            type="number"
            min={0}
            value={cp === 0 ? "" : cp}
            placeholder="0"
            onChange={(event) => onCpChange(parsePositiveInt(event.target.value))}
          />
        </label>
      </div>

      {/* 아이템 목록 */}
      <ul className="flex-1 divide-y divide-line overflow-y-auto">
        {entries.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">
            보낼 아이템이 없습니다. 목록에서 아이템을 담아 보세요.
          </li>
        )}
        {entries.map(({ item, qty }) => (
          <li key={item.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium leading-tight text-ivory">{item.name}</span>
              <button
                onClick={() => onRemove(item.id)}
                className="mt-0.5 shrink-0 text-muted transition-colors hover:text-red-400"
                aria-label="삭제"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onUpdateQty(item.id, qty - 1)}
                disabled={qty <= 1}
                className="flex h-6 w-6 items-center justify-center rounded border border-line text-muted transition hover:bg-primary-light/20 disabled:opacity-30"
              >
                <Minus size={11} />
              </button>
              <span className="font-num w-7 text-center text-sm font-semibold text-ivory">{qty}</span>
              <button
                onClick={() => onUpdateQty(item.id, qty + 1)}
                className="flex h-6 w-6 items-center justify-center rounded border border-line text-muted transition hover:bg-primary-light/20"
              >
                <Plus size={11} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-3 border-t border-line bg-inset px-4 py-4">
        <p className="text-xs text-muted">
          보낸 선물은 캐릭터의 보상 이력에 &lsquo;관리자의 선물&rsquo;로 기록됩니다.
        </p>
        <Button variant="cta" className="w-full" disabled={loading || !hasContent} onClick={onSend}>
          <Gift size={15} />
          {loading ? "보내는 중..." : "선물 보내기"}
        </Button>
      </div>
    </aside>
  );
}
