"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Sparkles, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { createMyCharacter } from "@/lib/api";
import type { Faction } from "@/lib/api";
import { useToast } from "@/components/common/ToastProvider";

const TOTAL_POINTS = 2;

const FACTIONS: { value: Faction; label: string; description: string }[] = [
  { value: "공격", label: "공격", description: "적에게 강한 피해를 입히는 진영" },
  { value: "수비", label: "수비", description: "파티를 보호하는 진영" },
  { value: "치유", label: "치유", description: "파티를 회복시키는 진영" },
];

type StatKey = "stat_courage" | "stat_endurance" | "stat_charity" | "stat_wisdom";

const STAT_CONFIG: { key: StatKey; label: string }[] = [
  { key: "stat_courage", label: "용기" },
  { key: "stat_endurance", label: "인내" },
  { key: "stat_charity", label: "자애" },
  { key: "stat_wisdom", label: "지혜" },
];

const EMPTY_STATS: Record<StatKey, number> = {
  stat_courage: 0,
  stat_endurance: 0,
  stat_charity: 0,
  stat_wisdom: 0,
};

export default function CharacterOnboardingPage() {
  const { toast } = useToast();
  const { member, refresh } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [faction, setFaction] = useState<Faction | "">("");
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (member === undefined) return;
    if (member === null) {
      router.replace("/login");
      return;
    }
    if (member.character_id != null) {
      router.replace("/");
    }
  }, [member, router]);

  const usedPoints = stats.stat_courage + stats.stat_endurance + stats.stat_charity + stats.stat_wisdom;
  const remainingPoints = TOTAL_POINTS - usedPoints;

  function adjustStat(key: StatKey, delta: number) {
    setStats((prev) => {
      const nextValue = prev[key] + delta;
      if (nextValue < 0 || nextValue > TOTAL_POINTS) return prev;
      if (delta > 0 && remainingPoints <= 0) return prev;
      return { ...prev, [key]: nextValue };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!faction || remainingPoints !== 0) return;

    setLoading(true);
    try {
      await createMyCharacter({ name: name.trim(), faction, ...stats });
      await refresh();
      router.replace("/");
    } catch (error) {
      toast(error instanceof Error ? error.message : "캐릭터 생성에 실패했습니다.", "error");
    } finally {
      setLoading(false);
    }
  }

  if (member === undefined || member === null || member.character_id != null) {
    return null;
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-16">
      <Card>
        <CardHeader>
          <CardTitle>캐릭터 생성</CardTitle>
          <CardDescription>
            이름과 진영을 정하고, AP 포인트 2를 용기·인내·자애·지혜에 투자해 주세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wide">캐릭터 이름</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="캐릭터 이름" required />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-muted uppercase tracking-wide">진영</label>
              <RadioGroup
                value={faction}
                onValueChange={(value) => setFaction(value as Faction)}
                className="grid grid-cols-1 gap-2 sm:grid-cols-3"
              >
                {FACTIONS.map((f) => (
                  <label
                    key={f.value}
                    className={cn(
                      "flex cursor-pointer flex-col gap-1 rounded-xl border px-3 py-3 transition-colors",
                      faction === f.value
                        ? "border-gold bg-gold/10"
                        : "border-line hover:border-line",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value={f.value} />
                      <span className="font-semibold text-ivory">{f.label}</span>
                    </div>
                    <span className="text-xs text-muted">{f.description}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-line bg-inset px-4 py-4">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide">
                  <Sparkles size={12} className="text-gold" />
                  AP 포인트 투자
                </label>
                <span className="text-xs font-semibold text-ivory/85">남은 포인트 {remainingPoints}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {STAT_CONFIG.map(({ key, label }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2"
                  >
                    <span className="text-sm font-medium text-ivory">{label}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => adjustStat(key, -1)}
                        disabled={stats[key] <= 0}
                      >
                        <Minus size={12} />
                      </Button>
                      <span className="w-4 text-center text-sm font-semibold text-ivory">{stats[key]}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => adjustStat(key, 1)}
                        disabled={remainingPoints <= 0}
                      >
                        <Plus size={12} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={loading || !faction || remainingPoints !== 0 || !name.trim()}>
              <UserPlus size={15} />
              {loading ? "생성 중..." : "캐릭터 생성"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
