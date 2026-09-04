"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import { Gem, PawPrint, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import InfoTooltip from "@/components/common/InfoTooltip";
import { SkillTooltipContent } from "@/components/skill/SkillTreeGrid";
import { BOOK_ACCENT } from "@/components/skill/bookAccent";
import { fetchCharacterCardDetails, formatEffect, ITEM_TYPE_LABELS, type Character, type CharacterCardDetails, type Faction } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  characters: Character[];
  loading: boolean;
  onSelectCharacter?: (character: Character) => void;
}

const POSITION_FILTERS: { value: Faction | "all"; label: string; image: string }[] = [
  { value: "all", label: "전체", image: "/position/team.png" },
  { value: "공격", label: "공격", image: "/position/position_1.png" },
  { value: "수비", label: "수비", image: "/position/position_2.png" },
  { value: "치유", label: "치유", image: "/position/position_3.png" },
];

function DetailSlots({ details }: { details: CharacterCardDetails }) {
  const slots: { key: string; label: string; image: string | null; icon: ReactNode; content: ReactNode }[] = [];
  const skill = details.skill;
  if (skill) slots.push({
    key: "skill", label: `기술: ${skill.display_name}`, image: skill.image_url, icon: <Sparkles size={18} />,
    content: <>
      <SkillTooltipContent node={skill} variant="runner" accent={BOOK_ACCENT[skill.book]} />
      {skill.effects.length > 0 && <p className="mt-2 max-w-64 whitespace-pre-wrap text-xs">효과: {skill.effects.map(formatEffect).join(", ")}</p>}
    </>,
  });
  for (const type of ["companion", "accessory"] as const) {
    const item = details.equipment.find((entry) => entry.item_type === type);
    if (!item) continue;
    slots.push({
      key: type, label: `${ITEM_TYPE_LABELS[type]}: ${item.name}`, image: item.image_url,
      icon: type === "companion" ? <PawPrint size={18} /> : <Gem size={18} />,
      content: <div className="max-w-64 space-y-2 text-left">
        <strong>{item.name}</strong>
        {item.description && <p className="whitespace-pre-wrap text-xs text-muted">{item.description}</p>}
        {item.effects.length > 0 && <p className="text-xs">효과: {item.effects.map(formatEffect).join(", ")}</p>}
      </div>,
    });
  }
  if (!slots.length) return null;
  return <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square">
    <div className="absolute inset-x-1 bottom-1 grid grid-cols-4 gap-1">
      {slots.map((slot) => <InfoTooltip key={slot.key} content={slot.content}>
        <button type="button" aria-label={slot.label}
          className="pointer-events-auto relative flex aspect-square min-w-0 items-center justify-center overflow-hidden border border-gold/60 bg-surface text-gold shadow-sm outline-none hover:border-gold focus-visible:ring-2 focus-visible:ring-gold">
          {slot.image ? <Image src={slot.image} alt="" fill sizes="48px" unoptimized className="object-cover" /> : slot.icon}
        </button>
      </InfoTooltip>)}
    </div>
  </div>;
}

export default function CharacterCardGrid({ characters, loading, onSelectCharacter }: Props) {
  const [filter, setFilter] = useState<Faction | "all">("all");
  const [showDetails, setShowDetails] = useState(false);
  const [details, setDetails] = useState<Map<number, CharacterCardDetails> | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  async function toggleDetails(checked: boolean) {
    setShowDetails(checked);
    if (!checked || details || detailsLoading) return;
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const cards = await fetchCharacterCardDetails();
      setDetails(new Map(cards.map((card) => [card.character_id, card])));
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : "캐릭터 상세 슬롯 조회 실패");
    } finally {
      setDetailsLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted">
          캐릭터 목록을 불러오는 중입니다.
        </CardContent>
      </Card>
    );
  }

  if (characters.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted">
          등록된 캐릭터가 없습니다.
        </CardContent>
      </Card>
    );
  }

  const visibleCharacters = filter === "all" ? characters : characters.filter((c) => c.faction === filter);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-center gap-6">
        {POSITION_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className="flex flex-col items-center gap-1.5"
          >
            <Image
              src={option.image}
              alt={option.label}
              width={48}
              height={48}
              className={cn(
                "[image-rendering:pixelated] transition-all",
                filter !== option.value && "opacity-60 grayscale",
              )}
            />
            <span className={cn("text-xs font-semibold", filter === option.value ? "text-gold" : "text-muted")}>
              {option.label}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ivory">
          <Checkbox checked={showDetails} onCheckedChange={(checked) => void toggleDetails(checked === true)} />
          자세히 보기
        </label>
        {showDetails && detailsLoading && <p role="status" className="text-xs text-muted">상세 정보를 불러오는 중입니다.</p>}
        {showDetails && detailsError && <div role="alert" className="text-xs text-red-400">
          {detailsError} <button type="button" className="underline" onClick={() => void toggleDetails(true)}>다시 시도</button>
        </div>}
      </div>

      {visibleCharacters.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">해당 포지션의 캐릭터가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {visibleCharacters.map((character) => (
            <div key={character.id} className="relative overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-gold/60 hover:bg-primary/20">
              <button type="button" onClick={() => onSelectCharacter?.(character)}
                className="flex w-full flex-col items-center gap-2 pb-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold">
              <CharacterAvatar
                src={character.image_url}
                alt={character.name}
                className="aspect-square w-full rounded-none"
                iconSize={28}
                sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
              />
              <p className="w-full truncate px-2 text-center text-sm font-semibold text-ivory">{character.name}</p>
              </button>
              {showDetails && details?.get(character.id) && <DetailSlots details={details.get(character.id)!} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
