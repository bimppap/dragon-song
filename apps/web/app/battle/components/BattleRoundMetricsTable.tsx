"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { BattleLogMetrics, BattleLogRound } from "@/lib/api";

const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR");

const EMPTY_METRICS: BattleLogMetrics = {
  ally_skill_damage: 0,
  ally_basic_damage: 0,
  ally_healing: 0,
  enemy_damage: 0,
};

type DamageMetric = "ally_skill_damage" | "ally_basic_damage" | "ally_total_damage";
type CumulativeMetrics = BattleLogMetrics & { ally_total_damage: number };

const ALLY_DAMAGE_ROWS: { key: DamageMetric; label: string; className: string }[] = [
  { key: "ally_skill_damage", label: "아군 기술 피해량", className: "bg-sky-500/10 text-sky-200" },
  { key: "ally_basic_damage", label: "아군 일반 공격 피해량", className: "bg-sky-500/10 text-sky-200" },
  { key: "ally_total_damage", label: "아군 총 피해량", className: "bg-orange-500/15 text-orange-200" },
];

function cumulativeMetricsByRound(log: BattleLogRound[]): { round: number; metrics: CumulativeMetrics }[] {
  const entriesByRound = new Map<number, BattleLogMetrics>();
  for (const entry of log) {
    const metrics = entry.metrics ?? EMPTY_METRICS;
    const current = entriesByRound.get(entry.round) ?? { ...EMPTY_METRICS };
    current.ally_skill_damage += metrics.ally_skill_damage;
    current.ally_basic_damage += metrics.ally_basic_damage;
    current.ally_healing += metrics.ally_healing;
    current.enemy_damage += metrics.enemy_damage;
    entriesByRound.set(entry.round, current);
  }

  const cumulative = { ...EMPTY_METRICS };
  return [...entriesByRound.entries()]
    .toSorted(([left], [right]) => left - right)
    .map(([round, metrics]) => {
      cumulative.ally_skill_damage += metrics.ally_skill_damage;
      cumulative.ally_basic_damage += metrics.ally_basic_damage;
      cumulative.ally_healing += metrics.ally_healing;
      cumulative.enemy_damage += metrics.enemy_damage;
      return {
        round,
        metrics: {
          ...cumulative,
          ally_total_damage: cumulative.ally_skill_damage + cumulative.ally_basic_damage,
        },
      };
    });
}

export default function BattleRoundMetricsTable({ log }: { log: BattleLogRound[] }) {
  const rounds = useMemo(() => cumulativeMetricsByRound(log), [log]);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  if (rounds.length === 0) return null;

  const latest = rounds[rounds.length - 1];
  const selected = selectedRound == null
    ? latest
    : (rounds.find(({ round }) => round === selectedRound) ?? latest);

  return (
    <section aria-label="라운드별 누적 전투량">
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[38rem] border-collapse text-xs">
          <caption className="sr-only">선택한 라운드 기준 누적 전투량</caption>
          <thead>
            <tr className="bg-surface text-muted">
              <th colSpan={4} scope="colgroup" className="border-b border-line px-3 py-2 font-semibold">
                <div className="flex items-center justify-center gap-2">
                  <select
                    aria-label="누적 전투량 기준 라운드"
                    className="rounded-md border border-line bg-inset px-2 py-1 font-semibold text-ivory outline-none focus:border-gold"
                    value={selected.round}
                    onChange={(event) => {
                      const nextRound = Number(event.target.value);
                      setSelectedRound(nextRound === latest.round ? null : nextRound);
                    }}
                  >
                    {rounds.map(({ round }) => (
                      <option key={round} value={round}>{round}라운드</option>
                    ))}
                  </select>
                  <span>기준 누적 전투량</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {ALLY_DAMAGE_ROWS.map((row) => (
              <tr key={row.key} className="border-b border-line">
                <th
                  scope="row"
                  className={cn("w-[34%] border-r border-line px-3 py-2 text-left font-semibold", row.className)}
                >
                  {row.label}
                </th>
                <td className="w-[16%] border-r border-line bg-inset px-3 py-2 text-right font-num font-bold tabular-nums text-ivory">
                  {NUMBER_FORMATTER.format(selected.metrics[row.key])}
                </td>
                <td colSpan={2} aria-hidden="true" className="bg-inset" />
              </tr>
            ))}
            <tr>
              <th
                scope="row"
                className="w-[34%] border-r border-line bg-emerald-500/15 px-3 py-2 text-left font-semibold text-emerald-200"
              >
                아군 회복량
              </th>
              <td className="w-[16%] border-r border-line bg-inset px-3 py-2 text-right font-num font-bold tabular-nums text-ivory">
                {NUMBER_FORMATTER.format(selected.metrics.ally_healing)}
              </td>
              <th
                scope="row"
                className="w-[34%] border-r border-line bg-red-500/15 px-3 py-2 text-left font-semibold text-red-200"
              >
                적이 가한 피해량
              </th>
              <td className="w-[16%] bg-inset px-3 py-2 text-right font-num font-bold tabular-nums text-ivory">
                {NUMBER_FORMATTER.format(selected.metrics.enemy_damage)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
