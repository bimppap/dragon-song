"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Ban, Eye, Heart, HeartPulse, ListChecks, Package, Shield, type LucideIcon, Megaphone, Skull, Sparkles, Swords, TrendingDown, TrendingUp, Undo2, UserPlus, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  fetchCharacterSkillTree,
  fetchCharacters,
  fetchEnemies,
  joinBattle,
  joinBattleEnemy,
  submitBattleAllyTurn,
  submitBattleEnemyTurn,
  submitBattleTelegraph,
  terminateBattle,
  undoLastBattleRound,
  type BattleCharacterActionInput,
  type BattleEnemyActionInput,
  type BattleEnemyState,
  type BattleParticipant,
  type BattleSession,
  type CharacterSkillNode,
  type CharacterSkillTree,
  type CharacterActionKind,
  type CharacterOwnedItem,
  type Character,
  type Enemy,
  type EnemyActionKind,
  type SkillBook,
} from "@/lib/api";
import AlertBanner from "@/components/common/AlertBanner";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import { useDialog } from "@/components/common/DialogProvider";
import { useToast } from "@/components/common/ToastProvider";

const numberFormatter = new Intl.NumberFormat("ko-KR");
const fmt = (n: number) => numberFormatter.format(Math.max(0, Math.round(n)));

interface Props {
  sessionId: number;
  readOnly?: boolean;
  onExit: () => void;
}

interface CharDraft {
  kind: CharacterActionKind;
  skill_node_id: number | null;
  target_enemy_id: number | null;
  target_character_id: number | null; // 치유/구조 지정 대상
  protect_target_character_id: number | null; // 방어(수비 포지션 한정) 시 대신 맞아줄 대상
  item_id: number | null;
}

interface TelegraphDraft {
  kind: EnemyActionKind;
  skill_index: number | null;
  target_character_ids: number[];
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

/** 치유 대상은 기절한 캐릭터도 포함한다(퇴각/난입 캐릭터만 제외). */
function isHealable(p: BattleParticipant, currentRound: number): boolean {
  return !p.retreated && p.joined_round !== currentRound;
}

function isEnemyTargetable(enemy: BattleSession["enemies"][number], currentRound: number): boolean {
  return enemy.hp > 0 && enemy.joined_round !== currentRound;
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
  defend: "방어",
  heal: "치유",
  rescue: "구조",
  item: "아이템",
  none: "무반응",
  retreat: "퇴각",
};

// "전원 행동 변경" 일괄 적용은 대상 지정이 필요 없거나 포지션 제한이 없는 행동만 제공한다.
const BULK_ACTION_KINDS: CharacterActionKind[] = ["attack", "skill", "defend", "item", "none", "retreat"];

const PHASE_LABEL: Record<BattleSession["phase"], string> = {
  telegraph: "적의 행동 암시",
  ally: "아군 턴",
  enemy: "에너미 턴",
};

const BATTLE_SKILL_BOOKS: SkillBook[] = ["용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"];
const SELF_TARGET_SKILL_NAMES = new Set(["모루", "불굴"]);
const SINGLE_ENEMY_SKILL_NAMES = new Set(["강타", "격류", "위해"]);
const MULTI_ENEMY_SKILL_NAMES = new Set(["분쇄", "파괴"]);
const SINGLE_ALLY_SKILL_NAMES = new Set(["반격", "보호", "수호", "회복", "생명", "정화", "승화"]);
const MULTI_ALLY_SKILL_NAMES = new Set(["구호"]);

type BattleSkillTargetMode = "enemy-single" | "enemy-multi" | "ally-single" | "ally-multi" | "self" | "none";

function pickBattleSkillsFromTrees(trees: CharacterSkillTree[]): CharacterSkillNode[] {
  return trees.flatMap((tree) => {
    const unlocked = tree.nodes
      .filter((node) => node.is_public && node.unlocked && node.tier > 0)
      .toSorted((a, b) => {
        if (a.tier !== b.tier) return b.tier - a.tier;
        return (b.unlocked_at ?? "").localeCompare(a.unlocked_at ?? "");
      });
    return unlocked[0] ? [unlocked[0]] : [];
  });
}

function getBattleSkillTargetMode(skill: CharacterSkillNode): BattleSkillTargetMode {
  if (SELF_TARGET_SKILL_NAMES.has(skill.default_name) || skill.target === "SELF") return "self";
  if (MULTI_ALLY_SKILL_NAMES.has(skill.default_name)) return "ally-multi";
  if (MULTI_ENEMY_SKILL_NAMES.has(skill.default_name) || (skill.category === "피해" && skill.target === "1 + N")) {
    return "enemy-multi";
  }
  if (
    SINGLE_ENEMY_SKILL_NAMES.has(skill.default_name)
    || (skill.category === "피해" && skill.target === "1")
  ) {
    return "enemy-single";
  }
  if (
    SINGLE_ALLY_SKILL_NAMES.has(skill.default_name)
    || skill.category === "회복"
    || skill.category === "강화"
  ) {
    return "ally-single";
  }
  return "none";
}

function firstBattleSkillId(skills: CharacterSkillNode[]) {
  return skills[0]?.id ?? null;
}

function battleSkillCost(skill: CharacterSkillNode, p: BattleParticipant): number {
  return Math.max(0, Math.floor((skill.cost ?? 0) + p.skill_cost));
}

function affordableBattleSkills(skills: CharacterSkillNode[], p: BattleParticipant): CharacterSkillNode[] {
  return skills.filter((skill) => p.mp >= battleSkillCost(skill, p));
}

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
    case "rescue":
      return "border-fuchsia-500/35 bg-fuchsia-500/10";
    case "item":
      return "border-orange-500/40 bg-orange-500/12";
    case "retreat":
      return "border-slate-400/35 bg-slate-400/10";
    case "none":
    default:
      return "border-line bg-surface";
  }
}

