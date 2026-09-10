"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Plus, Sparkles } from "lucide-react";
import InfoTooltip from "@/components/common/InfoTooltip";
import Modal from "@/components/common/Modal";
import { Button } from "@/components/ui/button";
import { BOOK_ACCENT } from "@/components/skill/bookAccent";
import { cn } from "@/lib/utils";
import {
  fetchCharacterCardDetails,
  fetchCharacters,
  fetchClonedSkills,
  saveClonedSkills,
  type CharacterCardDetails,
  type CharacterSkillNode,
  type ClonedSkill,
  type ClonedSkills,
} from "@/lib/api";

/** 복제 계열(탐구의 서 세 번째 계열 파생)은 복제 대상이 될 수 없다. */
function isCloneSkill(skill: Pick<CharacterSkillNode, "book" | "branch" | "col">): boolean {
  return skill.book === "탐구의 서" && skill.branch === 2 && skill.col === 1;
}

interface Candidate {
  characterId: number;
  characterName: string;
  skill: CharacterSkillNode;
}

interface Props {
  characterId: number;
  /** 다른 러너의 캐릭터를 열람할 때는 저장 목록만 보여준다. */
  readOnly?: boolean;
}

/**
 * 복제 기술을 배운 캐릭터에게만 보이는 저장 슬롯.
 * 칸 수는 복제 기술의 depth를 따르고, 커서를 올리면 저장한 기술을 확인할 수 있다.
 */
export default function CharacterClonedSkills({ characterId, readOnly = false }: Props) {
  const [data, setData] = useState<ClonedSkills | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await fetchClonedSkills(characterId);
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "복제 기술 조회 실패");
      }
    }

    load();
    return () => { cancelled = true; };
  }, [characterId]);

  async function openPicker(slotIndex: number) {
    setEditingSlot(slotIndex);
    if (candidates) return;
    try {
      const [characters, cards] = await Promise.all([fetchCharacters(), fetchCharacterCardDetails()]);
      const nameById = new Map(characters.map((character) => [character.id, character.name]));
      const skillByCharacter = new Map<number, CharacterCardDetails["skill"]>(
        cards.map((card) => [card.character_id, card.skill]),
      );
      setCandidates(
        characters
          .filter((character) => character.id !== characterId)
          .flatMap((character) => {
            const skill = skillByCharacter.get(character.id);
            if (!skill || isCloneSkill(skill)) return [];
            return [{
              characterId: character.id,
              characterName: nameById.get(character.id) ?? "",
              skill,
            }];
          }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "캐릭터 기술 조회 실패");
      setEditingSlot(null);
    }
  }

  async function commit(slots: ClonedSkills["slots"]) {
    setSaving(true);
    try {
      setError(null);
      setData(await saveClonedSkills(
        characterId,
        slots.map((slot) => ({
          slot_index: slot.slot_index,
          source_character_id: slot.source_character_id,
          source_node_id: slot.source_node_id,
        })),
      ));
      setEditingSlot(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "복제 기술 저장 실패");
    } finally {
      setSaving(false);
    }
  }

  function pick(candidate: Candidate) {
    if (editingSlot == null || !data) return;
    const kept = data.slots.filter((slot) => slot.slot_index !== editingSlot);
    commit([...kept, {
      slot_index: editingSlot,
      source_character_id: candidate.characterId,
      source_character_name: candidate.characterName,
      source_node_id: candidate.skill.id,
      book: candidate.skill.book,
      display_name: candidate.skill.display_name,
      image_url: candidate.skill.image_url,
    }]);
  }

  function clearSlot() {
    if (editingSlot == null || !data) return;
    commit(data.slots.filter((slot) => slot.slot_index !== editingSlot));
  }

  // 복제를 배우지 않았으면 슬롯 자체를 보여주지 않는다.
  if (!data || data.slot_count <= 0) return null;

  const slotByIndex = new Map<number, ClonedSkill>(data.slots.map((slot) => [slot.slot_index, slot]));

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-semibold text-muted">복제</span>
      <div className="flex gap-1">
        {Array.from({ length: data.slot_count }, (_, index) => {
          const slot = slotByIndex.get(index);
          const label = slot ? `${slot.source_character_name}의 ${slot.display_name}` : "빈 복제 칸";
          return (
            <InfoTooltip
              key={index}
              side="top"
              content={(
                <div className="max-w-56 text-left">
                  {slot ? (
                    <>
                      <div className={cn("font-semibold", BOOK_ACCENT[slot.book].text)}>
                        복제:{slot.display_name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">{slot.source_character_name}의 기술</div>
                    </>
                  ) : (
                    <div className="text-muted">비어 있는 복제 칸</div>
                  )}
                  {!readOnly && (
                    <div className="mt-1 text-[11px] text-muted">클릭해서 {slot ? "변경" : "저장"}</div>
                  )}
                </div>
              )}
            >
              <button
                type="button"
                aria-label={label}
                disabled={readOnly}
                onClick={() => openPicker(index)}
                className={cn(
                  "relative flex size-9 items-center justify-center overflow-hidden border-2 bg-gold/10 transition-colors",
                  slot ? BOOK_ACCENT[slot.book].border : "border-line text-muted",
                  readOnly ? "cursor-default" : "cursor-pointer hover:bg-gold/15",
                )}
              >
                {slot?.image_url ? (
                  <Image src={slot.image_url} alt="" fill sizes="36px" unoptimized className="object-cover" />
                ) : slot ? (
                  <Sparkles size={17} />
                ) : (
                  <Plus size={15} />
                )}
              </button>
            </InfoTooltip>
          );
        })}
      </div>
      {error && <span className="text-[10px] text-red-500">{error}</span>}

      <Modal
        open={editingSlot != null}
        onClose={() => setEditingSlot(null)}
        title={`복제할 기술 선택 (${(editingSlot ?? 0) + 1}번 칸)`}
      >
        {candidates == null ? (
          <span className="text-xs text-muted">불러오는 중...</span>
        ) : candidates.length === 0 ? (
          <span className="text-xs text-muted">복제할 수 있는 다른 캐릭터의 기술이 없습니다.</span>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid max-h-80 gap-1 overflow-y-auto sm:grid-cols-2">
              {candidates.map((candidate) => (
                <button
                  key={candidate.characterId}
                  type="button"
                  disabled={saving}
                  onClick={() => pick(candidate)}
                  className="flex items-center gap-2 border border-line bg-surface px-2 py-1.5 text-left transition-colors hover:bg-inset disabled:opacity-50"
                >
                  <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden border border-line bg-gold/10 text-gold">
                    {candidate.skill.image_url ? (
                      <Image src={candidate.skill.image_url} alt="" fill sizes="32px" unoptimized className="object-cover" />
                    ) : (
                      <Sparkles size={15} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-ivory">{candidate.skill.display_name}</span>
                    <span className="block truncate text-[10px] text-muted">{candidate.characterName}</span>
                  </span>
                </button>
              ))}
            </div>
            {slotByIndex.has(editingSlot ?? -1) && (
              <Button type="button" size="sm" variant="outline" disabled={saving} onClick={clearSlot}>
                이 칸 비우기
              </Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
