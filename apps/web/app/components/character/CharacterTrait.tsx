"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { equipTrait, fetchTraits, type CharacterDetail, type Trait } from "@/lib/api";

export default function CharacterTrait({ character, onUpdated, readOnly }: {
  character: CharacterDetail; onUpdated: (value: CharacterDetail) => void; readOnly: boolean;
}) {
  const [traits, setTraits] = useState<Trait[]>([]);
  const [choice, setChoice] = useState(String(character.trait_id ?? "none"));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (readOnly) return;
    let cancelled = false;
    fetchTraits().then((value) => { if (!cancelled) setTraits(value.filter((trait) => trait.rules)); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "특성 조회 실패"); });
    return () => { cancelled = true; };
  }, [readOnly]);
  const selected = traits.find((trait) => String(trait.id) === choice);
  const equipped = character.equipped_trait;
  const shown = readOnly ? equipped : choice === "none" ? null : selected ?? equipped;
  const locked = pending || character.in_live_battle;
  async function save() {
    setPending(true); setError("");
    try { onUpdated(await equipTrait(character.id, choice === "none" ? null : Number(choice))); }
    catch (e) { setError(e instanceof Error ? e.message : "특성 장착 변경 실패"); }
    finally { setPending(false); }
  }
  return <Field>
    <FieldLabel htmlFor={`character-trait-${character.id}`}>특성 · 1개 장착</FieldLabel>
    {readOnly ? <p className="text-sm">{equipped?.name ?? "장착한 특성 없음"}</p> : <div className="flex items-center gap-2">
      <Select value={choice} onValueChange={setChoice} disabled={locked}>
        <SelectTrigger id={`character-trait-${character.id}`}><SelectValue placeholder="특성 선택" /></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="none">장착 안 함</SelectItem>
          {traits.map((trait) => <SelectItem key={trait.id} value={String(trait.id)}>{trait.name}</SelectItem>)}
        </SelectGroup></SelectContent>
      </Select>
      <Button type="button" disabled={locked || choice === String(character.trait_id ?? "none")} onClick={() => void save()}>{pending ? "저장 중..." : "적용"}</Button>
    </div>}
    {shown && <><p className="whitespace-pre-wrap text-sm text-ivory">{shown.effect}</p><p className="text-xs text-muted">{shown.description}</p></>}
    {character.in_live_battle && !readOnly && <p className="text-xs text-muted">실전 전투 중에는 특성을 변경할 수 없습니다.</p>}
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
  </Field>;
}