function allowedKinds(p: BattleParticipant, hasDowned: boolean, hasBattleSkills: boolean): CharacterActionKind[] {
  return (Object.keys(CHAR_ACTION_LABEL) as CharacterActionKind[]).filter((kind) => {
    if (kind === "skill") return hasBattleSkills;
    if (kind === "heal") return p.faction === "치유";
    if (kind === "rescue") return hasDowned;
    return true;
  });
}

/** 에너미가 이번 라운드에 예고한 행동을 사람이 읽을 수 있는 문구로 만든다. */
function describePendingAction(
  enemy: BattleEnemyState,
  pending: BattleSession["pending_enemy_actions"][number] | undefined,
  participantsById: Map<number, BattleParticipant>,
): string | null {
  if (!pending) return null;
  if (pending.kind === "none" || pending.skill_index == null) return "예고: 무반응";
  const skill = enemy.skills[pending.skill_index];
  if (!skill) return null;
  if (pending.kind === "summon") {
    return `예고: ${skill.name} (소환 · ${skill.summon_name ?? "???"} x${skill.summon_count ?? 1})`;
  }
  const isAoe = skill.skill_type.startsWith("광역");
  const targetLabel = isAoe
    ? "전원"
    : pending.target_character_ids
        .map((id) => participantsById.get(id)?.name)
        .filter((name): name is string => Boolean(name))
        .join(", ") || "대상 없음";
  const base = Math.floor((enemy.attack * skill.damage_percent) / 100);
  return `예고: ${skill.name} → ${targetLabel} (예상 피해 ${fmt(base)})`;
}

