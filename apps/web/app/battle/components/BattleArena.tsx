"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Ban, Heart, Play, RotateCcw, Shield, Skull, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fetchCharacters, type Character, type Enemy } from "@/lib/api";

const numberFormatter = new Intl.NumberFormat("ko-KR");
const fmt = (n: number) => numberFormatter.format(Math.max(0, Math.round(n)));

interface Combatant {
  id: number;
  name: string;
  faction: string | null;
  // 공격 계열
  atk: number;
  atkP: number;
  dmgP: number;
  skillLv: number;
  skillEffTrue: number;
  skillEffFixed: number;
  skillCost: number;
  // 방어 계열
  def: number;
  defP: number;
  defEff: number;
  dmgR: number;
  // 치유 계열
  healEff: number;
  healEffP: number;
  skillTarget: number;
  overHeal: boolean;
  // 자원 / 상태
  attn: number;
  presence: number;
  hp: number;
  maxHp: number;
  shield: number;
  mp: number;
  maxMp: number;
  hpRegenTrue: number;
  hpRegenFixed: number;
  mpRegen: number;
  downed: boolean;
}

type CharActionKind = "attack" | "defend" | "heal";
interface CharAction {
  kind: CharActionKind;
  targetId: number | null; // 치유 대상
}
type EnemyAction = { kind: "attack"; skillIndex: number } | { kind: "none" };

interface Props {
  enemy: Enemy;
  onExit: () => void;
}

function enemyMaxHp(enemy: Enemy, party: Character[]): number {
  let hp = enemy.base_hp;
  for (const c of party) {
    if (c.faction === "공격") hp += enemy.hp_per_attacker;
    else if (c.faction === "수비") hp += enemy.hp_per_defender;
    else if (c.faction === "치유") hp += enemy.hp_per_healer;
  }
  return hp;
}

function toCombatant(c: Character): Combatant {
  const maxHp = Math.max(Math.round(c.hp_max * (1 + c.hp_max_p)), c.hp, 1);
  return {
    id: c.id,
    name: c.name,
    faction: c.faction,
    atk: c.atk,
    atkP: c.atk_p,
    dmgP: c.dmg_p,
    skillLv: c.skill_lv,
    skillEffTrue: c.skill_eff_true,
    skillEffFixed: c.skill_eff_fixed,
    skillCost: c.skill_cost,
    def: c.def,
    defP: c.def_p,
    defEff: c.def_eff,
    dmgR: c.dmg_r,
    healEff: c.heal_eff,
    healEffP: c.heal_eff_p,
    skillTarget: Math.max(1, c.skill_target || 1),
    overHeal: Boolean(c.over_heal),
    attn: c.attn,
    presence: c.presence,
    hp: c.hp > 0 ? Math.min(c.hp, maxHp) : maxHp,
    maxHp,
    shield: (c.sh || 0) + (c.start_sh || 0),
    mp: Math.min(c.mp, c.mp_max),
    maxMp: c.mp_max,
    hpRegenTrue: c.hp_regen_true,
    hpRegenFixed: c.hp_regen_fixed,
    mpRegen: c.mp_regen,
    downed: false,
  };
}

const skillCoef = (c: Combatant) => 1 + c.skillLv * c.skillEffFixed;
const effDef = (c: Combatant) => Math.round(c.def * (1 + c.defP) * c.defEff);

