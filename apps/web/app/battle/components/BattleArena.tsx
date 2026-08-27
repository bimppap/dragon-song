"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Ban, Heart, ListChecks, type LucideIcon, Skull, Sparkles, Swords, Undo2, UserPlus, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  fetchBattle,
  fetchCharacterDetail,
  fetchCharacters,
  joinBattle,
  submitBattleActions,
  undoLastBattleRound,
  type BattleCharacterActionInput,
  type BattleEnemyActionInput,
  type BattleParticipant,
  type BattleSession,
  type CharacterActionKind,
  type CharacterOwnedItem,
  type Character,
  type EnemyActionKind,
} from "@/lib/api";
import AlertBanner from "@/components/common/AlertBanner";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import { useDialog } from "@/components/common/DialogProvider";

const numberFormatter = new Intl.NumberFormat("ko-KR");
const fmt = (n: number) => numberFormatter.format(Math.max(0, Math.round(n)));

interface Props {
  sessionId: number;
  readOnly?: boolean;
  onExit: () => void;
}

interface CharDraft {
  kind: CharacterActionKind;
  target_enemy_id: number | null;
  target_character_id: number | null;
  item_id: number | null;
}

interface EnemyDraft {
  kind: EnemyActionKind;
  skill_index: number | null;
}

function defaultCharKind(faction: string | null): CharacterActionKind {
  if (faction === "수비") return "defend";
  if (faction === "치유") return "heal";
  return "attack";
}

function isActive(p: BattleParticipant): boolean {
  return !p.downed && !p.retreated;
}

/** 이번 라운드에 난입한 캐릭터는 행동할 수 없고, 공격/치유 대상도 될 수 없다. */
function isTargetable(p: BattleParticipant, currentRound: number): boolean {
  return isActive(p) && p.joined_round !== currentRound;
}