export default function BattleArena({ sessionId, readOnly = false, onExit }: Props) {
  const { confirm } = useDialog();
  const { toast } = useToast();
  const [session, setSession] = useState<BattleSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [terminating, setTerminating] = useState(false);

  const [charDrafts, setCharDrafts] = useState<Record<number, CharDraft>>({});
  const [bulkActionKind, setBulkActionKind] = useState<CharacterActionKind>("attack");
  const [telegraphDrafts, setTelegraphDrafts] = useState<Record<number, TelegraphDraft>>({});
  const [itemsByCharacter, setItemsByCharacter] = useState<Record<number, CharacterOwnedItem[]>>({});
  const [skillsByCharacter, setSkillsByCharacter] = useState<Record<number, CharacterSkillNode[]>>({});

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCandidates, setJoinCandidates] = useState<Character[]>([]);
  const [joinCharacterId, setJoinCharacterId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [enemyJoinOpen, setEnemyJoinOpen] = useState(false);
  const [enemyJoinCandidates, setEnemyJoinCandidates] = useState<Enemy[]>([]);
  const [joinEnemyId, setJoinEnemyId] = useState<string | null>(null);
  const [joiningEnemy, setJoiningEnemy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const data = await fetchBattle(sessionId);
        if (cancelled) return;
        setSession(data);
        resetCharDrafts(data);
        resetTelegraphDrafts(data);
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : "전투 조회 실패", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sessionId, toast]);

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

  useEffect(() => {
    if (readOnly || !session || session.status !== "in_progress") return;
    const missingIds = session.participants
      .map((participant) => participant.character_id)
      .filter((characterId) => skillsByCharacter[characterId] == null);
    if (missingIds.length === 0) return;

    let cancelled = false;

    async function loadSkills() {
      const loaded = await Promise.all(missingIds.map(async (characterId) => {
        try {
          const trees = await Promise.all(
            BATTLE_SKILL_BOOKS.map((book) => fetchCharacterSkillTree(characterId, book)),
          );
          return [characterId, pickBattleSkillsFromTrees(trees)] as const;
        } catch {
          return [characterId, []] as const;
        }
      }));
      if (cancelled) return;
      setSkillsByCharacter((prev) => ({
        ...prev,
        ...Object.fromEntries(loaded),
      }));
    }

    void loadSkills();
    return () => { cancelled = true; };
  }, [readOnly, session, skillsByCharacter]);

  useEffect(() => {
    function syncCharDraftsWithSkills() {
      if (!session) return;
      const hasDowned = session.participants.some((participant) => participant.downed);
      setCharDrafts((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const participant of session.participants) {
        if (!isTargetable(participant, session.round)) continue;
        const draft = next[participant.character_id];
        if (!draft) continue;
        const battleSkills = skillsByCharacter[participant.character_id];
        if (battleSkills == null) continue;
        const hasBattleSkills = battleSkills.length > 0;
        const kinds = allowedKinds(participant, hasDowned, hasBattleSkills);
        if (!kinds.includes(draft.kind)) {
          next[participant.character_id] = {
            ...draft,
            kind: defaultCharKind(participant.faction),
            skill_node_id: firstBattleSkillId(affordableBattleSkills(battleSkills, participant)),
          };
          changed = true;
          continue;
        }
        if (draft.kind !== "skill") continue;
        const affordable = affordableBattleSkills(battleSkills, participant);
        if (affordable.length === 0) {
          next[participant.character_id] = {
            ...draft,
            kind: defaultCharKind(participant.faction),
            skill_node_id: null,
          };
          changed = true;
          continue;
        }
        const selectedExists = affordable.some((skill) => skill.id === draft.skill_node_id);
        const defaultSkillId = firstBattleSkillId(affordable);
        if (!selectedExists && draft.skill_node_id !== defaultSkillId) {
          next[participant.character_id] = { ...draft, skill_node_id: defaultSkillId };
          changed = true;
        }
        }
        return changed ? next : prev;
      });
    }
    syncCharDraftsWithSkills();
  }, [session, skillsByCharacter]);

  function resetCharDrafts(data: BattleSession) {
    const next: Record<number, CharDraft> = {};
    for (const p of data.participants) {
      if (!isTargetable(p, data.round)) continue;
      const battleSkills = skillsByCharacter[p.character_id] ?? [];
      next[p.character_id] = {
        kind: defaultCharKind(p.faction),
        skill_node_id: firstBattleSkillId(affordableBattleSkills(battleSkills, p)),
        target_enemy_id: data.enemies.find((enemy) => isEnemyTargetable(enemy, data.round))?.enemy_id ?? null,
        target_character_id: p.character_id,
        protect_target_character_id: p.character_id,
        item_id: null,
      };
    }
    setCharDrafts(next);
  }

  function resetTelegraphDrafts(data: BattleSession) {
    const next: Record<number, TelegraphDraft> = {};
    for (const enemy of data.enemies) {
      if (enemy.hp <= 0 || enemy.joined_round === data.round) continue;
      const firstAttackIndex = enemy.skills.findIndex((s) => s.skill_type !== "소환");
      next[enemy.enemy_id] = firstAttackIndex >= 0
        ? { kind: "attack", skill_index: firstAttackIndex, target_character_ids: [] }
        : { kind: "none", skill_index: null, target_character_ids: [] };
    }
    setTelegraphDrafts(next);
  }

  function patchChar(characterId: number, patch: Partial<CharDraft>) {
    setCharDrafts((prev) => ({ ...prev, [characterId]: { ...prev[characterId], ...patch } }));
  }

  function patchTelegraph(enemyId: number, patch: Partial<TelegraphDraft>) {
    setTelegraphDrafts((prev) => ({ ...prev, [enemyId]: { ...prev[enemyId], ...patch } }));
  }

  function toggleTelegraphTarget(enemyId: number, characterId: number, maxCount: number) {
    setTelegraphDrafts((prev) => {
      const draft = prev[enemyId];
      if (!draft) return prev;
      const exists = draft.target_character_ids.includes(characterId);
      let nextIds: number[];
      if (exists) {
        nextIds = draft.target_character_ids.filter((id) => id !== characterId);
      } else if (draft.target_character_ids.length >= maxCount) {
        return prev;
      } else {
        nextIds = [...draft.target_character_ids, characterId];
      }
      return { ...prev, [enemyId]: { ...draft, target_character_ids: nextIds } };
    });
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

  function applyBulkCharacterAction() {
    if (!session) return;
    const hasDowned = session.participants.some((p) => p.downed);
    const characterIds: number[] = [];
    setCharDrafts((prev) => Object.fromEntries(
      Object.entries(prev).map(([characterId, draft]) => {
        const numericCharacterId = Number(characterId);
        const p = participantsById.get(numericCharacterId);
        const battleSkills = skillsByCharacter[numericCharacterId] ?? [];
        if (!p || !allowedKinds(p, hasDowned, battleSkills.length > 0).includes(bulkActionKind)) return [characterId, draft];
        const affordableSkills = affordableBattleSkills(battleSkills, p);
        if (bulkActionKind === "skill" && affordableSkills.length === 0) return [characterId, draft];
        if (bulkActionKind === "item") characterIds.push(numericCharacterId);
        return [characterId, {
          ...draft,
          kind: bulkActionKind,
          skill_node_id: bulkActionKind === "skill" ? firstBattleSkillId(affordableSkills) : draft.skill_node_id,
          target_character_id: bulkActionKind === "skill" ? numericCharacterId : draft.target_character_id,
          protect_target_character_id: bulkActionKind === "defend" ? numericCharacterId : draft.protect_target_character_id,
          item_id: bulkActionKind === "item" ? draft.item_id : null,
        }];
      }),
    ));
    if (bulkActionKind === "item") {
      void Promise.all(characterIds.map((characterId) => ensureItemsLoaded(characterId)));
    }
  }

  async function handleSubmitTelegraph() {
    if (!session) return;
    const enemyActions: BattleEnemyActionInput[] = Object.entries(telegraphDrafts).map(([id, draft]) => ({
      enemy_id: Number(id),
      kind: draft.kind,
      skill_index: draft.skill_index ?? undefined,
      target_character_ids: draft.target_character_ids,
    }));
    try {
      setSubmitting(true);
      const updated = await submitBattleTelegraph(session.id, enemyActions);
      setSession(updated);
      resetCharDrafts(updated);
      resetTelegraphDrafts(updated);
    } catch (e) {
      toast(e instanceof Error ? e.message : "적의 행동 암시 진행 실패", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitAllyTurn() {
    if (!session) return;
    const characterActions: BattleCharacterActionInput[] = Object.entries(charDrafts).map(([id, draft]) => ({
      character_id: Number(id),
      kind: draft.kind,
      skill_node_id: draft.kind === "skill" ? (draft.skill_node_id ?? undefined) : undefined,
      target_enemy_id: draft.target_enemy_id ?? undefined,
      target_character_id: draft.target_character_id ?? undefined,
      protect_target_character_id: draft.kind === "defend" ? (draft.protect_target_character_id ?? undefined) : undefined,
      item_id: draft.item_id ?? undefined,
    }));
    try {
      setSubmitting(true);
      const updated = await submitBattleAllyTurn(session.id, characterActions);
      setSession(updated);
      resetCharDrafts(updated);
      resetTelegraphDrafts(updated);
    } catch (e) {
      toast(e instanceof Error ? e.message : "아군 턴 진행 실패", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitEnemyTurn() {
    if (!session) return;
    try {
      setSubmitting(true);
      const updated = await submitBattleEnemyTurn(session.id);
      setSession(updated);
      resetCharDrafts(updated);
      resetTelegraphDrafts(updated);
    } catch (e) {
      toast(e instanceof Error ? e.message : "에너미 턴 진행 실패", "error");
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
      resetCharDrafts(updated);
      resetTelegraphDrafts(updated);
    } catch (e) {
      toast(e instanceof Error ? e.message : "라운드 되돌리기 실패", "error");
    } finally {
      setUndoing(false);
    }
  }

  async function handleTerminateBattle() {
    if (!session) return;
    const ok = await confirm({
      title: "전투 종료",
      description: "정말 종료하시겠습니까?",
      confirmText: "종료",
      tone: "danger",
    });
    if (!ok) return;
    try {
      setTerminating(true);
      const updated = await terminateBattle(session.id);
      setSession(updated);
      toast("전투가 조기 종료되었습니다.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "전투 종료 실패", "error");
    } finally {
      setTerminating(false);
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
      resetCharDrafts(updated);
      resetTelegraphDrafts(updated);
      setJoinOpen(false);
      setJoinCharacterId(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "난입 실패", "error");
    } finally {
      setJoining(false);
    }
  }

  async function openEnemyJoin() {
    setEnemyJoinOpen(true);
    setJoinEnemyId(null);
    if (!session) return;
    try {
      const candidates = await fetchEnemies(session.chapter ?? undefined);
      setEnemyJoinCandidates(candidates.filter((enemy) => enemy.chapter === session.chapter));
    } catch {
      setEnemyJoinCandidates([]);
    }
  }

  async function handleEnemyJoin() {
    if (!session || !joinEnemyId) return;
    try {
      setJoiningEnemy(true);
      const updated = await joinBattleEnemy(session.id, Number(joinEnemyId));
      setSession(updated);
      resetCharDrafts(updated);
      resetTelegraphDrafts(updated);
      setEnemyJoinOpen(false);
      setJoinEnemyId(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "에너미 참가 실패", "error");
    } finally {
      setJoiningEnemy(false);
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

  const enemyJoinOptions = useMemo(() => {
    const existingIds = new Set((session?.enemies ?? []).map((enemy) => enemy.enemy_id));
    return enemyJoinCandidates
      .filter((enemy) => enemy.chapter === session?.chapter && !existingIds.has(enemy.id))
      .map((enemy) => ({ value: String(enemy.id), label: enemy.name }));
  }, [enemyJoinCandidates, session]);

  const summonDisplayNames = useMemo(() => {
    const namesById = new Map<number, string>();
    const groups = new Map<string, BattleSession["summons"]>();
    for (const summon of session?.summons ?? []) {
      const group = groups.get(summon.name);
      if (group) group.push(summon);
      else groups.set(summon.name, [summon]);
    }
    for (const [name, summons] of groups) {
      const sortedSummons = summons.toSorted((a, b) => a.id - b.id);
      sortedSummons.forEach((summon, index) => {
        const number = summon.log_number ?? (sortedSummons.length > 1 ? index + 1 : null);
        namesById.set(summon.id, number == null ? name : `${name}${number}`);
      });
    }
    return namesById;
  }, [session?.summons]);

  const groupedLog = useMemo(() => {
    const groups: { round: number; entries: BattleSession["log"] }[] = [];
    for (const entry of session?.log ?? []) {
      const last = groups[groups.length - 1];
      if (last && last.round === entry.round) last.entries.push(entry);
      else groups.push({ round: entry.round, entries: [entry] });
    }
    return groups;
  }, [session?.log]);

  // 주목도가 전원 0이면 이름 가나다순, 한 명이라도 있으면 주목도 높은 순으로 정렬한다.
  const sortedParticipants = useMemo(() => {
    const participants = session?.participants ?? [];
    const hasAttn = participants.some((p) => p.attn !== 0);
    return [...participants].sort((a, b) => (
      hasAttn ? b.attn - a.attn : a.name.localeCompare(b.name, "ko")
    ));
  }, [session?.participants]);

  const participantsById = useMemo(
    () => new Map((session?.participants ?? []).map((participant) => [participant.character_id, participant])),
    [session?.participants],
  );
  const targetableParticipants = useMemo(
    () => (session?.participants ?? []).filter((participant) => isTargetable(participant, session?.round ?? 0)),
    [session?.participants, session?.round],
  );
  const healableParticipants = useMemo(
    () => (session?.participants ?? []).filter((participant) => isHealable(participant, session?.round ?? 0)),
    [session?.participants, session?.round],
  );
  const downedParticipants = useMemo(
    () => (session?.participants ?? []).filter((participant) => participant.downed),
    [session?.participants],
  );
  const targetableEnemies = useMemo(
    () => (session?.enemies ?? []).filter((enemy) => isEnemyTargetable(enemy, session?.round ?? 0)),
    [session?.enemies, session?.round],
  );
  const pendingActionsByEnemy = useMemo(
    () => new Map((session?.pending_enemy_actions ?? []).map((action) => [action.enemy_id, action])),
    [session?.pending_enemy_actions],
  );
  const enemyTitle = useMemo(
    () => (session?.enemies ?? []).map((enemy) => enemy.name).join(", "),
    [session?.enemies],
  );

  if (loading || !session) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">전투 정보를 불러오는 중입니다.</p>
      </div>
    );
  }

  const inProgress = session.status === "in_progress";
  const canAct = inProgress && !readOnly;
  const phase = session.phase;
  const hasDowned = downedParticipants.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onExit} className="px-2">
            <ArrowLeft size={15} />
          </Button>
          <h2 className="text-lg font-bold text-ivory">
            {enemyTitle} 전투
          </h2>
          <Badge>{session.mode === "real" ? "실전" : "모의전"}</Badge>
          <Badge variant="outline">라운드 {session.round}</Badge>
          {inProgress && <Badge variant="secondary">{PHASE_LABEL[phase]}</Badge>}
        </div>
        {canAct && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={openJoin}>
              <UserPlus size={14} />
              캐릭터 난입
            </Button>
            <Button variant="outline" size="sm" onClick={openEnemyJoin}>
              <Skull size={14} />
              에너미 추가
            </Button>
          </div>
        )}
      </div>

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
          <p className="text-xs text-muted">난입한 캐릭터는 이번 라운드에는 행동할 수 없고, 공격/치유 대상도 되지 않습니다.</p>
        </div>
      )}

      {enemyJoinOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/5 p-3">
          <Combobox
            options={enemyJoinOptions}
            value={joinEnemyId}
            onChange={setJoinEnemyId}
            placeholder="추가할 에너미 선택"
            searchPlaceholder="에너미 이름 검색"
            className="w-56"
          />
          <Button size="sm" disabled={!joinEnemyId || joiningEnemy} onClick={handleEnemyJoin}>
            {joiningEnemy ? "처리 중..." : "참가 확정"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEnemyJoinOpen(false)}>취소</Button>
          <p className="text-xs text-muted">추가된 에너미는 다음 라운드부터 행동하고 공격 대상으로 선택할 수 있습니다.</p>
        </div>
      )}

      {/* 에너미 */}
      <div className="space-y-2">
        {session.enemies.map((enemy) => {
          const dead = enemy.hp <= 0;
          const justJoined = enemy.joined_round === session.round;
          const draft = telegraphDrafts[enemy.enemy_id];
          const attackSkills = enemy.skills.map((s, i) => ({ ...s, index: i })).filter((s) => s.skill_type !== "소환");
          const summonSkills = enemy.skills.map((s, i) => ({ ...s, index: i })).filter((s) => s.skill_type === "소환");
          const selectedSkill = draft?.skill_index != null ? enemy.skills[draft.skill_index] : null;
          const needsManualTargets = draft?.kind === "attack" && selectedSkill && !selectedSkill.skill_type.startsWith("광역");
          const targetCount = selectedSkill ? Math.max(1, selectedSkill.target_count) : 0;
          const pendingLabel = !dead && phase !== "telegraph"
            ? describePendingAction(enemy, pendingActionsByEnemy.get(enemy.enemy_id), participantsById)
            : null;
          return (
            <div
              key={enemy.enemy_id}
              className={cn("rounded-xl border p-4", dead ? "border-line bg-primary-light/10 opacity-60" : "border-red-500/40 bg-red-500/10")}
            >
              <div className="mb-2 flex items-center gap-2">
                <Skull size={16} className={dead ? "text-muted" : "text-red-500"} />
                <span className="font-semibold text-ivory">{enemy.name}</span>
                {dead && <Badge variant="secondary">격파</Badge>}
                {!dead && justJoined && <Badge variant="outline">참가 · 다음 라운드부터 행동</Badge>}
                <span className="font-num text-xs text-muted">공격력 {enemy.attack}</span>
              </div>
              <HpBar hp={enemy.hp} max={enemy.max_hp} color="bg-red-500" />

              {canAct && !dead && phase === "telegraph" && draft && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-muted">행동</span>
                    <Select
                      value={draft.kind === "none" ? "none" : `${draft.kind}:${draft.skill_index}`}
                      onValueChange={(v) => {
                        if (v === "none") { patchTelegraph(enemy.enemy_id, { kind: "none", skill_index: null, target_character_ids: [] }); return; }
                        const [kind, idx] = v.split(":");
                        patchTelegraph(enemy.enemy_id, { kind: kind as EnemyActionKind, skill_index: Number(idx), target_character_ids: [] });
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

                  {needsManualTargets && (
                    <div className="rounded-lg border border-line bg-inset/60 p-2">
                      <p className="mb-1.5 text-[11px] text-muted">
                        공격 대상 선택 ({draft.target_character_ids.length}/{targetCount}명, 비워두면 자동 선정)
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {targetableParticipants.map((p) => {
                          const checked = draft.target_character_ids.includes(p.character_id);
                          const disabled = !checked && draft.target_character_ids.length >= targetCount;
                          return (
                            <label key={p.character_id} className={cn("flex items-center gap-1.5 text-xs text-ivory/85", disabled && "opacity-40")}>
                              <Checkbox
                                checked={checked}
                                disabled={disabled}
                                onCheckedChange={() => toggleTelegraphTarget(enemy.enemy_id, p.character_id, targetCount)}
                              />
                              {p.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {pendingLabel && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
                  <Megaphone size={12} className="shrink-0" />
                  {pendingLabel}
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
          <div className="grid grid-cols-5 gap-2">
            {session.summons.map((s) => (
              <div key={s.id} className="rounded-lg border border-line bg-surface px-3 py-2">
                <p className="mb-1 text-sm font-semibold text-ivory">{summonDisplayNames.get(s.id) ?? s.name}</p>
                <HpBar hp={s.hp} max={s.max_hp} color="bg-orange-500" />
              </div>
            ))}
          </div>
        </div>
      )}

      {canAct && phase === "ally" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-inset p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ivory">
            <ListChecks size={15} className="text-gold" />
            전원 행동 변경
          </div>
          <Select value={bulkActionKind} onValueChange={(kind: CharacterActionKind) => setBulkActionKind(kind)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {BULK_ACTION_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>{CHAR_ACTION_LABEL[kind]}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={applyBulkCharacterAction} disabled={Object.keys(charDrafts).length === 0}>
            반영
          </Button>
          <p className="text-xs text-muted">이번 라운드에 행동 가능한 모든 캐릭터에게 적용됩니다(치유/구조 제외).</p>
        </div>
      )}

      {/* 캐릭터 그리드 */}
      <div className="grid grid-cols-1 justify-items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sortedParticipants.map((p) => {
          const draft = charDrafts[p.character_id];
          const active = isActive(p);
          const battleSkills = skillsByCharacter[p.character_id] ?? [];
          const affordableSkills = affordableBattleSkills(battleSkills, p);
          const items = itemsByCharacter[p.character_id] ?? [];
          const showActionUi = canAct && phase === "ally" && active && draft;
          const kindOptions = allowedKinds(p, hasDowned, battleSkills.length > 0);
          const selectedSkill = draft?.skill_node_id != null
            ? affordableSkills.find((skill) => skill.id === draft.skill_node_id) ?? affordableSkills[0] ?? null
            : affordableSkills[0] ?? null;
          const selectedSkillTargetMode = draft?.kind === "skill" && selectedSkill
            ? getBattleSkillTargetMode(selectedSkill)
            : null;
          const extraControls: { key: string; icon: LucideIcon; control: ReactNode }[] = [];

          if (draft?.kind === "skill" && affordableSkills.length > 0) {
            extraControls.push({
              key: "skill",
              icon: Sparkles,
              control: (
                <Select
                  value={draft.skill_node_id != null ? String(draft.skill_node_id) : String(affordableSkills[0].id)}
                  onValueChange={(value) => patchChar(p.character_id, {
                    skill_node_id: Number(value),
                    target_character_id: p.character_id,
                  })}
                >
                  <SelectTrigger className="h-8 w-full text-[11px]">
                    <SelectValue placeholder="기술 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {affordableSkills.map((skill) => (
                        <SelectItem key={skill.id} value={String(skill.id)}>{skill.display_name}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ),
            });

            if (selectedSkillTargetMode === "enemy-single" && targetableEnemies.length > 1) {
              extraControls.push({
                key: "enemy-target",
                icon: Skull,
                control: (
                  <Select
                    value={draft.target_enemy_id != null ? String(draft.target_enemy_id) : ""}
                    onValueChange={(value) => patchChar(p.character_id, { target_enemy_id: Number(value) })}
                  >
                    <SelectTrigger className="h-8 w-full text-[11px]">
                      <SelectValue placeholder="대상 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {targetableEnemies.map((enemy) => (
                          <SelectItem key={enemy.enemy_id} value={String(enemy.enemy_id)}>{enemy.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ),
              });
            } else if (selectedSkillTargetMode === "ally-single") {
              const targetCandidates = selectedSkill?.category === "강화"
                ? targetableParticipants
                : healableParticipants;
              if (targetCandidates.length > 1) {
                extraControls.push({
                  key: "ally-target",
                  icon: HeartPulse,
                  control: (
                    <Select
                      value={draft.target_character_id != null ? String(draft.target_character_id) : ""}
                      onValueChange={(value) => patchChar(p.character_id, { target_character_id: Number(value) })}
                    >
                      <SelectTrigger className="h-8 w-full text-[11px]">
                        <SelectValue placeholder="대상 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {targetCandidates.map((target) => (
                            <SelectItem key={target.character_id} value={String(target.character_id)}>
                              {target.name}{target.downed ? " (기절)" : target.character_id === p.character_id ? " (본인)" : ""}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  ),
                });
              }
            }
          } else if (draft && draft.kind === "attack" && targetableEnemies.length > 1) {
            extraControls.push({
              key: "enemy-target",
              icon: Skull,
              control: (
                <Select
                  value={draft.target_enemy_id != null ? String(draft.target_enemy_id) : ""}
                  onValueChange={(value) => patchChar(p.character_id, { target_enemy_id: Number(value) })}
                >
                  <SelectTrigger className="h-8 w-full text-[11px]">
                    <SelectValue placeholder="대상 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {targetableEnemies.map((enemy) => (
                        <SelectItem key={enemy.enemy_id} value={String(enemy.enemy_id)}>{enemy.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ),
            });
          } else if (draft?.kind === "heal") {
            extraControls.push({
              key: "heal-target",
              icon: HeartPulse,
              control: (
                <Select
                  value={draft.target_character_id != null ? String(draft.target_character_id) : ""}
                  onValueChange={(value) => patchChar(p.character_id, { target_character_id: Number(value) })}
                >
                  <SelectTrigger className="h-8 w-full text-[11px]">
                    <SelectValue placeholder="치유 대상 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {healableParticipants.map((target) => (
                        <SelectItem key={target.character_id} value={String(target.character_id)}>
                          {target.name}{target.downed ? " (기절)" : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ),
            });
          } else if (draft?.kind === "rescue") {
            extraControls.push({
              key: "rescue-target",
              icon: UserPlus,
              control: (
                <Select
                  value={draft.target_character_id != null ? String(draft.target_character_id) : ""}
                  onValueChange={(value) => patchChar(p.character_id, { target_character_id: Number(value) })}
                >
                  <SelectTrigger className="h-8 w-full text-[11px]">
                    <SelectValue placeholder="구조 대상 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {downedParticipants.map((target) => (
                        <SelectItem key={target.character_id} value={String(target.character_id)}>{target.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ),
            });
          } else if (draft?.kind === "item") {
            extraControls.push({
              key: "item",
              icon: Package,
              control: (
                <Select
                  value={draft.item_id != null ? String(draft.item_id) : ""}
                  onValueChange={(value) => patchChar(p.character_id, { item_id: Number(value) })}
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
              ),
            });
          } else if (draft?.kind === "defend" && p.faction === "수비") {
            extraControls.push({
              key: "protect-target",
              icon: Shield,
              control: (
                <Select
                  value={draft.protect_target_character_id != null ? String(draft.protect_target_character_id) : String(p.character_id)}
                  onValueChange={(value) => patchChar(p.character_id, { protect_target_character_id: Number(value) })}
                >
                  <SelectTrigger className="h-8 w-full text-[11px]">
                    <SelectValue placeholder="보호 대상" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {targetableParticipants.map((target) => (
                        <SelectItem key={target.character_id} value={String(target.character_id)}>
                          {target.character_id === p.character_id ? `${target.name} (본인)` : target.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ),
            });
          }

          const actionControls: { key: string; icon: LucideIcon; control: ReactNode }[] = [
            {
              key: "action",
              icon: ListChecks,
              control: (
                <Select
                  value={draft?.kind}
                  onValueChange={(kind: CharacterActionKind) => {
                    const nextPatch: Partial<CharDraft> = {
                      kind,
                      item_id: kind === "item" ? draft?.item_id ?? null : null,
                      protect_target_character_id: kind === "defend" ? p.character_id : draft?.protect_target_character_id ?? p.character_id,
                    };
                    if (kind === "skill") {
                      nextPatch.skill_node_id = firstBattleSkillId(affordableSkills);
                      nextPatch.target_character_id = p.character_id;
                    }
                    patchChar(p.character_id, nextPatch);
                    if (kind === "item") void ensureItemsLoaded(p.character_id);
                  }}
                >
                  <SelectTrigger className="h-8 w-full text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {kindOptions.map((kind) => {
                        const skillUnavailable = kind === "skill" && affordableSkills.length === 0;
                        return (
                          <SelectItem key={kind} value={kind} disabled={skillUnavailable}>
                            {skillUnavailable ? "기술(마나 부족)" : CHAR_ACTION_LABEL[kind]}
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ),
            },
            ...extraControls,
          ];

          return (
            <div
              key={p.character_id}
              className={cn(
                "w-full max-w-[21rem] rounded-2xl border p-2.5 transition-colors duration-200",
                !active
                  ? "border-line bg-primary-light/10 opacity-60"
                  : showActionUi
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
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ivory">
                      <span className="truncate">{p.name}</span>
                      {!readOnly && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-normal text-gold" title="주목도 (관리자 전용)">
                          <Eye size={11} />
                          {fmt(p.attn)}
                        </span>
                      )}
                    </p>
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

                    {(p.downed || p.retreated || p.defending || (active && p.joined_round === session.round)) && (
                      <div className="flex flex-wrap gap-2">
                        {p.downed && <Badge variant="destructive" className="text-[10px]">기절</Badge>}
                        {p.retreated && <Badge variant="secondary" className="text-[10px]">퇴각</Badge>}
                        {active && p.defending && (
                          <Badge variant="outline" className="text-[10px]">
                            <HeartPulse size={10} className="mr-0.5" />
                            방어 중
                            {p.protect_target != null && p.protect_target !== p.character_id
                              ? ` · ${participantsById.get(p.protect_target)?.name ?? ""} 보호`
                              : ""}
                          </Badge>
                        )}
                        {active && p.joined_round === session.round && (
                          <Badge variant="outline" className="text-[10px]">난입 · 이번 라운드 행동 불가</Badge>
                        )}
                      </div>
                    )}

                    {p.status_effects != null && p.status_effects.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {p.status_effects.map((effect, index) => {
                          const isBuff = effect.affinity === "buff";
                          const label = effect.skill_name || effect.var_name || effect.effect_type;
                          return (
                            <Badge
                              key={`${effect.effect_type}-${index}`}
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                isBuff ? "border-emerald-500/50 text-emerald-400" : "border-fuchsia-500/50 text-fuchsia-400",
                              )}
                            >
                              {isBuff ? <TrendingUp size={10} className="mr-0.5" /> : <TrendingDown size={10} className="mr-0.5" />}
                              {label}
                              {effect.stacks != null && effect.stacks > 1 ? ` ×${effect.stacks}` : ""}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {showActionUi && (
                  <div
                    className={cn(
                      "grid w-full gap-2",
                      actionControls.length >= 3
                        ? "grid-cols-2 items-start"
                        : actionControls.length === 2
                          ? "grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-start"
                          : "grid-cols-1",
                    )}
                  >
                    {actionControls.map(({ key, icon: Icon, control }, index) => (
                      <div
                        key={key}
                        className={cn(
                          "flex min-w-0 items-center gap-2",
                          actionControls.length >= 3 && index === actionControls.length - 1 && "col-span-2",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 text-muted" />
                        {control}
                      </div>
                    ))}
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
              : session.status === "early_terminated"
                ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                : "border-red-500/40 bg-red-500/15 text-red-600",
          )}
        >
          {session.status === "victory" ? <Swords size={16} /> : <Ban size={16} />}
          {session.status === "victory"
            ? "전투 승리! 에너미를 격파했습니다."
            : session.status === "early_terminated"
              ? "전투가 조기 종료되었습니다."
              : "전투 패배... 모든 캐릭터가 기절/퇴각했습니다."}
        </div>
      ) : canAct ? (
        <div className="flex flex-wrap items-center gap-2">
          {phase === "telegraph" && (
            <Button onClick={handleSubmitTelegraph} disabled={submitting || undoing || terminating}>
              <Megaphone size={15} />
              {submitting ? "진행 중..." : `라운드 ${session.round} · 적의 행동 암시 진행`}
            </Button>
          )}
          {phase === "ally" && (
            <Button onClick={handleSubmitAllyTurn} disabled={submitting || undoing || terminating}>
              <Sparkles size={15} />
              {submitting ? "진행 중..." : `라운드 ${session.round} · 아군 턴 진행`}
            </Button>
          )}
          {phase === "enemy" && (
            <Button onClick={handleSubmitEnemyTurn} disabled={submitting || undoing || terminating}>
              <Swords size={15} />
              {submitting ? "진행 중..." : `라운드 ${session.round} · 에너미의 턴 진행`}
            </Button>
          )}
          {session.mode === "real" && phase === "telegraph" && session.round > 1 && (
            <Button
              variant="outline"
              onClick={handleUndoRound}
              disabled={submitting || undoing || terminating}
            >
              <Undo2 size={15} />
              {undoing ? "되돌리는 중..." : "이전 라운드 다시 진행하기"}
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={handleTerminateBattle}
            disabled={submitting || undoing || terminating}
          >
            <Ban size={15} />
            {terminating ? "종료 중..." : "전투 종료"}
          </Button>
        </div>
      ) : null}

      {/* 전투 로그 */}
      {groupedLog.length > 0 && (
        <div className="space-y-3 rounded-xl border border-line bg-inset p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">전투 로그</span>
          {[...groupedLog].reverse().map((group, groupIndex) => (
            <div key={group.round} className={cn("space-y-2", groupIndex > 0 && "border-t border-line pt-3")}>
              <div className="text-xs font-bold text-ivory/85">라운드 {group.round}</div>
              {[...group.entries].reverse().map((entry, entryIndex) => (
                <div key={entryIndex} className="space-y-1 pl-2">
                  {entry.phase && (
                    <div className="text-[11px] font-semibold text-gold/90">{PHASE_LABEL[entry.phase]}</div>
                  )}
                  {entry.events.map((e, i) => (
                    <div key={i} className="text-sm text-ivory/85">{e}</div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