function HpBar({ hp, max, color }: { hp: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (hp / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-num w-24 shrink-0 text-right text-xs text-slate-500">
        {fmt(hp)} / {fmt(max)}
      </span>
    </div>
  );
}

export default function BattleArena({ enemy, onExit }: Props) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [started, setStarted] = useState(false);
  const [combatants, setCombatants] = useState<Combatant[]>([]);
  const [enemyHp, setEnemyHp] = useState(0);
  const [enemyMax, setEnemyMax] = useState(0);
  const [round, setRound] = useState(1);
  const [charActions, setCharActions] = useState<Record<number, CharAction>>({});
  const [enemyAction, setEnemyAction] = useState<EnemyAction>({ kind: "none" });
  const [log, setLog] = useState<{ round: number; events: string[] }[]>([]);
  const [result, setResult] = useState<"victory" | "defeat" | null>(null);

  const attackSkills = useMemo(() => enemy.skills.filter((s) => s.skill_type !== "소환"), [enemy]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCharacters()
      .then((list) => { if (!cancelled) setCharacters(list); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "캐릭터 조회 실패"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selectedParty = characters.filter((c) => selectedIds.has(c.id));
  const previewEnemyHp = enemyMaxHp(enemy, selectedParty);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function defaultCharActions(list: Combatant[]): Record<number, CharAction> {
    return Object.fromEntries(
      list.filter((c) => !c.downed).map((c) => [c.id, { kind: "attack", targetId: null } as CharAction]),
    );
  }

  function startBattle() {
    const party = selectedParty.map(toCombatant);
    const max = enemyMaxHp(enemy, selectedParty);
    setCombatants(party);
    setEnemyMax(max);
    setEnemyHp(max);
    setRound(1);
    setCharActions(defaultCharActions(party));
    setEnemyAction(attackSkills.length > 0 ? { kind: "attack", skillIndex: 0 } : { kind: "none" });
    setLog([]);
    setResult(null);
    setStarted(true);
  }

  function setAction(id: number, patch: Partial<CharAction>) {
    setCharActions((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function resolveRound() {
    const events: string[] = [];
    const next = combatants.map((c) => ({ ...c }));
    const byId = new Map(next.map((c) => [c.id, c]));
    const living = next.filter((c) => !c.downed);
    const defending = new Set<number>();

    // 0) 라운드 시작: 체력·마나 재생
    for (const c of living) {
      const hpHeal = c.hpRegenTrue + Math.round(c.maxHp * c.hpRegenFixed);
      const mpHeal = c.mpRegen;
      if (hpHeal > 0) c.hp = Math.min(c.maxHp, c.hp + hpHeal);
      if (mpHeal > 0) c.mp = Math.min(c.maxMp, c.mp + mpHeal);
      if (hpHeal > 0 || mpHeal > 0) {
        events.push(`♻️ ${c.name} 재생 (+${fmt(hpHeal)} HP / +${fmt(mpHeal)} MP)`);
      }
    }

    // 1) 수비 태세
    for (const c of living) {
      if (charActions[c.id]?.kind === "defend") {
        defending.add(c.id);
        events.push(`🛡️ ${c.name} 수비 태세 (방어력 ${fmt(effDef(c))} 경감)`);
      }
    }

    // 2) 캐릭터 공격
    let newEnemyHp = enemyHp;
    for (const c of living) {
      if (charActions[c.id]?.kind !== "attack") continue;
      const hasMana = c.mp >= c.skillCost;
      const manaCoef = hasMana ? 1 : 0.5;
      if (hasMana) c.mp -= c.skillCost;
      const raw = (c.atk * (1 + c.atkP) + c.skillEffTrue) * (1 + c.dmgP) * skillCoef(c) * manaCoef;
      const dmg = Math.max(0, Math.round(raw));
      const dealt = Math.min(dmg, newEnemyHp);
      newEnemyHp = Math.max(0, newEnemyHp - dmg);
      events.push(
        `⚔️ ${c.name} 공격: ${fmt(dealt)} 피해${hasMana ? "" : "(마나 부족·위력↓)"} · ${enemy.name} [${fmt(newEnemyHp)}/${fmt(enemyMax)}]`,
      );
      if (newEnemyHp <= 0) break;
    }

    // 3) 치유
    for (const c of living) {
      const a = charActions[c.id];
      if (a?.kind !== "heal") continue;
      const hasMana = c.mp >= c.skillCost;
      const manaCoef = hasMana ? 1 : 0.5;
      if (hasMana) c.mp -= c.skillCost;
      const heal = Math.max(0, Math.round((c.healEff + c.skillEffTrue) * (1 + c.healEffP) * skillCoef(c) * manaCoef));

      // 대상: 지정 대상 + 체력 낮은 아군 (기술 대상 수만큼)
      const chosen = a.targetId != null ? byId.get(a.targetId) : undefined;
      const targets: Combatant[] = [];
      if (chosen && !chosen.downed) targets.push(chosen);
      const extras = next
        .filter((t) => !t.downed && !targets.includes(t))
        .sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp);
      for (const t of extras) {
        if (targets.length >= c.skillTarget) break;
        targets.push(t);
      }
      for (const t of targets) {
        const cap = t.overHeal ? Number.MAX_SAFE_INTEGER : t.maxHp;
        const before = t.hp;
        t.hp = Math.min(cap, t.hp + heal);
        events.push(`💚 ${c.name} → ${t.name} ${fmt(t.hp - before)} 치유 · ${t.name} [${fmt(before)}→${fmt(t.hp)}/${fmt(t.maxHp)}]`);
      }
    }

    // 4) 에너미 격파 판정
    if (newEnemyHp <= 0) {
      events.push(`🎉 ${enemy.name} 격파! 전투 승리`);
      commit(next, 0, events, "victory");
      return;
    }

    // 5) 에너미 행동
    if (enemyAction.kind === "attack") {
      const skill = attackSkills[enemyAction.skillIndex];
      if (skill) {
        const livingNow = next.filter((c) => !c.downed);
        const targets = skill.skill_type.startsWith("광역")
          ? livingNow
          : [...livingNow]
              .sort((a, b) => b.attn + b.presence - (a.attn + a.presence))
              .slice(0, Math.max(1, skill.target_count));
        const base = Math.round((enemy.attack * skill.damage_percent) / 100);
        for (const t of targets) {
          let dmg = Math.round(base * (1 - t.dmgR));
          if (defending.has(t.id)) dmg = Math.max(0, dmg - effDef(t));
          const absorbed = Math.min(t.shield, dmg);
          t.shield -= absorbed;
          dmg -= absorbed;
          t.hp = Math.max(0, t.hp - dmg);
          events.push(
            `🔥 ${enemy.name}의 ${skill.name} → ${t.name} ${fmt(dmg)} 피해${absorbed > 0 ? `(보호막 ${fmt(absorbed)} 흡수)` : ""} · ${t.name} [${fmt(t.hp)}/${fmt(t.maxHp)}]`,
          );
          if (t.hp === 0 && !t.downed) {
            t.downed = true;
            events.push(`💀 ${t.name} 전투불능`);
          }
        }
      }
    } else {
      events.push(`💤 ${enemy.name} 무반응`);
    }

    const anyAlive = next.some((c) => !c.downed);
    commit(next, newEnemyHp, events, anyAlive ? null : "defeat");
  }

  function commit(
    nextCombatants: Combatant[],
    nextEnemyHp: number,
    events: string[],
    nextResult: "victory" | "defeat" | null,
  ) {
    setCombatants(nextCombatants);
    setEnemyHp(nextEnemyHp);
    setLog((prev) => [...prev, { round, events }]);
    if (nextResult) {
      setResult(nextResult);
    } else {
      setRound((r) => r + 1);
      setCharActions(defaultCharActions(nextCombatants));
      setEnemyAction(attackSkills.length > 0 ? { kind: "attack", skillIndex: 0 } : { kind: "none" });
    }
  }

  function reset() {
    setStarted(false);
    setResult(null);
    setLog([]);
  }

  const livingCombatants = combatants.filter((c) => !c.downed);

  // ── 셋업 화면 ──────────────────────────────────────────────
  if (!started) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onExit} className="px-2">
              <ArrowLeft size={15} />
            </Button>
            <h2 className="text-lg font-bold text-slate-800">{enemy.name} 전투 준비</h2>
          </div>
          <Badge variant="outline" className="font-num">
            에너미 예상 HP {fmt(previewEnemyHp)}
          </Badge>
        </div>

        <p className="text-sm text-slate-500">전투에 참여할 캐릭터를 선택하세요. 진영 구성에 따라 에너미 체력이 증가합니다.</p>

        {loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{loadError}</div>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">캐릭터 목록을 불러오는 중...</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {characters.map((c) => {
              const checked = selectedIds.has(c.id);
              return (
                <label
                  key={c.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                    checked ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleSelect(c.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-slate-800">{c.name}</span>
                      {c.faction && <Badge variant="secondary" className="text-[10px]">{c.faction}</Badge>}
                    </div>
                    <div className="font-num mt-0.5 flex gap-3 text-xs text-slate-500">
                      <span>공 {c.atk}</span>
                      <span>방 {c.def}</span>
                      <span>HP {Math.max(Math.round(c.hp_max * (1 + c.hp_max_p)), c.hp, 1)}</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <Button onClick={startBattle} disabled={selectedParty.length === 0}>
          <Play size={15} />
          전투 개시 ({selectedParty.length}명)
        </Button>
      </div>
    );
  }

  // ── 전투 화면 ──────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onExit} className="px-2">
            <ArrowLeft size={15} />
          </Button>
          <h2 className="text-lg font-bold text-slate-800">{enemy.name} 전투</h2>
          <Badge>라운드 {round}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw size={14} />
          다시 편성
        </Button>
      </div>

      {/* 에너미 */}
      <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Skull size={16} className="text-red-500" />
          <span className="font-semibold text-slate-800">{enemy.name}</span>
          <span className="font-num text-xs text-slate-500">공격력 {enemy.attack}</span>
        </div>
        <HpBar hp={enemyHp} max={enemyMax} color="bg-red-500" />
        {!result && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">에너미 행동</span>
            <Select
              value={enemyAction.kind === "attack" ? String(enemyAction.skillIndex) : "none"}
              onValueChange={(v) =>
                setEnemyAction(v === "none" ? { kind: "none" } : { kind: "attack", skillIndex: Number(v) })
              }
            >
              <SelectTrigger className="h-8 w-64 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">무반응</SelectItem>
                  {attackSkills.map((s, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {s.skill_type} · {s.name} ({s.skill_type.startsWith("광역") ? "전체" : `${s.target_count}인`} / {s.damage_percent}%)
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* 캐릭터 행동 지정 */}
      <div className="space-y-2">
        {combatants.map((c) => {
          const action = charActions[c.id];
          return (
            <div
              key={c.id}
              className={cn(
                "rounded-xl border px-4 py-3",
                c.downed ? "border-slate-200 bg-slate-100 opacity-60" : "border-slate-200 bg-white",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800">{c.name}</span>
                  {c.faction && <Badge variant="secondary" className="text-[10px]">{c.faction}</Badge>}
                  {c.downed && <Badge variant="destructive" className="text-[10px]">전투불능</Badge>}
                  <span className="font-num text-xs text-slate-400">
                    공 {c.atk} · 방 {c.def} · 주목 {c.attn}
                    {c.maxMp > 0 && ` · 마나 ${fmt(c.mp)}/${fmt(c.maxMp)}`}
                    {c.shield > 0 && ` · 보호막 ${fmt(c.shield)}`}
                  </span>
                </div>
              </div>
              <div className="mt-2">
                <HpBar hp={c.hp} max={c.maxHp} color="bg-emerald-500" />
              </div>
              {!c.downed && !result && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {(["attack", "defend", "heal"] as CharActionKind[]).map((kind) => {
                    const meta = {
                      attack: { label: "공격", icon: Swords },
                      defend: { label: "수비", icon: Shield },
                      heal: { label: "치유", icon: Heart },
                    }[kind];
                    const Icon = meta.icon;
                    const active = action?.kind === kind;
                    return (
                      <Button
                        key={kind}
                        size="sm"
                        variant={active ? "default" : "outline"}
                        onClick={() => setAction(c.id, { kind, targetId: kind === "heal" ? (action?.targetId ?? c.id) : null })}
                        className="h-8"
                      >
                        <Icon size={13} />
                        {meta.label}
                      </Button>
                    );
                  })}
                  {action?.kind === "heal" && (
                    <Select
                      value={action.targetId != null ? String(action.targetId) : ""}
                      onValueChange={(v) => setAction(c.id, { kind: "heal", targetId: Number(v) })}
                    >
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue placeholder="치유 대상 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {livingCombatants.map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 진행 / 결과 */}
      {result ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold",
            result === "victory"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-600",
          )}
        >
          {result === "victory" ? <Swords size={16} /> : <Ban size={16} />}
          {result === "victory" ? "전투 승리! 에너미를 격파했습니다." : "전투 패배... 모든 캐릭터가 쓰러졌습니다."}
        </div>
      ) : (
        <Button onClick={resolveRound}>
          <Play size={15} />
          라운드 {round} 진행
        </Button>
      )}

      {/* 전투 로그 */}
      {log.length > 0 && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">전투 로그</span>
          {[...log].reverse().map((entry) => (
            <div key={entry.round} className="space-y-1">
              <div className="text-xs font-bold text-slate-600">라운드 {entry.round}</div>
              {entry.events.map((e, i) => (
                <div key={i} className="text-sm text-slate-600">{e}</div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
