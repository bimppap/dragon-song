"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createCharacter, MAX_CHARACTER_LEVEL, type Character, type Faction } from "@/lib/api";
import { useToast } from "@/components/common/ToastProvider";

export default function CharacterCreate({ onCreated }: { onCreated: (character: Character) => void }) {
  const [name, setName] = useState("");
  const [faction, setFaction] = useState<Faction>("공격");
  const [level, setLevel] = useState(1);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  return <form className="max-w-md space-y-4" onSubmit={async (event) => {
    event.preventDefault();
    setBusy(true);
    try { onCreated(await createCharacter({ name: name.trim(), faction, lv: level, initialize_growth: true })); }
    catch (error) { toast(error instanceof Error ? error.message : "캐릭터 생성 실패", "error"); }
    finally { setBusy(false); }
  }}>
    <label className="block space-y-1 text-sm">캐릭터 이름<Input required value={name} onChange={(event) => setName(event.target.value)} /></label>
    <div className="space-y-1 text-sm">역할<Select value={faction} onValueChange={(value) => setFaction(value as Faction)}><SelectTrigger aria-label="역할"><SelectValue /></SelectTrigger><SelectContent>{(["공격", "수비", "치유"] as Faction[]).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1 text-sm">레벨<Select value={String(level)} onValueChange={(value) => setLevel(Number(value))}><SelectTrigger aria-label="레벨"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: MAX_CHARACTER_LEVEL }, (_, index) => index + 1).map((value) => <SelectItem key={value} value={String(value)}>Lv.{value}</SelectItem>)}</SelectContent></Select></div>
    <p className="text-sm text-muted">기본 AP 10 + 레벨 상승 AP {(level - 1) * 2} = {10 + (level - 1) * 2} AP. 생성 후 상세 화면에서 능력치에 투자하고 기술 슬롯을 눌러 기술을 선택하세요.</p>
    <Button type="submit" disabled={busy || !name.trim()}>{busy ? "생성 중..." : "캐릭터 생성"}</Button>
  </form>;
}
