"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import type { Character, Faction } from "@/lib/api";
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

export default function CharacterCardGrid({ characters, loading, onSelectCharacter }: Props) {
  const [filter, setFilter] = useState<Faction | "all">("all");

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

      {visibleCharacters.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">해당 포지션의 캐릭터가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {visibleCharacters.map((character) => (
            <button
              key={character.id}
              type="button"
              onClick={() => onSelectCharacter?.(character)}
              className="flex flex-col items-center gap-2 overflow-hidden rounded-2xl border border-line bg-surface pb-3 text-left transition-colors hover:border-gold/60 hover:bg-primary/20"
            >
              <CharacterAvatar
                src={character.image_url}
                alt={character.name}
                className="aspect-square w-full rounded-none"
                iconSize={28}
              />
              <p className="w-full truncate px-2 text-center text-sm font-semibold text-ivory">{character.name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
