"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CharacterOwnedItem, SpiritStoneOption } from "@/lib/api";

function StoneImage({ url, alt }: { url: string | null; alt: string }) {
  return (
    <span className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gold/10 text-gold">
      {url ? <Image src={url} alt={alt} fill sizes="64px" unoptimized className="object-contain" /> : <Package size={22} />}
    </span>
  );
}

/** 정령석 교환 창: 내놓을 보유 정령석을 고르고, 받을 정령석을 가로 목록에서 고른다. */
export default function SpiritStoneExchangeForm({ owned, options, onChange }: {
  owned: CharacterOwnedItem[];
  options: SpiritStoneOption[];
  onChange: (selection: { fromItemId: number | null; toItemId: number | null }) => void;
}) {
  // 품절된 한정 정령석은 가지고 있어도 내놓을 수 없다.
  const soldOutIds = new Set(options.filter((option) => option.sold_out).map((option) => option.item_id));
  const exchangeable = owned.filter((item) => !soldOutIds.has(item.item_id));
  // 받을 수 있는 정령석만 보여준다(이미 가진 정령석·품절된 정령석은 목록에서 뺀다).
  const candidates = options.filter((option) => !option.owned && !option.sold_out);
  const [fromItemId, setFromItemId] = useState<number | null>(exchangeable.length === 1 ? exchangeable[0].item_id : null);
  const [toItemId, setToItemId] = useState<number | null>(null);
  const from = owned.find((item) => item.item_id === fromItemId) ?? null;

  useEffect(() => { onChange({ fromItemId, toItemId }); }, [fromItemId, toItemId, onChange]);

  return (
    <div className="mt-3 flex flex-col gap-4">
      <section className="space-y-2">
        <p className="text-xs font-semibold text-muted">교환할 보유 정령석</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {owned.map((item) => {
            const soldOut = soldOutIds.has(item.item_id);
            return (
              <button key={item.item_id} type="button" disabled={soldOut} aria-pressed={fromItemId === item.item_id} onClick={() => setFromItemId(item.item_id)}
                className={cn("flex w-28 shrink-0 flex-col items-center gap-1.5 rounded-lg border p-2 text-center disabled:opacity-40",
                  fromItemId === item.item_id ? "border-gold bg-gold/10" : "border-line")}>
                <StoneImage url={item.item_image_url} alt={item.item_name} />
                <span className="text-xs font-semibold text-ivory">{item.item_name}</span>
                {soldOut ? <Badge variant="destructive" className="text-[10px]">품절 · 교환 불가</Badge>
                  : item.equipped && <Badge variant="outline" className="text-[10px]">장착 중</Badge>}
              </button>
            );
          })}
        </div>
        {from?.equipped && <p className="text-xs text-gold">장착 중인 정령석은 해제된 뒤 교환되고, 새 정령석은 장착되지 않은 상태로 받습니다.</p>}
      </section>

      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="font-semibold text-ivory">{from?.item_name ?? "보유 정령석 선택"}</span>
        <ArrowRight size={14} />
        <span className="font-semibold text-ivory">{candidates.find((option) => option.item_id === toItemId)?.name ?? "받을 정령석 선택"}</span>
      </div>

      <section className="space-y-2">
        <p className="text-xs font-semibold text-muted">받을 정령석</p>
        {candidates.length ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {candidates.map((option) => (
              <button key={option.item_id} type="button" aria-pressed={toItemId === option.item_id}
                onClick={() => setToItemId(option.item_id)}
                className={cn("flex w-44 shrink-0 flex-col items-center gap-2 rounded-lg border p-3 text-center",
                  toItemId === option.item_id ? "border-gold bg-gold/10" : "border-line")}>
                <StoneImage url={option.image_url} alt={option.name} />
                <span className="text-sm font-semibold text-ivory">{option.name}</span>
                {option.description && <span className="whitespace-pre-line text-left text-[11px] leading-relaxed text-muted">{option.description}</span>}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">받을 수 있는 정령석이 없습니다.</p>
        )}
      </section>
    </div>
  );
}
