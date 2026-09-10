"use client";

import { type ReactNode, useId, useState } from "react";
import { ArrowLeftRight, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { reconcileBattlePairs } from "@/lib/battlePairs";

interface Props {
  characters: { id: number; name: string }[];
  pairs: number[][] | null;
  children: ReactNode[];
  compact?: boolean;
  disabled?: boolean;
  onSwap?: (sourceId: number, targetId: number) => void;
}

/** 편성 화면과 전투 카드가 같은 페어 배치/드래그 동작을 사용한다. */
export default function BattlePairGrid({ characters, pairs, children, compact = false, disabled = false, onSwap }: Props) {
  const instructionsId = useId();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const editable = !!onSwap && !disabled;

  if (pairs === null) {
    return <div className="grid grid-cols-1 justify-items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
  }

  const charactersById = new Map(characters.map((character, index) => [character.id, { ...character, content: children[index] }]));
  const groups = reconcileBattlePairs(pairs, characters.map((character) => character.id));
  const selectedCharacterId = selectedId !== null && charactersById.has(selectedId) ? selectedId : null;
  const activeId = draggedId !== null && charactersById.has(draggedId) ? draggedId : selectedCharacterId;
  const activeGroup = groups.findIndex((pair) => activeId !== null && pair.includes(activeId));

  function swap(sourceId: number, targetId: number) {
    if (!editable || !charactersById.has(sourceId) || !charactersById.has(targetId)) return;
    const sourceGroup = groups.findIndex((pair) => pair.includes(sourceId));
    const targetGroup = groups.findIndex((pair) => pair.includes(targetId));
    if (sourceGroup === targetGroup) return;
    onSwap?.(sourceId, targetId);
    setAnnouncement(`${charactersById.get(sourceId)?.name}, ${charactersById.get(targetId)?.name} 페어 자리 교환 요청`);
    setSelectedId(null);
    setDraggedId(null);
    setHoveredId(null);
  }

  return (
    <div className="space-y-3" aria-busy={disabled}>
      {onSwap && (
        <p id={instructionsId} className="text-xs leading-relaxed text-muted">
          {disabled ? "페어 편성을 저장하고 있습니다." : "이동 손잡이를 다른 페어의 캐릭터 위로 드래그해 자리를 교환하세요. 손잡이 두 개를 차례로 눌러도 변경할 수 있습니다. Esc로 선택을 취소합니다."}
        </p>
      )}
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <div className={cn("grid gap-4", compact ? "sm:grid-cols-2 xl:grid-cols-3" : "xl:grid-cols-2")}>
        {groups.map((pair, pairIndex) => (
          <section key={pairIndex} aria-label={pair.length === 2 ? `페어 ${pairIndex + 1}` : "페어 대기"} className="min-w-0">
            <div className="overflow-x-auto pb-1">
              <div className={cn("relative grid grid-cols-2 items-stretch gap-4", !compact && "min-w-[30rem]")}>
                {pair.length === 2 && <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-4 -translate-x-1/2" aria-label="페어 연결">
                  <span className="absolute left-1/2 top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-inset text-gold"><ArrowLeftRight size={18} /></span>
                </div>}
                {pair.map((id) => {
                  const character = charactersById.get(id)!;
                  const canReceive = editable && activeId !== null && activeGroup !== pairIndex;
                  return (
                    <div
                      key={id}
                      data-pair-character-id={id}
                      className={cn("min-w-0 rounded-2xl transition-shadow", editable && activeId === id && "ring-2 ring-gold", canReceive && hoveredId === id && "ring-2 ring-emerald-400")}
                      onDragOver={(event) => {
                        if (!canReceive || draggedId === null) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setHoveredId(id);
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHoveredId(null);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggedId !== null) swap(draggedId, id);
                      }}
                    >
                      {onSwap && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mb-1 h-7 w-full cursor-grab gap-1 text-xs text-muted active:cursor-grabbing"
                          disabled={disabled}
                          draggable={editable}
                          aria-label={`${character.name} 페어 이동`}
                          aria-describedby={instructionsId}
                          aria-pressed={selectedCharacterId === id}
                          onDragStart={(event) => {
                            if (!editable) { event.preventDefault(); return; }
                            event.dataTransfer.setData("text/plain", String(id));
                            event.dataTransfer.effectAllowed = "move";
                            setDraggedId(id);
                            setSelectedId(null);
                          }}
                          onDragEnd={() => { setDraggedId(null); setHoveredId(null); }}
                          onClick={() => {
                            if (selectedCharacterId !== null && selectedCharacterId !== id) swap(selectedCharacterId, id);
                            else setSelectedId(selectedCharacterId === id ? null : id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") { setSelectedId(null); setDraggedId(null); setHoveredId(null); }
                          }}
                        >
                          <GripVertical size={14} />
                          {selectedCharacterId === id ? "선택됨" : "이동"}
                        </Button>
                      )}
                      {character.content}
                    </div>
                  );
                })}
                {pair.length === 1 && <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-line px-2 text-center text-xs text-muted">페어 대기</div>}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