function HpBar({ hp, max, color }: { hp: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (hp / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-num w-20 shrink-0 text-right text-[11px] text-muted">
        {fmt(hp)}/{fmt(max)}
      </span>
    </div>
  );
}

function ResourceBar({
  icon: Icon,
  iconClassName,
  value,
  max,
  color,
}: {
  icon: LucideIcon;
  iconClassName?: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", iconClassName)} />
      <div className="relative h-[18px] flex-1 overflow-hidden rounded-full border border-line bg-white/10">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-num text-[10px] font-semibold text-ivory">
          {fmt(value)}/{fmt(max)}
        </span>
      </div>
    </div>
  );
}

const CHAR_ACTION_LABEL: Record<CharacterActionKind, string> = {
  attack: "공격",
  skill: "기술 사용",
  defend: "수비",
  heal: "치유",
  item: "아이템",
  none: "무반응",
  retreat: "퇴각",
};

function getCharacterCardTone(kind: CharacterActionKind | null | undefined) {
  switch (kind) {
    case "attack":
      return "border-rose-500/35 bg-rose-500/10";
    case "skill":
      return "border-amber-400/35 bg-amber-400/10";
    case "defend":
      return "border-sky-500/35 bg-sky-500/10";
    case "heal":
      return "border-emerald-500/35 bg-emerald-500/10";
    case "item":
      return "border-orange-500/40 bg-orange-500/12";
    case "retreat":
      return "border-slate-400/35 bg-slate-400/10";
    case "none":
    default:
      return "border-line bg-surface";
  }
}

export default function BattleArena({ sessionId, readOnly = false, onExit }: Props) {
  const { confirm } = useDialog();
  const [session, setSession] = useState<BattleSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [undoing, setUndoing] = useState(false);

  const [charDrafts, setCharDrafts] = useState<Record<number, CharDraft>>({});
  const [enemyDrafts, setEnemyDrafts] = useState<Record<number, EnemyDraft>>({});
  const [itemsByCharacter, setItemsByCharacter] = useState<Record<number, CharacterOwnedItem[]>>({});

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCandidates, setJoinCandidates] = useState<Character[]>([]);
  const [joinCharacterId, setJoinCharacterId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const data = await fetchBattle(sessionId);
        if (cancelled) return;
        setSession(data);
        resetDrafts(data);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "전투 조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sessionId]);

  // 관전(readOnly) 화면은 아무도 행동을 제출하지 않으므로, 라운드 진행 상황을 놓치지 않도록 주기적으로 다시 불러온다.
  useEffect(() => {
    if (!readOnly) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const data = await fetchBattle(sessionId);
        if (!cancelled) setSession(data);
      } catch {
        // 폴링 실패는 조용히 무시하고 다음 주기에 다시 시도한다.
      }
    }, 6000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [readOnly, sessionId]);

  function resetDrafts(data: BattleSession) {
    const nextChar: Record<number, CharDraft> = {};
    for (const p of data.participants) {
      if (!isTargetable(p, data.round)) continue;
      nextChar[p.character_id] = {
        kind: defaultCharKind(p.faction),
        target_enemy_id: data.enemies.find((e) => e.hp > 0)?.enemy_id ?? null,
        target_character_id: p.character_id,
        item_id: null,
      };
    }
    setCharDrafts(nextChar);

    const nextEnemy: Record<number, EnemyDraft> = {};
    for (const enemy of data.enemies) {
      if (enemy.hp <= 0) continue;
      const firstAttackIndex = enemy.skills.findIndex((s) => s.skill_type !== "소환");
      nextEnemy[enemy.enemy_id] = firstAttackIndex >= 0
        ? { kind: "attack", skill_index: firstAttackIndex }
        : { kind: "none", skill_index: null };
    }
    setEnemyDrafts(nextEnemy);
  }

  function patchChar(characterId: number, patch: Partial<CharDraft>) {
    setCharDrafts((prev) => ({ ...prev, [characterId]: { ...prev[characterId], ...patch } }));
  }

  function patchEnemy(enemyId: number, patch: Partial<EnemyDraft>) {
    setEnemyDrafts((prev) => ({ ...prev, [enemyId]: { ...prev[enemyId], ...patch } }));
  }

  async function ensureItemsLoaded(characterId: number) {
    if (itemsByCharacter[characterId]) return;
    try {
      const detail = await fetchCharacterDetail(characterId);
      setItemsByCharacter((prev) => ({
        ...prev,
        [characterId]: detail.owned_items.filter((i) => i.item_type === "consumable" && i.quantity > i.used_quantity),
      }));
    } catch {
      setItemsByCharacter((prev) => ({ ...prev, [characterId]: [] }));
    }
  }

  async function handleSubmitRound() {
    if (!session) return;
    const characterActions: BattleCharacterActionInput[] = Object.entries(charDrafts).map(([id, draft]) => ({
      character_id: Number(id),
      kind: draft.kind,
      target_enemy_id: draft.target_enemy_id ?? undefined,
      target_character_id: draft.target_character_id ?? undefined,
      item_id: draft.item_id ?? undefined,
    }));
    const enemyActions: BattleEnemyActionInput[] = Object.entries(enemyDrafts).map(([id, draft]) => ({
      enemy_id: Number(id),
      kind: draft.kind,
      skill_index: draft.skill_index ?? undefined,
    }));

    try {
      setSubmitting(true);
      const updated = await submitBattleActions(session.id, characterActions, enemyActions);
      setSession(updated);
      resetDrafts(updated);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "라운드 진행 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUndoRound() {
    if (!session || session.round <= 1) return;
    const ok = await confirm({
      title: "이전 라운드 다시 진행하기",
      description: `라운드 ${session.round - 1}의 로그가 사라지고, 그 라운드를 다시 진행할 수 있는 상태로 되돌립니다.`,
      confirmText: "되돌리기",
      tone: "danger",
    });
    if (!ok) return;
    try {
      setUndoing(true);
      const updated = await undoLastBattleRound(session.id);
      setSession(updated);
      resetDrafts(updated);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "라운드 되돌리기 실패");
    } finally {
      setUndoing(false);
    }
  }

  async function openJoin() {
    setJoinOpen(true);
    if (joinCandidates.length === 0) {
      try {
        const all = await fetchCharacters();
        setJoinCandidates(all);
      } catch {
        setJoinCandidates([]);
      }
    }
  }

  async function handleJoin() {
    if (!session || !joinCharacterId) return;
    try {
      setJoining(true);
      const updated = await joinBattle(session.id, Number(joinCharacterId));
      setSession(updated);
      resetDrafts(updated);
      setJoinOpen(false);
      setJoinCharacterId(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "난입 실패");
    } finally {
      setJoining(false);
    }
  }

  const joinOptions = useMemo(() => {
    const existingIds = new Set((session?.participants ?? []).map((p) => p.character_id));
    return joinCandidates
      .filter((c) => !existingIds.has(c.id))
      .map((c) => ({
        value: String(c.id),
        label: c.name,
        icon: <CharacterAvatar src={c.image_url} alt={c.name} className="size-5 rounded-full" iconSize={10} />,
      }));
  }, [joinCandidates, session]);

  if (loading || !session) {
    return (
      <div className="space-y-4">
        {error && <AlertBanner>{error}</AlertBanner>}
        <p className="text-sm text-muted">전투 정보를 불러오는 중입니다.</p>
      </div>
    );
  }

  const inProgress = session.status === "in_progress";
  const canAct = inProgress && !readOnly;
  const aliveEnemies = session.enemies.filter((e) => e.hp > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onExit} className="px-2">
            <ArrowLeft size={15} />
          </Button>
          <h2 className="text-lg font-bold text-ivory">
            {session.enemies.map((e) => e.name).join(", ")} 전투
          </h2>
          <Badge>{session.mode === "real" ? "실전" : "모의전"}</Badge>
          <Badge variant="outline">라운드 {session.round}</Badge>
        </div>
        {canAct && (
          <Button variant="outline" size="sm" onClick={openJoin}>
            <UserPlus size={14} />
            난입
          </Button>
        )}
      </div>

      {error && <AlertBanner>{error}</AlertBanner>}
      {readOnly && <AlertBanner tone="success">완료된 실전 전투 기록입니다. (읽기 전용)</AlertBanner>}

      {joinOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gold/40 bg-gold/5 p-3">
          <Combobox
            options={joinOptions}
            value={joinCharacterId}
            onChange={setJoinCharacterId}
            placeholder="난입할 캐릭터 선택"
            searchPlaceholder="캐릭터 이름 검색"
            className="w-56"
          />
          <Button size="sm" disabled={!joinCharacterId || joining} onClick={handleJoin}>
            {joining ? "처리 중..." : "난입 확정"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setJoinOpen(false)}>취소</Button>
          <p className="text-xs text-muted">난입한 캐릭터는 이번 라운드에는 공격/치유 대상이 되지 않습니다.</p>
        </div>
      )}

      {/* 에너미 */}
      <div className="space-y-2">
        {session.enemies.map((enemy) => {
          const dead = enemy.hp <= 0;
          const draft = enemyDrafts[enemy.enemy_id];
          const attackSkills = enemy.skills.map((s, i) => ({ ...s, index: i })).filter((s) => s.skill_type !== "소환");
          const summonSkills = enemy.skills.map((s, i) => ({ ...s, index: i })).filter((s) => s.skill_type === "소환");
          return (
            <div
              key={enemy.enemy_id}
              className={cn("rounded-xl border p-4", dead ? "border-line bg-primary-light/10 opacity-60" : "border-red-500/40 bg-red-500/10")}
            >
              <div className="mb-2 flex items-center gap-2">
                <Skull size={16} className={dead ? "text-muted" : "text-red-500"} />
                <span className="font-semibold text-ivory">{enemy.name}</span>
                {dead && <Badge variant="secondary">격파</Badge>}
                <span className="font-num text-xs text-muted">공격력 {enemy.attack}</span>
              </div>
              <HpBar hp={enemy.hp} max={enemy.max_hp} color="bg-red-500" />
              {canAct && !dead && draft && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted">행동</span>
                  <Select
                    value={draft.kind === "none" ? "none" : `${draft.kind}:${draft.skill_index}`}
                    onValueChange={(v) => {
                      if (v === "none") { patchEnemy(enemy.enemy_id, { kind: "none", skill_index: null }); return; }
                      const [kind, idx] = v.split(":");
                      patchEnemy(enemy.enemy_id, { kind: kind as EnemyActionKind, skill_index: Number(idx) });
                    }}
                  >
                    <SelectTrigger className="h-8 w-72 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">무반응</SelectItem>
                        {attackSkills.map((s) => (
                          <SelectItem key={s.index} value={`attack:${s.index}`}>
                            {s.skill_type} · {s.name} ({s.skill_type.startsWith("광역") ? "전체" : `${s.target_count}인`} / {s.damage_percent}%)
                          </SelectItem>
                        ))}
                        {summonSkills.map((s) => (
                          <SelectItem key={s.index} value={`summon:${s.index}`}>
                            소환 · {s.name} ({s.summon_name} x{s.summon_count ?? 1})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 공용 소환수 */}
      {session.summons.length > 0 && (
        <div className="rounded-xl border border-line bg-inset p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">소환수 (공격 우선 대상)</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {session.summons.map((s) => (
              <div key={s.id} className="rounded-lg border border-line bg-surface px-3 py-2">
                <p className="mb-1 text-sm font-semibold text-ivory">{s.name}</p>
                <HpBar hp={s.hp} max={s.max_hp} color="bg-orange-500" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 캐릭터 그리드 */}
      <div className="grid grid-cols-1 justify-items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {session.participants.map((p) => {
          const draft = charDrafts[p.character_id];
          const active = isActive(p);
          const items = itemsByCharacter[p.character_id] ?? [];
          const secondaryActionControl =
            draft && (draft.kind === "attack" || draft.kind === "skill") && aliveEnemies.length > 1 ? (
              <Select
                value={draft.target_enemy_id != null ? String(draft.target_enemy_id) : ""}
                onValueChange={(v) => patchChar(p.character_id, { target_enemy_id: Number(v) })}
              >
                <SelectTrigger className="h-8 w-full text-[11px]">
                  <SelectValue placeholder="대상 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {aliveEnemies.map((e) => (
                      <SelectItem key={e.enemy_id} value={String(e.enemy_id)}>{e.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : draft?.kind === "heal" ? (
              <Select
                value={draft.target_character_id != null ? String(draft.target_character_id) : ""}
                onValueChange={(v) => patchChar(p.character_id, { target_character_id: Number(v) })}
              >
                <SelectTrigger className="h-8 w-full text-[11px]">
                  <SelectValue placeholder="치유 대상 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {session.participants.filter((t) => isTargetable(t, session.round)).map((t) => (
                      <SelectItem key={t.character_id} value={String(t.character_id)}>{t.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : draft?.kind === "item" ? (
              <Select
                value={draft.item_id != null ? String(draft.item_id) : ""}
                onValueChange={(v) => patchChar(p.character_id, { item_id: Number(v) })}
              >
                <SelectTrigger className="h-8 w-full text-[11px]">
                  <SelectValue placeholder="아이템 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {items.length === 0 ? (
                      <SelectItem value="__none__" disabled>보유 아이템 없음</SelectItem>
                    ) : (
                      items.map((item) => (
                        <SelectItem key={item.item_id} value={String(item.item_id)}>
                          {item.item_name} ({item.quantity - item.used_quantity}개)
                        </SelectItem>
                      ))
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : null;

          return (
            <div
              key={p.character_id}
              className={cn(
                "w-full max-w-[21rem] rounded-2xl border p-2.5 transition-colors duration-200",
                !active
                  ? "border-line bg-primary-light/10 opacity-60"
                  : canAct
                    ? getCharacterCardTone(draft?.kind)
                    : "border-line bg-surface",
              )}
            >
              <div className="space-y-2.5">
                <div className="flex gap-2.5">
                  <div className="w-16 shrink-0 self-start overflow-hidden rounded-2xl border border-line bg-surface">
                    <CharacterAvatar
                      src={p.image_url}
                      alt={p.name}
                      className={cn("aspect-square w-full rounded-none", !active && "grayscale")}
                      iconSize={18}
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-2.5">
                    <p className="truncate text-sm font-semibold text-ivory">{p.name}</p>
                    <div className="space-y-1.5">
                      <ResourceBar
                        icon={Heart}
                        iconClassName="text-rose-500"
                        value={p.hp}
                        max={p.max_hp}
                        color="bg-rose-500"
                      />
                      <ResourceBar
                        icon={Zap}
                        iconClassName="text-sky-500"
                        value={p.mp}
                        max={p.max_mp}
                        color="bg-sky-500"
                      />
                    </div>

                    {(p.downed || p.retreated || (active && p.joined_round === session.round)) && (
                      <div className="flex flex-wrap gap-2">
                        {p.downed && <Badge variant="destructive" className="text-[10px]">전투불능</Badge>}
                        {p.retreated && <Badge variant="secondary" className="text-[10px]">퇴각</Badge>}
                        {active && p.joined_round === session.round && (
                          <Badge variant="outline" className="text-[10px]">난입 · 이번 라운드 행동 불가</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {canAct && active && draft && (
                  <div
                    className={cn(
                      "grid w-full gap-2",
                      secondaryActionControl
                        ? "grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-start"
                        : "grid-cols-1",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <ListChecks className="h-3.5 w-3.5 shrink-0 text-muted" />
                      <Select
                        value={draft.kind}
                        onValueChange={(kind: CharacterActionKind) => {
                          patchChar(p.character_id, { kind });
                          if (kind === "item") void ensureItemsLoaded(p.character_id);
                        }}
                      >
                        <SelectTrigger className="h-8 w-full text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {(Object.keys(CHAR_ACTION_LABEL) as CharacterActionKind[]).map((kind) => (
                              <SelectItem key={kind} value={kind}>{CHAR_ACTION_LABEL[kind]}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    {secondaryActionControl && <div className="min-w-0">{secondaryActionControl}</div>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 진행 / 결과 */}
      {!inProgress ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold",
            session.status === "victory"
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
              : "border-red-500/40 bg-red-500/15 text-red-600",
          )}
        >
          {session.status === "victory" ? <Swords size={16} /> : <Ban size={16} />}
          {session.status === "victory" ? "전투 승리! 에너미를 격파했습니다." : "전투 패배... 모든 캐릭터가 전투 불능/퇴각했습니다."}
        </div>
      ) : canAct ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSubmitRound} disabled={submitting || undoing}>
            <Sparkles size={15} />
            {submitting ? "진행 중..." : `라운드 ${session.round} 진행`}
          </Button>
          {session.mode === "real" && session.round > 1 && (
            <Button
              variant="outline"
              onClick={handleUndoRound}
              disabled={submitting || undoing}
            >
              <Undo2 size={15} />
              {undoing ? "되돌리는 중..." : "이전 라운드 다시 진행하기"}
            </Button>
          )}
        </div>
      ) : null}

      {/* 전투 로그 */}
      {session.log.length > 0 && (
        <div className="space-y-3 rounded-xl border border-line bg-inset p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">전투 로그</span>
          {[...session.log].reverse().map((entry) => (
            <div key={entry.round} className="space-y-1">
              <div className="text-xs font-bold text-ivory/85">라운드 {entry.round}</div>
              {entry.events.map((e, i) => (
                <div key={i} className="text-sm text-ivory/85">{e}</div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
