"use client";

import { useEffect, useState } from "react";
import { Heart, Shield, Skull, Swords, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchEnemies, type Enemy } from "@/lib/api";
import BattleArena from "./BattleArena";
import AlertBanner from "@/components/common/AlertBanner";
import EmptyState from "@/components/common/EmptyState";

const numberFormatter = new Intl.NumberFormat("ko-KR");

const BATTLE_FORMULAS: { label: string; icon: React.ElementType; accent: string; formula: string }[] = [
  {
    label: "공격",
    icon: Swords,
    accent: "text-red-500",
    formula:
      "에너미에게 주는 피해 = (공격력 × (1 + 공격력 증폭) + 기술 효율(고정)) × (1 + 피해 증폭) × (1 + 기술 등급 × 기술 효율(비례)) × 마나계수",
  },
  {
    label: "수비",
    icon: Shield,
    accent: "text-gold",
    formula:
      "받는 피해 = max(0, 에너미 피해 × (1 − 피해 감소) − 방어력 × (1 + 방어력 증폭) × 방어 효율), 남은 피해는 보호막(보호막 + 시작 보호막)이 먼저 흡수",
  },
  {
    label: "치유",
    icon: Heart,
    accent: "text-emerald-500",
    formula:
      "치유량 = (치유 효율 + 기술 효율(고정)) × (1 + 치유 효율 증폭) × (1 + 기술 등급 × 기술 효율(비례)) × 마나계수, 지정 대상과 체력 낮은 아군에게 기술 대상 수만큼 적용(오버힐 대상은 최대 체력 초과 회복)",
  },
];

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

  return (
    <div className="space-y-6">
      {/* 전투 계산식 (상단, 카드 아님) */}
      <div className="space-y-2 border-b border-line pb-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">전투 계산식</h2>
        <div className="space-y-1.5">
          {BATTLE_FORMULAS.map(({ label, icon: Icon, accent, formula }) => (
            <div key={label} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="flex shrink-0 items-center gap-1 font-semibold text-ivory">
                <Icon size={13} className={accent} />
                {label}
              </span>
              <span className="text-muted">{formula}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          마나계수는 마나가 기술 비용 이상이면 1(기술 비용만큼 마나 소모), 미만이면 0.5입니다. 매 라운드 시작 시
          체력 재생력(고정) + 최대 체력 × 체력 재생력(비례)만큼 회복하고 마나 재생력만큼 마나가 회복됩니다. 최대 체력 =
          최대 체력 × (1 + 체력 증폭)이며, 에너미 지정 공격은 주목도 + 존재감이 높은 캐릭터부터 노립니다. (부활 후 체력·행동횟수는 적군 전용 능력치입니다.)
        </p>
      </div>

      {activeEnemy ? (
        <BattleArena enemy={activeEnemy} onExit={() => setActiveEnemy(null)} />
      ) : (
        <BattleList
          enemies={enemies}
          loading={loading}
          error={error}
          numberFormatter={numberFormatter}
          onStart={setActiveEnemy}
        />
      )}
    </div>
  );
}

interface BattleListProps {
  enemies: Enemy[];
  loading: boolean;
  error: string | null;
  numberFormatter: Intl.NumberFormat;
  onStart: (enemy: Enemy) => void;
}

function BattleList({ enemies, loading, error, numberFormatter, onStart }: BattleListProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-ivory">전투 목록</h2>
        <p className="text-sm text-muted">적을 선택해 전투를 시작하세요.</p>
      </div>

      {error && (
        <AlertBanner>{error}</AlertBanner>
      )}

      {loading ? (
        <p className="text-sm text-muted">에너미 목록을 불러오는 중...</p>
      ) : enemies.length === 0 ? (
        <EmptyState>
          등록된 에너미가 없습니다. 에너미 탭에서 먼저 등록하세요.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {enemies.map((enemy) => (
            <div
              key={enemy.id}
              className="space-y-4 rounded-xl border border-line bg-surface p-5 transition hover:border-gold hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Skull size={18} className="text-red-500" />
                  <div>
                    <p className="font-bold text-ivory">{enemy.name}</p>
                    {enemy.chapter && <p className="mt-0.5 text-xs text-muted">{enemy.chapter}</p>}
                  </div>
                </div>
                <Badge variant="outline" className="font-num">스킬 {enemy.skills.length}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-inset py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted">기본 HP</p>
                  <p className="font-num text-sm font-bold text-ivory">{numberFormatter.format(enemy.base_hp)}</p>
                </div>
                <div className="rounded-lg bg-inset py-2">
                  <p className="flex items-center justify-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted">
                    <Zap size={10} />공격
                  </p>
                  <p className="font-num text-sm font-bold text-red-500">{numberFormatter.format(enemy.attack)}</p>
                </div>
              </div>

              {(enemy.hp_per_attacker > 0 || enemy.hp_per_defender > 0 || enemy.hp_per_healer > 0) && (
                <div className="flex flex-wrap gap-2 text-xs text-muted">
                  {enemy.hp_per_attacker > 0 && <span>공격 인원당 +{enemy.hp_per_attacker}</span>}
                  {enemy.hp_per_defender > 0 && <span>수비 인원당 +{enemy.hp_per_defender}</span>}
                  {enemy.hp_per_healer > 0 && <span>치유 인원당 +{enemy.hp_per_healer}</span>}
                </div>
              )}

              <Button className="w-full" onClick={() => onStart(enemy)}>
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
