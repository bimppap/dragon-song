"use client";

import { useState } from "react";
import Image from "next/image";
import { Gem, PawPrint } from "lucide-react";
import InfoTooltip from "@/components/common/InfoTooltip";
import { Button } from "@/components/ui/button";
import { unequipItem, formatEffect, ITEM_TYPE_LABELS, type CharacterDetail, type CharacterOwnedItem } from "@/lib/api";
import { cn } from "@/lib/utils";

type SlotType = "companion" | "accessory";
const SLOT_TYPES: SlotType[] = ["companion", "accessory"];

function ItemDetails({ item }: { item: CharacterOwnedItem }) {
  return <div className="flex flex-col gap-2 text-left">
    <strong>{item.item_name}</strong>
    {item.item_description && <p className="whitespace-pre-wrap text-xs text-muted">{item.item_description}</p>}
    <p className="text-xs">효과: {item.effects.length ? item.effects.map(formatEffect).join(", ") : "효과 없음"}</p>
  </div>;
}

function ItemIcon({ item, type }: { item?: CharacterOwnedItem; type: SlotType }) {
  const Icon = type === "companion" ? PawPrint : Gem;
  return item?.item_image_url
    ? <Image src={item.item_image_url} alt="" fill sizes="64px" unoptimized className="object-contain" />
    : <Icon size={18} />;
}

/** 장착 중인 동반자·장신구 슬롯. 장착은 "보유 중인 아이템"에서 하고, 여기서는 해제만 한다. */
export default function CharacterEquipmentSlots({ character, onUpdated, readOnly = false, locked = false }: {
  character: CharacterDetail;
  onUpdated: (detail: CharacterDetail) => void;
  /** 다른 러너의 캐릭터를 열람할 때: 장착된 동반자/장신구 정보만 보여주고 해제는 막는다. */
  readOnly?: boolean;
  /** 실전 전투 중처럼 장착 변경이 금지된 상태. */
  locked?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owned = character.owned_items.filter((item) => item.quantity > 0);

  async function unequip(item: CharacterOwnedItem) {
    setPending(true);
    setError(null);
    try {
      onUpdated(await unequipItem(character.id, item.item_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "해제 실패");
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
      return <InfoTooltip key={type} content={equipped
        ? <div className="flex max-w-64 flex-col gap-2">
            <ItemDetails item={equipped} />
            {!readOnly && !locked && <Button type="button" size="sm" variant="secondary" disabled={pending}
              onClick={() => void unequip(equipped)}>해제</Button>}
          </div>
        : `장착한 ${ITEM_TYPE_LABELS[type]} 없음`}>
        {/* 키보드로도 설명·해제 버튼을 열 수 있게 포커스를 받는다. */}
        <span tabIndex={0} aria-label={equipped ? `${ITEM_TYPE_LABELS[type]}: ${equipped.item_name}` : `${ITEM_TYPE_LABELS[type]} 없음`}
          className="flex w-10 shrink-0 cursor-default flex-col items-center gap-1 text-center focus-visible:outline-2 focus-visible:outline-gold">
          <span className={cn("relative flex size-9 items-center justify-center border-2 bg-gold/10 text-gold", equipped ? "border-gold" : "border-line")}>
            <ItemIcon item={equipped} type={type} />
          </span>
        </span>
      </InfoTooltip>;
    })}
    {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
  </>;
}
