"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import type { Character } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  candidates: Character[];
  appearedIds: number[];
  selectedIds: number[];
  onClose: () => void;
  onConfirm: (ids: number[]) => void;
}

/** 교류 로그 정산의 "교류 대상" 다중 선택 팝업. 체크박스 상태를 자체 관리해야 해서 DialogProvider 대신 전용 모달로 구현한다. */
export default function TargetPickerModal({ candidates, appearedIds, selectedIds, onClose, onConfirm }: Props) {
  const [draft, setDraft] = useState<number[]>(selectedIds);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? candidates.filter((c) => c.name.toLowerCase().includes(q)) : candidates;
  }, [candidates, query]);

  function toggle(id: number) {
    setDraft((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="pixel-frame flex max-h-[80vh] w-full max-w-sm flex-col bg-surface p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-bold text-ivory">교류 대상 선택</h2>
        <p className="mt-1 text-xs text-muted">
          이 로그에서 교류한 러너 캐릭터를 골라주세요. 이번 챕터에 처음 기입되는 캐릭터마다 1CP가 추가됩니다.
        </p>
        <Input
          className="mt-3"
          placeholder="캐릭터 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="mt-3 flex-1 overflow-y-auto rounded-lg border border-line">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted">선택할 수 있는 캐릭터가 없습니다.</p>
          ) : (
            filtered.map((c) => {
              const checked = draft.includes(c.id);
              const appeared = appearedIds.includes(c.id);
              return (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0 hover:bg-ground/40"
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(c.id)} />
                  <CharacterAvatar src={c.image_url} alt={c.name} className="size-8 rounded-lg" iconSize={14} />
                  <span className="flex-1 truncate text-sm text-ivory">{c.name}</span>
                  <span className={cn("shrink-0 text-[11px]", appeared ? "text-muted" : "text-gold")}>
                    {appeared ? "CP 지급됨" : "+1CP"}
                  </span>
                </label>
              );
            })
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button size="sm" onClick={() => onConfirm(draft)}>
            선택 완료 ({draft.length})
          </Button>
        </div>
      </div>
    </div>
  );
}
