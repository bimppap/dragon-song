"use client";

import { useEffect, useState } from "react";
import { Heart, HeartPulse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import { useDialog } from "@/components/common/DialogProvider";
import EmptyState from "@/components/common/EmptyState";
import { useToast } from "@/components/common/ToastProvider";
import {
  fetchCharacters,
  fetchHealerCandidates,
  performNoncombatHeal,
  type Character,
  type HealerCandidate,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("ko-KR");
const fmt = (n: number) => numberFormatter.format(Math.max(0, Math.round(n)));

/** 치유값 = 대상 최대 체력의 25%. 오버힐은 없으므로 남은 체력만큼으로 캡한다. */
function healValueFor(target: Character): number {
  return Math.max(0, Math.min(Math.floor(target.hp_max * 0.25), target.hp_max - target.hp));
}

function HpBar({ hp, max }: { hp: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (hp / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-num w-20 shrink-0 text-right text-[11px] text-muted">
        {fmt(hp)}/{fmt(max)}
      </span>
    </div>
  );
}

export default function HealTab() {
  const { toast } = useToast();
  const { confirm } = useDialog();
  const [healers, setHealers] = useState<HealerCandidate[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeHealer, setActiveHealer] = useState<HealerCandidate | null>(null);
  const [healing, setHealing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const [healerList, characterList] = await Promise.all([
          fetchHealerCandidates(),
          fetchCharacters(),
        ]);
        if (cancelled) return;
        setHealers(healerList);
        setCharacters(characterList);
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : "치유 데이터 조회 실패", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [toast]);

  function openHealer(healer: HealerCandidate) {
    if (!healer.heal_available) return;
    setActiveHealer(healer);
  }

  function closeModal() {
    setActiveHealer(null);
  }

  const healableCharacters = characters.filter((c) => c.hp < c.hp_max);

  async function handleSelectTarget(target: Character) {
    if (!activeHealer || healing) return;
    const healAmount = healValueFor(target);
    const ok = await confirm({
      title: "비전투 치유",
      description: `${target.name}을(를) 치유하시겠습니까? (+${healAmount})\n${activeHealer.name}의 오늘 비전투 치유가 소모됩니다.`,
      confirmText: "치유",
    });
    if (!ok) return;
    try {
      setHealing(true);
      const result = await performNoncombatHeal(activeHealer.id, target.id);
      setHealers((prev) => prev.map((h) => (h.id === result.healer.id ? result.healer : h)));
      setCharacters((prev) => prev.map((c) => (
        c.id === result.target_character_id ? { ...c, hp: result.target_hp } : c
      )));
      toast(`${target.name}을(를) ${result.heal_amount} 치유했습니다.`, "success");
      closeModal();
    } catch (e) {
      toast(e instanceof Error ? e.message : "치유 실패", "error");
    } finally {
      setHealing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HeartPulse size={16} className="text-emerald-400" />
          치유
        </CardTitle>
        <CardDescription>
          치유 포지션 캐릭터의 비전투 치유 사용 여부를 확인하고, 대상을 지정해 치유할 수 있습니다.
          비전투 치유는 캐릭터당 하루 한 번, 자정(KST)에 다시 충전됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <EmptyState>치유 데이터를 불러오는 중입니다.</EmptyState>
        ) : healers.length === 0 ? (
          <EmptyState>치유 포지션 캐릭터가 없습니다.</EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {healers.map((healer) => (
              <button
                key={healer.id}
                type="button"
                onClick={() => openHealer(healer)}
                disabled={!healer.heal_available}
                className={cn(
                  "flex flex-col items-center gap-2 overflow-hidden rounded-2xl border bg-surface p-3 text-center transition-colors",
                  healer.heal_available
                    ? "cursor-pointer border-line hover:border-gold/45"
                    : "cursor-not-allowed border-line/50 opacity-60",
                )}
              >
                <CharacterAvatar src={healer.image_url} alt={healer.name} className="size-16 rounded-xl" iconSize={22} />
                <span className="font-semibold text-ivory">{healer.name}</span>
                <Badge variant={healer.heal_available ? "success" : "secondary"} className="text-[10px]">
                  {healer.heal_available ? "비전투 치유 사용 가능" : "오늘 사용함"}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      {activeHealer && (
        <div
          className="fixed inset-0 z-110 flex items-center justify-center bg-black/50 p-4"
          onClick={closeModal}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <CharacterAvatar src={activeHealer.image_url} alt={activeHealer.name} className="size-10 rounded-lg" iconSize={16} />
              <div>
                <p className="font-semibold text-ivory">{activeHealer.name}의 치유</p>
                <p className="text-xs text-muted">치유 대상을 선택하세요.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {healableCharacters.length === 0 ? (
                <p className="col-span-full py-3 text-center text-sm text-muted">
                  체력이 가득 차지 않은 캐릭터가 없습니다.
                </p>
              ) : healableCharacters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={healing}
                  onClick={() => handleSelectTarget(c)}
                  className="flex items-center gap-3 rounded-xl border border-line p-2.5 text-left transition-colors hover:border-gold/45 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CharacterAvatar src={c.image_url} alt={c.name} className="size-10 shrink-0 rounded-lg" iconSize={16} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ivory">{c.name}</p>
                    <HpBar hp={c.hp} max={c.hp_max} />
                  </div>
                  <div className="flex shrink-0 items-center gap-1 text-sm font-semibold text-emerald-300">
                    <Heart size={13} className="text-emerald-400" />
                    +{fmt(healValueFor(c))}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={closeModal}>닫기</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
