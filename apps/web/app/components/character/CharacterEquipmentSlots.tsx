"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Gem, PawPrint, X } from "lucide-react";
import InfoTooltip from "@/components/common/InfoTooltip";
import { Button } from "@/components/ui/button";
import { equipItem, unequipItem, formatEffect, ITEM_TYPE_LABELS, type CharacterDetail, type CharacterOwnedItem } from "@/lib/api";
import { cn } from "@/lib/utils";

type SlotType = "companion" | "accessory";
const SLOT_TYPES: SlotType[] = ["companion", "accessory"];

function ItemDetails({ item }: { item: CharacterOwnedItem }) {
  return <div className="flex max-w-64 flex-col gap-2 text-left">
    <strong>{item.item_name}</strong>
    <p className="whitespace-pre-wrap text-xs text-muted">{item.item_description}</p>
    <p className="text-xs">효과: {item.effects.length ? item.effects.map(formatEffect).join(", ") : "효과 없음"}</p>
  </div>;
}

function ItemIcon({ item, type }: { item?: CharacterOwnedItem; type: SlotType }) {
  const Icon = type === "companion" ? PawPrint : Gem;
  return item?.item_image_url
    ? <Image src={item.item_image_url} alt="" fill sizes="64px" unoptimized className="object-contain" />
    : <Icon size={18} />;
}

export default function CharacterEquipmentSlots({ character, onUpdated, readOnly = false }: {
  character: CharacterDetail;
  onUpdated: (detail: CharacterDetail) => void;
  /** 다른 러너의 캐릭터를 열람할 때: 장착된 동반자/장신구 정보만 보여주고 장착 변경은 막는다. */
  readOnly?: boolean;
}) {
  const titleId = useId();
  const [selectedType, setSelectedType] = useState<SlotType | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDialogElement | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const attachDialog = useCallback((element: HTMLDialogElement | null) => {
    dialog.current = element;
    setPortalContainer(element);
  }, []);
  const owned = character.owned_items.filter((item) => item.quantity > 0);
  const choices = owned.filter((item) => item.item_type === selectedType);

  useEffect(() => {
    if (selectedType) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selectedType]);

  async function select(item: CharacterOwnedItem) {
    setPending(true);
    setError(null);
    try {
      const next = await (item.equipped ? unequipItem : equipItem)(character.id, item.item_id);
      onUpdated(next);
      setSelectedType(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "장착 변경 실패");
    } finally {
      setPending(false);
    }
  }

  return <>
    {SLOT_TYPES.map((type) => {
      const items = owned.filter((item) => item.item_type === type);
      if (!items.length) return null;
      const equipped = items.find((item) => item.equipped);
      if (readOnly && !equipped) return null;
      return <InfoTooltip key={type} content={equipped ? <ItemDetails item={equipped} /> : `${ITEM_TYPE_LABELS[type]} 선택`}>
        <button type="button" aria-label={readOnly ? `${ITEM_TYPE_LABELS[type]}: ${equipped?.item_name}` : `${ITEM_TYPE_LABELS[type]} 선택${equipped ? `: ${equipped.item_name}` : ""}`}
          aria-haspopup={readOnly ? undefined : "dialog"}
          onClick={readOnly ? undefined : () => { setError(null); setSelectedType(type); }}
          className={cn("flex w-10 shrink-0 flex-col items-center gap-1 text-center", readOnly ? "cursor-default" : "cursor-pointer")}>
          <span className={cn("relative flex size-9 items-center justify-center border-2 bg-gold/10 text-gold", equipped ? "border-gold" : "border-line")}>
            <ItemIcon item={equipped} type={type} />
          </span>
        </button>
      </InfoTooltip>;
    })}
    <dialog ref={attachDialog} aria-labelledby={titleId} onClose={() => setSelectedType(null)} onCancel={(event) => { if (pending) event.preventDefault(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !pending) setSelectedType(null); }}
      className="m-auto w-[min(36rem,calc(100%-2rem))] border border-line bg-surface p-5 text-ivory backdrop:bg-black/60">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={titleId} className="font-semibold">보유 중인 {selectedType ? ITEM_TYPE_LABELS[selectedType] : "아이템"}</h2>
        <Button type="button" variant="ghost" size="icon" aria-label="닫기" disabled={pending} onClick={() => setSelectedType(null)}><X /></Button>
      </div>
      <p className="mb-3 text-xs text-muted">하나를 선택하면 기존 장착이 교체됩니다. 장착 중인 항목을 다시 선택하면 해제합니다.</p>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {choices.map((item) => <InfoTooltip key={item.item_id} portalContainer={portalContainer} content={<ItemDetails item={item} />}>
          <button type="button" disabled={pending} aria-pressed={item.equipped} onClick={() => select(item)}
            className={cn("flex w-24 shrink-0 cursor-pointer flex-col items-center gap-2 rounded-lg border p-2 disabled:opacity-50", item.equipped ? "border-gold bg-gold/10" : "border-line")}>
            <span className="relative flex size-16 items-center justify-center text-gold"><ItemIcon item={item} type={selectedType ?? "companion"} /></span>
            <span className="text-xs font-semibold">{item.item_name}</span>
            <span className="text-[10px] text-muted">{item.equipped ? "장착 중 · 해제" : "장착"}</span>
          </button>
        </InfoTooltip>)}
      </div>
      {pending && <p role="status" className="text-xs text-muted">장착 변경 중...</p>}
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </dialog>
  </>;
}
