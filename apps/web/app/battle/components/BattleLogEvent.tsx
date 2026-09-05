"use client";

import { Fragment } from "react";
import InfoTooltip from "@/components/common/InfoTooltip";
import { cn } from "@/lib/utils";
import type { BattleSession } from "@/lib/api";

const NUMBER_PATTERN = /[+-]?\d[\d,]*(?:\.\d+)?%?/g;

type NumberKind = "damage" | "healing" | "resource" | "shield" | "stack" | "health" | "attn" | "regen" | "default";

function numberKind(event: string, start: number, end: number): NumberKind {
  const suffix = event.slice(end, Math.min(event.length, end + 8));
  if (event.startsWith("♻️") && /^\s*(?:HP|MP)/i.test(suffix)) return "regen";
  if (/^\s*(?:피해|반격 피해)/.test(suffix)) return "damage";
  if (/^\s*(?:치유|회복)/.test(suffix)) return "healing";
  if (/^\s*(?:HP)/i.test(suffix)) return "health";
  if (/^\s*(?:MP|마나)/i.test(suffix)) return "resource";
  if (/^\s*스택/.test(suffix)) return "stack";
  if (/^\s*(?:흡수|보호막)/.test(suffix)) return "shield";
  if (/^\s*주목도/.test(suffix)) return "attn";
  // "주목도 3 이전 / 7 획득"처럼 이름표가 앞에 오는 주목도 이동량
  if (/^\s*(?:이전|획득)/.test(suffix)) return "attn";

  const insideStatus = event.lastIndexOf("[", start) > event.lastIndexOf("]", start);
  if (insideStatus) return "health";

  const nearby = event.slice(Math.max(0, start - 12), Math.min(event.length, end + 12));
  if (/MP|마나/.test(nearby)) return "resource";
  if (/보호막/.test(nearby)) return "shield";
  if (/스택/.test(nearby)) return "stack";
  if (/치유|회복|재생|부활/.test(event)) return "healing";
  if (/피해|공격|반격|오버킬/.test(event)) return "damage";
  return "default";
}

