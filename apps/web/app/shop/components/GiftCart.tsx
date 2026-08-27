"use client";

import { Coins, Gift, Minus, Plus, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import { parsePositiveInt } from "@/lib/utils";
import type { Character } from "@/lib/api";
import type { CartEntry } from "./Cart";

interface Props {
  characters: Character[];
  selectedCharacterIds: number[];
  onSelectCharacter: (id: number) => void;
  onUnselectCharacter: (id: number) => void;
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

/** 관리자 상점의 선물 바구니: 캐릭터(들)를 고르고 골드·CP·아이템을 담아 보낸다. */
export default function GiftCart({
  characters,
  selectedCharacterIds,
  onSelectCharacter,
  onUnselectCharacter,
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
  const charactersById = new Map(characters.map((c) => [c.id, c]));
  const characterOptions = characters
    .filter((c) => !selectedCharacterIds.includes(c.id))
    .map((c) => ({
      value: String(c.id),
      label: c.name,
      icon: <CharacterAvatar src={c.image_url} alt={c.name} className="size-5 rounded-full" iconSize={10} />,
    }));

  return (
    <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface lg:w-72">
      <div className="flex items-center gap-2 border-b border-line bg-inset px-4 py-3">
        <Gift size={16} className="text-gold" />
        <span className="text-sm font-semibold text-ivory">선물 바구니</span>
        <span className="font-num ml-auto text-xs font-medium text-muted">아이템 {totalQty}개</span>
      </div>

      {/* 선물 받을 캐릭터 */}
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
        <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
          <UserPlus size={11} className="text-gold" />선물 받을 캐릭터
        </span>
        <Combobox
          options={characterOptions}
          value={null}
          onChange={(v) => onSelectCharacter(Number(v))}
          placeholder="캐릭터 선택 (여러 명 선택 가능)"
          searchPlaceholder="캐릭터 이름 검색"
          emptyText="일치하는 캐릭터가 없습니다."
        />
        {selectedCharacterIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedCharacterIds.map((id) => {
              const character = charactersById.get(id);
              return (
                <Badge key={id} variant="secondary" className="gap-1.5 py-1 pl-1.5 pr-1">
                  <CharacterAvatar
                    src={character?.image_url ?? null}
                    alt={character?.name ?? String(id)}
                    className="size-4 rounded-full"
                    iconSize={9}
                  />
                  {character?.name ?? id}
                  <button
                    type="button"
                    onClick={() => onUnselectCharacter(id)}
                    className="rounded-full p-0.5 text-ivory/70 transition-colors hover:bg-ivory/15 hover:text-ivory"
                    aria-label={`${character?.name ?? id} 선택 해제`}
                  >
                    <X size={11} />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
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
          선택한 캐릭터 각각에게 동일한 선물이 지급되며, 캐릭터의 보상 이력에 &lsquo;관리자의 선물&rsquo;로 기록됩니다.
        </p>
        <Button
          variant="cta"
          className="w-full"
          disabled={loading || !hasContent || selectedCharacterIds.length === 0}
          onClick={onSend}
        >
          <Gift size={15} />
          {loading ? "보내는 중..." : "선물 보내기"}
        </Button>
      </div>
    </aside>
  );
}
