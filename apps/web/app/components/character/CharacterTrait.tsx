"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Star } from "lucide-react";
import InfoTooltip from "@/components/common/InfoTooltip";
import Modal from "@/components/common/Modal";
import { Button } from "@/components/ui/button";
import { equipTrait, fetchTraits, type CharacterDetail, type Trait } from "@/lib/api";
import { cn } from "@/lib/utils";
import CharacterSlot from "./CharacterSlot";

const CHANGE_LOCKED_NOTICE = "장착한 특성은 해제할 수 없고, '특성 교체' 아이템을 사용해야 다른 특성으로 바꿀 수 있습니다.";

function TraitImage({ trait, className }: { trait: Trait | null; className: string }) {
  return <span className={cn("relative flex items-center justify-center overflow-hidden border-2 bg-gold/10 text-gold transition-colors hover:bg-gold/15",
    trait ? "border-gold" : "border-line text-muted", className)}>
    {trait?.image_url
      ? <Image src={trait.image_url} alt="" fill sizes="64px" unoptimized className="object-contain" />
      : <Star size={17} />}
  </span>;
}

/** 툴팁 안에 들어가는 이름·효과·설명. 슬롯과 특성 목록이 같은 내용을 쓴다. */
function TraitDetails({ trait }: { trait: Trait }) {
  return <div className="flex flex-col gap-1.5 text-left">
    <strong className="text-ivory">{trait.name}</strong>
    {trait.effect && <p className="whitespace-pre-wrap text-xs text-ivory/90">{trait.effect}</p>}
    {trait.description && <p className="whitespace-pre-wrap text-xs text-muted">{trait.description}</p>}
  </div>;
}

/** 특성 목록 창. 이미지와 이름을 한 칸으로 묶어 격자로 보여주고, 칸의 툴팁에서 장착한다. */
function TraitPicker({ character, canChange, adminMode, onClose, onUpdated }: {
  character: CharacterDetail;
  /** 이미 장착한 특성을 다른 특성으로 바꿀 수 있는지(교체권 보유 또는 관리자). */
  canChange: boolean;
  /** 해제는 관리자만 할 수 있다. 러너는 교체권으로 다른 특성으로 바꾸기만 한다. */
  adminMode: boolean;
  onClose: () => void;
  onUpdated: (value: CharacterDetail) => void;
}) {
  const [traits, setTraits] = useState<Trait[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    // 효과 수치가 없는 특성은 장착할 수 없으므로 목록에서도 뺀다.
    fetchTraits()
      .then((list) => { if (!cancelled) setTraits(list.filter((trait) => trait.rules)); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "특성 목록 조회 실패"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function equip(traitId: number | null) {
    setPending(true); setError("");
    try {
      onUpdated(await equipTrait(character.id, traitId));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "특성 장착 변경 실패");
      setPending(false);
    }
  }

  return <Modal open onClose={pending ? () => {} : onClose} title="특성" className="max-w-2xl">
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">특성은 한 번에 하나만 장착할 수 있습니다. 칸에 커서를 올리거나 눌러 효과를 확인하세요.</p>
      <p className="text-xs text-muted">
        {character.trait_id === null
          ? "한 번 장착한 특성은 해제할 수 없고 '특성 교체' 아이템으로만 바꿀 수 있으니 신중히 고르세요."
          : canChange ? "다른 특성으로 바꾸면 특성 교체권 1장이 사용됩니다. 특성을 비워둘 수는 없습니다." : CHANGE_LOCKED_NOTICE}
      </p>
      {loading ? <p className="py-8 text-center text-sm text-muted">특성을 불러오는 중...</p>
        : traits.length === 0 ? <p className="py-8 text-center text-sm text-muted">고를 수 있는 특성이 없습니다.</p>
          : <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {traits.map((trait) => {
              const equipped = trait.id === character.trait_id;
              // 장착 중인 특성은 관리자만 해제할 수 있고, 다른 특성은 교체권이 있어야 고를 수 있다.
              const disabled = pending || (equipped ? !adminMode : character.trait_id !== null && !canChange);
              return <InfoTooltip key={trait.id} content={<div className="flex max-w-64 flex-col gap-2">
                <TraitDetails trait={trait} />
                <Button type="button" size="sm" variant={equipped ? "secondary" : "outline"} disabled={disabled}
                  onClick={() => void equip(equipped ? null : trait.id)}>
                  {pending ? "변경 중..." : equipped ? (adminMode ? "해제하기" : "장착 중") : "장착하기"}
                </Button>
              </div>}>
                <button type="button" aria-label={`${trait.name}${equipped ? " (장착 중)" : ""}`}
                  className={cn("flex cursor-default flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-colors focus-visible:outline-2 focus-visible:outline-gold",
                    equipped ? "border-gold bg-gold/10" : "border-line hover:border-gold/50")}>
                  <TraitImage trait={trait} className="size-14" />
                  <span className="w-full truncate text-xs font-semibold text-ivory">{trait.name}</span>
                </button>
              </InfoTooltip>;
            })}
          </div>}
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </div>
  </Modal>;
}

/** 캐릭터 이미지 아래 슬롯 줄(기술·동반자·장신구·특성)의 특성 칸. */
export default function CharacterTrait({ character, onUpdated, readOnly, adminMode = false }: {
  character: CharacterDetail;
  onUpdated: (value: CharacterDetail) => void;
  readOnly: boolean;
  /** 관리자가 캐릭터를 직접 정비하는 화면에서는 교체권 없이도 바꿀 수 있다. */
  adminMode?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const equipped = character.equipped_trait ?? null;
  const locked = character.in_live_battle;
  const tickets = character.trait_change_tickets ?? 0;
  // 빈 슬롯에 처음 장착하는 것은 언제나 무료이고, 바꾸려면 교체권이 있어야 한다.
  const canChange = adminMode || tickets > 0;
  const changeBlocked = !!equipped && !canChange;
  return <>
    <InfoTooltip content={<div className="flex max-w-64 flex-col gap-2">
      {equipped ? <TraitDetails trait={equipped} /> : <p className="text-xs text-ivory">장착한 특성 없음</p>}
      {!readOnly && (locked
        ? <p className="text-xs text-muted">실전 전투 중에는 특성을 변경할 수 없습니다.</p>
        : changeBlocked
          ? <p className="text-xs text-muted">{CHANGE_LOCKED_NOTICE}</p>
          : <>
            {equipped && !adminMode && <p className="text-xs text-muted">특성 교체권 {tickets}장 보유 · 다른 특성으로 바꾸면 1장이 사용됩니다.</p>}
            <Button type="button" size="sm" variant="cta" className="w-full" onClick={() => setPicking(true)}>
              {equipped ? "특성 교체하기" : "특성 획득하기"}
            </Button>
          </>)}
    </div>}>
      <CharacterSlot aria-label={equipped ? `특성: ${equipped.name}` : "장착한 특성 없음"} filled={!!equipped}>
        {equipped?.image_url
          ? <Image src={equipped.image_url} alt="" fill sizes="36px" unoptimized className="object-contain" />
          : <Star size={17} />}
      </CharacterSlot>
    </InfoTooltip>
    {picking && <TraitPicker character={character} canChange={canChange} adminMode={adminMode} onClose={() => setPicking(false)}
      onUpdated={(value) => { onUpdated(value); setPicking(false); }} />}
  </>;
}
