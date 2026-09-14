"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchCharacters, fetchCharacterPaidSourceIds, grantCharacterRewardBatch } from "@/lib/api";
import type { Character, Item, Mission, Challenge, RewardGrant } from "@/lib/api";
import RewardSummary from "./RewardSummary";
import { useToast } from "./ToastProvider";
import { useDialog } from "./DialogProvider";

function rewardEntries(source: Mission | Challenge): RewardGrant[] {
  const legacy: [Extract<RewardGrant, { type: "stat" }>["stat"], number][] = [
    ["gold", source.reward_gold], ["exp", source.reward_experience], ["ap", source.reward_ap],
    ["hp_max", source.reward_hp], ["atk", source.reward_attack], ["def", source.reward_defense],
  ];
  return [...legacy.filter(([, amount]) => amount > 0).map(([stat, amount]) => ({ type: "stat" as const, stat, amount })), ...source.reward_items];
}

export default function CharacterRewardBatch({ kind, sources, items }: {
  kind: "mission" | "challenge"; sources: (Mission | Challenge)[]; items: Item[];
}) {
  const { toast } = useToast();
  const { confirm } = useDialog();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterId, setCharacterId] = useState("");
  const [chapter, setChapter] = useState("all");
  const [selected, setSelected] = useState<number[]>([]);
  const [paid, setPaid] = useState<Set<number>>(new Set());
  const [showPaid, setShowPaid] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const [errorKey, setErrorKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const label = kind === "mission" ? "임무" : "도전과제";
  const requestKey = `${kind}:${characterId}:${reload}`;
  const ready = loadedKey === requestKey;
  const loading = !ready && errorKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    fetchCharacters().then((list) => { if (!cancelled) setCharacters(list); })
      .catch((error) => { if (!cancelled) toast(error instanceof Error ? error.message : "캐릭터 조회 실패", "error"); });
    return () => { cancelled = true; };
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    if (!characterId) return;
    fetchCharacterPaidSourceIds(Number(characterId), kind).then((ids) => {
      if (!cancelled) { setPaid(new Set(ids)); setLoadedKey(requestKey); }
    }).catch((error) => {
      if (!cancelled) {
        setErrorKey(requestKey);
        toast(error instanceof Error ? error.message : "보상 현황 조회 실패", "error");
      }
    });
    return () => { cancelled = true; };
  }, [characterId, kind, requestKey, toast]);

  const inChapter = sources.filter((source) => chapter === "all" || source.chapter === chapter);
  const unpaid = inChapter.filter((source) => !paid.has(source.id));
  // 기본은 아직 지급하지 않은 항목만 보여주고, 필요할 때만 지급 완료 항목을 함께 펼친다.
  const visible = showPaid ? inChapter : unpaid;
  const character = characters.find((entry) => entry.id === Number(characterId));
  async function grant() {
    if (!character || !selected.length || !ready) return;
    const ok = await confirm({ title: `${label} 완료 및 보상 지급`,
      description: `${character.name}에게 다음 ${selected.length}개를 완료 처리하고 보상을 지급합니다.\n${sources.filter((source) => selected.includes(source.id)).map((source) => source.name).join("\n")}`,
      confirmText: "완료 및 지급", disableEnterConfirm: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      const result = await grantCharacterRewardBatch(character.id, kind, selected);
      setPaid((prev) => new Set([...prev, ...selected]));
      setSelected([]);
      toast(`${character.name}에게 ${result.paid_count}개 보상을 지급했습니다.`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "보상 지급 실패", "error");
      setReload((value) => value + 1);
    } finally { setSaving(false); }
  }

  return <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
    <p className="text-sm text-muted">캐릭터를 고른 뒤 지급할 {label}를 여러 개 선택하세요. 선택한 항목은 완료 처리와 보상 지급을 함께 진행합니다.</p>
    <div className="flex flex-wrap gap-3">
      <Select value={characterId} disabled={saving} onValueChange={(value) => { setCharacterId(value); setSelected([]); }}>
        <SelectTrigger className="w-56" aria-label="보상을 받을 캐릭터"><SelectValue placeholder="캐릭터 선택" /></SelectTrigger>
        <SelectContent>{characters.map((entry) => <SelectItem key={entry.id} value={String(entry.id)}>{entry.name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={chapter} disabled={saving} onValueChange={(value) => { setChapter(value); setSelected([]); }}>
        <SelectTrigger className="w-48" aria-label="챕터"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">전체 챕터</SelectItem>{[...new Set(sources.map((source) => source.chapter))].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
      </Select>
      <Button disabled={saving || loading || !ready || !character || !selected.length} onClick={grant}>{saving ? "지급 중..." : `선택 ${selected.length}개 완료 및 지급`}</Button>
    </div>
    {!characterId ? <p className="text-sm text-muted">캐릭터를 선택하세요.</p> : loading ? <p>보상 현황을 불러오는 중...</p> : !ready ? <Button variant="outline" onClick={() => setReload((value) => value + 1)}>현황 다시 불러오기</Button> : <>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm"><Checkbox disabled={saving || !unpaid.length}
          checked={unpaid.length > 0 && unpaid.every((source) => selected.includes(source.id))}
          onCheckedChange={(checked) => setSelected(checked === true ? unpaid.map((source) => source.id) : [])} />전체 선택</label>
        <label className="flex items-center gap-2 text-sm text-muted"><Checkbox checked={showPaid} onCheckedChange={(checked) => setShowPaid(checked === true)} />지급 완료 항목도 보기</label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">{visible.map((source) => <label key={source.id} className="flex items-start gap-3 rounded-lg border border-line p-3">
        <Checkbox aria-label={source.name} checked={selected.includes(source.id)} disabled={saving || paid.has(source.id)} onCheckedChange={(checked) => setSelected((prev) => checked === true ? [...prev, source.id] : prev.filter((id) => id !== source.id))} />
        <div className="min-w-0 space-y-2"><p className="font-semibold">{source.name} {paid.has(source.id) && <span className="text-xs text-muted">지급 완료</span>}</p>
          <p className="text-xs text-muted">{source.chapter}</p><RewardSummary entries={rewardEntries(source)} items={items} /></div>
      </label>)}</div>
      {!visible.length && <p className="text-sm text-muted">{inChapter.length ? `미지급 ${label}가 없습니다.` : `등록된 ${label}가 없습니다.`}</p>}
    </>}
  </div>;
}
