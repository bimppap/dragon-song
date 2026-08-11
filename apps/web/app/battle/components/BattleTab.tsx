"use client";

import { useEffect, useState } from "react";
import { Skull, Swords, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchEnemies, type Enemy } from "@/lib/api";
import BattleArena from "./BattleArena";

const numberFormatter = new Intl.NumberFormat("ko-KR");

export default function BattleTab() {
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeEnemy, setActiveEnemy] = useState<Enemy | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEnemies()
      .then((list) => { if (!cancelled) setEnemies(list); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "에너미 조회 실패"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (activeEnemy) {
    return <BattleArena enemy={activeEnemy} onExit={() => setActiveEnemy(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-800">전투 목록</h2>
        <p className="text-sm text-slate-500">적을 선택해 전투를 시작하세요.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">에너미 목록을 불러오는 중...</p>
      ) : enemies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
          등록된 에너미가 없습니다. 에너미 탭에서 먼저 등록하세요.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {enemies.map((enemy) => (
            <div
              key={enemy.id}
              className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 transition hover:border-indigo-300 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Skull size={18} className="text-red-500" />
                  <div>
                    <p className="font-bold text-slate-800">{enemy.name}</p>
                    {enemy.chapter && <p className="mt-0.5 text-xs text-slate-400">{enemy.chapter}</p>}
                  </div>
                </div>
                <Badge variant="outline" className="font-num">스킬 {enemy.skills.length}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">기본 HP</p>
                  <p className="font-num text-sm font-bold text-slate-700">{numberFormatter.format(enemy.base_hp)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="flex items-center justify-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    <Zap size={10} />공격
                  </p>
                  <p className="font-num text-sm font-bold text-red-500">{numberFormatter.format(enemy.attack)}</p>
                </div>
              </div>

              {(enemy.hp_per_attacker > 0 || enemy.hp_per_defender > 0 || enemy.hp_per_healer > 0) && (
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  {enemy.hp_per_attacker > 0 && <span>공격 인원당 +{enemy.hp_per_attacker}</span>}
                  {enemy.hp_per_defender > 0 && <span>수비 인원당 +{enemy.hp_per_defender}</span>}
                  {enemy.hp_per_healer > 0 && <span>치유 인원당 +{enemy.hp_per_healer}</span>}
                </div>
              )}

              <Button className="w-full" onClick={() => setActiveEnemy(enemy)}>
                <Swords size={14} />
                전투 시작
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