function decimal(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function formulaFor(
  event: string,
  kind: NumberKind,
  session: Pick<BattleSession, "enemies" | "participants">,
  previousEvent?: string,
): string | null {
  if (kind === "damage" && event.includes("예상 피해") && previousEvent) {
    const action = previousEvent.match(/^🔮\s+(.+?)\s+-\s+(.+)$/);
    const enemy = action ? session.enemies.find((candidate) => candidate.name === action[1]) : undefined;
    const skill = enemy?.skills.find((candidate) => candidate.name === action?.[2]);
    if (enemy && skill) {
      return `floor(공격력 ${enemy.attack} × 기술 피해율 ${decimal(skill.damage_percent / 100)})`;
    }
  }

  if (kind === "regen" && event.includes("재생")) {
    const actorName = event.match(/^♻️\s+(.+?)\s+재생/)?.[1];
    const actor = session.participants.find((candidate) => candidate.name === actorName);
    if (actor) {
      return `고정 체력 재생 ${actor.hp_regen_true} + floor(최대 체력 ${actor.max_hp} × 비율 체력 재생 ${decimal(actor.hp_regen_fixed)})`;
    }
  }

  if (kind === "healing" && event.includes("구조")) {
    const targetName = event.match(/→\s+(.+?)\s+구조/)?.[1];
    const target = session.participants.find((candidate) => candidate.name === targetName);
    if (target) return `max(최소 부활 체력 1, floor(최대 체력 ${target.max_hp} × 부활 비율 0.1))`;
  }

  if (kind === "healing" && event.startsWith("💚") && !event.includes("의 ")) {
    const names = event.match(/^💚\s+(.+?)\s+→\s+(.+?)\s+[+-]?\d/);
    const healer = session.participants.find((candidate) => candidate.name === names?.[1]);
    const target = session.participants.find((candidate) => candidate.name === names?.[2]);
    if (healer && target) {
      return `floor(기본 치유 비율 0.25 × 최대 체력 ${target.max_hp} × (1 + 치유 효율 ${decimal(healer.heal_eff)}))`;
    }
  }

  return null;
}

function shouldShowFormula(event: string, value: string, kind: NumberKind): boolean {
  if (kind === "health") return false;
  if (kind !== "resource") return true;
  return !value.startsWith("-") && !/(?:마나|MP).*?(?:소모|비용)/i.test(event);
}

function isCalculatedResultNumber(
  event: string,
  start: number,
  end: number,
  value: string,
  kind: NumberKind,
): boolean {
  const suffix = event.slice(end, Math.min(event.length, end + 10));
  // 격려처럼 "피해 증폭 +20%" 형태로 끝나는 버프 수치도 계산식을 붙인다.
  if (value.endsWith("%") && /(?:증폭|감소|효율|확률)\s*$/.test(event.slice(0, start))) return true;
  // 환경 피해처럼 "피해 6 [94/100]" 형태로 이름표가 숫자 앞에 오는 경우도 계산 결과로 본다.
  if (kind === "damage" && /(?:^|\s)피해\s$/.test(event.slice(0, start))) return true;
  if (kind === "damage") return /^\s*(?:피해|반격 피해|지속 피해)/.test(suffix);
  if (kind === "healing") return /^\s*(?:치유|회복)/.test(suffix);
  if (kind === "attn") return /^\s*(?:주목도|이전|획득)/.test(suffix);
  if (kind === "regen") return true;
  return false;
}

const NUMBER_CLASS: Record<NumberKind, string> = {
  damage: "text-red-300",
  healing: "text-emerald-300",
  resource: "text-sky-300",
  shield: "text-cyan-300",
  stack: "text-purple-300",
  health: "text-amber-200",
  attn: "text-gold",
  regen: "text-emerald-300",
  default: "text-gold",
};

export default function BattleLogEvent({
  event,
  previousEvent,
  session,
  calculation,
  showFormula,
}: {
  event: string;
  previousEvent?: string;
  session: Pick<BattleSession, "enemies" | "participants">;
  calculation?: string | string[];
  showFormula: boolean;
}) {
  // 이미 저장된 환경 로그도 현재 표시 형식에 맞춘다.
  if (event.startsWith("🌫️ 환경 ·")) event = event.replace(/ 스택 (?=[+]\d+\s*$)/, " ");
  else if (/^\s*→/.test(event)) event = event.replace(/ 스택 \d+(?= · \d[\d,]* 피해 \[)/, "");
  const matches = [...event.matchAll(NUMBER_PATTERN)];
  if (matches.length === 0) return event;

  const calculationList = calculation == null ? null : Array.isArray(calculation) ? calculation : [calculation];
  let calculationIndex = 0;
  let cursor = 0;
  return matches.map((match, index) => {
    const start = match.index;
    const value = match[0];
    const end = start + value.length;
    const kind = numberKind(event, start, end);
    const isCalcNumber = isCalculatedResultNumber(event, start, end, value, kind);
    const storedCalculation = isCalcNumber && calculationList
      ? calculationList[Math.min(calculationIndex, calculationList.length - 1)]
      : null;
    if (isCalcNumber) calculationIndex += 1;
    const formula = showFormula && shouldShowFormula(event, value, kind)
      ? storedCalculation ?? formulaFor(event, kind, session, previousEvent)
      : null;
    const hasFormulaTooltip = formula !== null;
    const number = (
      <span
        className={cn("font-num font-bold tabular-nums", NUMBER_CLASS[kind], hasFormulaTooltip && "cursor-help")}
        tabIndex={hasFormulaTooltip ? 0 : undefined}
      >
        {value}
      </span>
    );
    const result = (
      <Fragment key={`${start}-${value}`}>
        {event.slice(cursor, start)}
        {hasFormulaTooltip ? (
          <InfoTooltip content={<span className="block max-w-72 leading-relaxed">{formula}</span>}>
            {number}
          </InfoTooltip>
        ) : number}
      </Fragment>
    );
    cursor = end;
    if (index === matches.length - 1) {
      return <Fragment key={`${start}-${value}`}>{result}{event.slice(end)}</Fragment>;
    }
    return result;
  });
}
