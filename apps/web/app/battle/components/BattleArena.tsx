"use client";

import { type ReactNode, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, Ban, Check, Eye, Files, Heart, HeartPulse, Link2, ListChecks, Package, Shield, type LucideIcon, Megaphone, Skull, Sparkles, Swords, TrendingDown, TrendingUp, Undo2, UserPlus, Zap } from "lucide-react";
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
import { FACTION_POSITION_IMAGE, factionRank } from "@/lib/faction";
import {
  fetchBattle,
  fetchBattleActiveSkills,
  fetchBattleAvailableItems,
  fetchCharacters,
  fetchEnemies,
  joinBattle,
  joinBattleEnemy,
  submitBattleAllyTurn,
  submitBattleEnemyTurn,
  submitBattleTelegraph,
  terminateBattle,
  undoLastBattleTurn,
  updateBattlePairs,
  invalidateBattleCharacterCache,
  type BattleCharacterActionInput,
  type BattleEnemyActionInput,
  type BattleEnemyState,
  type BattleParticipant,
  type BattleSession,
  type BattleStatusEffect,
  type BattleActiveSkill,
  type EnemySkill,
  type CharacterActionKind,
  type CharacterOwnedItem,
  type Character,
  type Enemy,
  type EnemyActionKind,
  type BattleSessionEnvironment,
} from "@/lib/api";
import InfoTooltip from "@/components/common/InfoTooltip";
import AlertBanner from "@/components/common/AlertBanner";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import { useDialog } from "@/components/common/DialogProvider";
import { useToast } from "@/components/common/ToastProvider";
import { useBattleSocket, type BattleDraftPreview, type BattleDraftPreviewEntry, type BattleDraftSnapshot, type BattleEditingState } from "@/lib/useBattleSocket";
import { isAdminRole, useAuth } from "@/lib/auth";
import BattleRewardCard from "./BattleRewardCard";
import BattleLogEvent from "./BattleLogEvent";
import BattleRoundMetricsTable from "./BattleRoundMetricsTable";
import BattlePairGrid from "./BattlePairGrid";
import { sameBattleCombatState, swapBattlePairMembers } from "@/lib/battlePairs";

function displayStatusEffects(effects: BattleStatusEffect[]): BattleStatusEffect[] {
  const result: BattleStatusEffect[] = [];
  const grouped = new Map<string, BattleStatusEffect>();
  for (const effect of effects) {
    const existing = effect.stack_source ? grouped.get(effect.stack_source) : undefined;
    if (existing) existing.stacks = (existing.stacks ?? 1) + (effect.stacks ?? 1);
    else {
      const copy = { ...effect };
      result.push(copy);
      if (effect.stack_source) grouped.set(effect.stack_source, copy);
    }
  }
  return result;
}

const numberFormatter = new Intl.NumberFormat("ko-KR");
const EMPTY_BATTLE_SKILLS: Record<number, BattleActiveSkill[]> = {};
const fmt = (n: number) => numberFormatter.format(Math.max(0, Math.round(n)));

interface Props {
  sessionId: number;
  readOnly?: boolean;
  onExit: () => void;
  /**
   * 부모가 이미 최신 세션 데이터를 갖고 폴링하는 경우(예: 러너 관전 화면의 `/battles/live` 폴링) 전달한다.
   * 주어지면 BattleArena는 자체 초기 조회/폴링을 하지 않고 이 값을 그대로 반영만 한다(중복 폴링 방지).
   */
  externalSession?: BattleSession;
  /**
   * 부모가 이미 WebSocket으로 관리자의 확정 전 초안 미리보기를 받고 있는 경우(러너 관전 화면) 전달한다.
   * externalSession과 함께 사용하며, 없으면 BattleArena가 직접 소켓에 연결해 받는다.
   */
  draftPreview?: BattleDraftPreview | null;
}

interface CharDraft {
  kind: CharacterActionKind;
  skill_node_id: number | null;
  skill_target_keys?: string[];
  target_enemy_id: number | null;
  target_character_id: number | null; // 치유/구조 지정 대상
  protect_target_character_id: number | null; // 방어(수비 포지션 한정) 시 대신 맞아줄 대상
  item_id: number | null;
}

interface TelegraphActionDraft {
  kind: EnemyActionKind;
  skill_index: number | null;
  target_character_ids: number[];
}

interface TelegraphDraft {
  actions: TelegraphActionDraft[];
}

interface RemoteEditingState extends BattleEditingState {
  updatedAt: number;
}

const EDITING_STATE_TTL_MS = 8_000;
const EDITING_STATE_HEARTBEAT_MS = EDITING_STATE_TTL_MS / 2;
const EDITING_INDICATOR_GRACE_MS = 2_000;

function defaultCharKind(faction: string | null, mp: number): CharacterActionKind {
  if (faction === "수비") return "defend";
  if (faction === "치유") return mp >= 1 ? "heal" : "none";
  return "attack";
}

function isActive(p: BattleParticipant): boolean {
  return !p.downed && !p.retreated;
}

type ParticipantSort = "attention" | "name" | "hp" | "position";

const PARTICIPANT_SORTS: { value: ParticipantSort; label: string }[] = [
  { value: "attention", label: "주목도 순" },
  { value: "name", label: "이름순" },
  { value: "hp", label: "체력 비율순" },
  { value: "position", label: "포지션 순" },
];

/** 이름 옆에 붙는 포지션(공격/수비/치유) 아이콘. */
function ParticipantFactionIcon({ faction }: { faction: BattleParticipant["faction"] }) {
  if (!faction) return null;
  return (
    <Image
      src={FACTION_POSITION_IMAGE[faction]}
      alt={faction}
      title={faction}
      width={18}
      height={18}
      className="shrink-0 [image-rendering:pixelated]"
    />
  );
}

/** 주목도는 관리자/스텝 전용 정보라, 러너에게 보여줄 로그에서는 "· +20 주목도"류 구간을 잘라낸다. */
const ATTN_LOG_SUFFIX_PATTERN = /\s*·\s*(?:\+?\d[\d,]*\s*주목도|주목도\s*\d[\d,]*\s*이전\s*\/\s*\d[\d,]*\s*획득)\s*$/;
function stripAttnInfo(event: string): string {
  return event.replace(ATTN_LOG_SUFFIX_PATTERN, "");
}

/** "이전 턴 다시 진행하기"가 되돌릴 대상을 사람이 읽을 수 있는 문구로 표현한다. 되돌릴 턴이 없으면 null. */
function describePreviousTurn(session: BattleSession): string | null {
  if (session.phase === "ally") return `라운드 ${session.round} · 적의 행동 암시`;
  if (session.phase === "enemy") return `라운드 ${session.round} · 아군 턴`;
  if (session.round > 1) return `라운드 ${session.round - 1} · 에너미 턴`;
  return null;
}

/** 이번 라운드에 난입한 캐릭터는 행동할 수 없고, 공격/치유 대상도 될 수 없다. */
function isTargetable(p: BattleParticipant, currentRound: number): boolean {
  return isActive(p) && p.joined_round !== currentRound;
}

/** 치유 대상은 기절한 캐릭터도 포함한다(퇴각/난입 캐릭터만 제외). */
function isHealable(p: BattleParticipant, currentRound: number): boolean {
  return !p.retreated && p.joined_round !== currentRound;
}

/**
 * 에너미 기술의 기본 공격 대상을 서버(_select_enemy_skill_targets)와 같은 규칙으로 미리 고른다.
 * 주목도 순은 (주목도 + 존재감) 내림차순, 무작위는 말 그대로 무작위로 뽑는다.
 */
function autoSelectEnemyTargets(
  candidates: BattleParticipant[],
  count: number,
  mode: string | null | undefined,
): number[] {
  const picked = [...candidates];
  if (mode === "random") {
    for (let i = picked.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [picked[i], picked[j]] = [picked[j], picked[i]];
    }
  } else {
    picked.sort((a, b) => (b.attn + b.presence) - (a.attn + a.presence));
  }
  return picked.slice(0, Math.max(0, Math.min(count, picked.length))).map((p) => p.character_id);
}

/** 자동 선정 대상이 있는 기술인지(수동 지정·전체 공격은 미리 채우지 않는다). */
function autoTargetsForEnemySkill(skill: EnemySkill | null | undefined, candidates: BattleParticipant[]): number[] {
  if (!skill || skill.manual_target_count || isEnemySkillAoe(skill)) return [];
  return autoSelectEnemyTargets(candidates, Math.max(1, skill.target_count), skill.auto_target_mode);
}

interface StackBarItem {
  key: string;
  label: string;
  count: number;
  /** 환경 스택처럼 색이 데이터로 오는 경우 */
  color?: string;
  /** 상태이상처럼 강화/약화로 색이 정해지는 경우 */
  tone?: "buff" | "debuff";
}

const STACK_BAR_TONE = {
  buff: { bar: "bg-emerald-400", text: "text-emerald-400" },
  debuff: { bar: "bg-fuchsia-400", text: "text-fuchsia-400" },
} as const;

/** 환경 스택·상태이상을 개수만큼 대각선 바로 보여주고, 커서를 올리면 이름과 개수를 알려준다. */
function StackBars({ items, className }: { items: StackBarItem[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <InfoTooltip content={
      <span className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => (
          <span key={item.key}>
            {index > 0 && <span className="mr-1 text-muted">|</span>}
            <span className={item.tone ? STACK_BAR_TONE[item.tone].text : undefined} style={item.tone ? undefined : { color: item.color }}>
              {item.label} × {item.count}
            </span>
          </span>
        ))}
      </span>
    }>
      <div
        tabIndex={0}
        className={cn("inline-flex w-fit cursor-help flex-wrap gap-1 py-0.5", className)}
        aria-label={items.map((item) => `${item.label} × ${item.count}`).join(" | ")}
      >
        {items.map((item) => (
          <div key={item.key} className="contents">
            {Array.from({ length: item.count }, (_, index) => (
              <span
                key={index}
                aria-hidden="true"
                className={cn("block h-2.5 w-0.5 rotate-20 rounded-full", item.tone && STACK_BAR_TONE[item.tone].bar)}
                style={item.tone ? undefined : { backgroundColor: item.color }}
              />
            ))}
          </div>
        ))}
      </div>
    </InfoTooltip>
  );
}

/**
 * 상태이상 목록을 대각선 바 항목으로 바꾼다(강화는 초록, 약화는 자주).
 * 같은 시전자가 같은 기술을 여러 번 건 경우는 한 항목으로 묶어 개수로 보여준다.
 */
function statusEffectBarItems(effects: BattleStatusEffect[]): StackBarItem[] {
  const grouped = new Map<string, StackBarItem>();
  for (const effect of displayStatusEffects(effects)) {
    const skillName = effect.skill_name || effect.var_name || effect.effect_type;
    const label = effect.source_name ? `${effect.source_name}의 ${skillName}` : skillName;
    const tone = effect.affinity === "buff" ? "buff" : "debuff";
    const key = `${tone}:${label}`;
    const count = Math.max(1, effect.stacks ?? 1);
    const existing = grouped.get(key);
    if (existing) existing.count += count;
    else grouped.set(key, { key, label, count, tone });
  }
  return [...grouped.values()];
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
  item: "소비",
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

const SELF_TARGET_SKILL_NAMES = new Set(["모루", "불굴"]);
const SINGLE_ENEMY_SKILL_NAMES = new Set(["강타", "격류", "위해"]);
const MULTI_ENEMY_SKILL_NAMES = new Set(["분쇄", "파괴"]);
const SINGLE_ALLY_SKILL_NAMES = new Set(["반격", "보호", "수호", "회복", "생명", "정화", "승화"]);
const MULTI_ALLY_SKILL_NAMES = new Set(["구호"]);
// 구호는 관리자가 대상을 고르지 않고 서버가 현재 체력이 낮은 순으로 자동 지정한다.
const AUTO_ALLY_TARGET_SKILL_NAMES = new Set(["구호"]);
// 충전은 기절한 아군에게는 걸 수 없고 시전자 자신도 대상이 되지 않는다(서버 ab_charge와 동일 조건).
const ACTIVE_ALLY_SKILL_NAMES = new Set(["충전"]);
const SELF_EXCLUDED_SKILL_NAMES = new Set(["충전"]);

type BattleSkillTargetMode = "enemy-single" | "enemy-multi" | "ally-single" | "ally-multi" | "self" | "none";

/** 기술 대상은 SELF 또는 1 이상의 정수만 허용한다. 그 외 값은 대상 수를 알 수 없으므로 null이다. */
function skillTargetCount(target: string | null): number | null {
  const text = (target ?? "").trim();
  return /^\d+$/.test(text) ? Math.max(1, Number(text)) : null;
}

function getBattleSkillTargetMode(skill: BattleActiveSkill): BattleSkillTargetMode {
  if (SELF_TARGET_SKILL_NAMES.has(skill.default_name) || skill.target === "SELF") return "self";
  const configuredCount = skillTargetCount(skill.target);
  const multi = configuredCount != null && configuredCount > 1;
  if (skill.target_side === "ENEMY") return multi ? "enemy-multi" : "enemy-single";
  if (skill.target_side === "ALLY") return multi ? "ally-multi" : "ally-single";
  if (MULTI_ALLY_SKILL_NAMES.has(skill.default_name)) return "ally-multi";
  if (MULTI_ENEMY_SKILL_NAMES.has(skill.default_name)) return "enemy-multi";
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

/** 서버(_skill_target_count)와 같이 기술에 적힌 기술 대상만 인원으로 쓴다. */
function getBattleSkillTargetCount(skill: BattleActiveSkill): number {
  return skillTargetCount(skill.target) ?? 1;
}

/**
 * 초안의 행동 대상을 러너 화면에 그대로 보여줄 이름 목록으로 바꾼다.
 * 서버(crud.py)의 대상 결정 규칙과 같은 순서를 따라야 미리보기와 실제 결과가 어긋나지 않는다.
 * 아직 대상이 정해지지 않았으면 빈 배열을 돌려주고, 표시 여부는 호출부가 정한다.
 */
function draftTargetNames(
  actor: BattleParticipant,
  draft: CharDraft,
  skill: BattleActiveSkill | null,
  session: BattleSession,
): string[] {
  const allyName = (characterId: number): string | null => {
    if (characterId === actor.character_id) return "본인";
    return session.participants.find((p) => p.character_id === characterId)?.name ?? null;
  };
  const nameForKey = (key: string): string | null => {
    const [kind, rawId] = key.split(":");
    const id = Number(rawId);
    if (kind === "enemy") return session.enemies.find((enemy) => enemy.enemy_id === id)?.name ?? null;
    if (kind === "summon") {
      const summon = session.summons.find((candidate) => candidate.id === id);
      return summon ? `${summon.name} (하수인)` : null;
    }
    return allyName(id);
  };
  const notNull = (name: string | null): name is string => name !== null;

  switch (draft.kind) {
    case "attack": {
      // 일반 공격은 살아 있는 하수인이 있으면 지정한 에너미보다 하수인을 먼저 때린다.
      const summon = session.summons.find((candidate) => candidate.hp > 0);
      if (summon) return [`${summon.name} (하수인)`];
      const targetable = session.enemies.filter((enemy) => isEnemyTargetable(enemy, session.round));
      // 때릴 수 있는 에너미가 하나뿐이면 대상이 자명하므로 표기하지 않는다.
      if (targetable.length < 2) return [];
      const chosen = targetable.find((enemy) => enemy.enemy_id === draft.target_enemy_id) ?? targetable[0];
      return chosen ? [chosen.name] : [];
    }
    case "skill": {
      const keys = draft.skill_target_keys ?? [];
      if (keys.length > 0) return keys.map(nameForKey).filter(notNull);
      const mode = skill ? getBattleSkillTargetMode(skill) : null;
      return mode === "self" || mode === "none" ? ["본인"] : [];
    }
    case "heal":
    case "rescue":
      return draft.target_character_id != null ? [allyName(draft.target_character_id)].filter(notNull) : [];
    case "defend":
      return draft.protect_target_character_id != null
        ? [allyName(draft.protect_target_character_id)].filter(notNull)
        : [];
    default:
      return [];
  }
}

/** 러너 미리보기 배지의 행동 이름. 기술/소비는 무엇을 쓰는지까지 함께 보여준다. */
function previewActionLabel(preview: BattleDraftPreviewEntry): string {
  if (preview.kind === "skill") return `기술(${preview.skill_name ?? "기술"})`;
  if (preview.kind === "item") return `소비(${preview.item_name ?? "아이템"})`;
  return CHAR_ACTION_LABEL[preview.kind];
}

/** 행동 이름 뒤에 붙일 대상 표기. 대상 개념이 없는 행동에는 아무것도 붙이지 않는다. */
function previewTargetSuffix(preview: BattleDraftPreviewEntry): string {
  const names = preview.target_names ?? [];
  if (preview.kind === "defend") {
    return names.length > 0 ? ` → ${names[0]} 보호` : "";
  }
  if (names.length > 0) return ` → ${names.join(", ")}`;
  // 기술은 대상을 고르기 전에도 대상 칸이 있다는 것 자체를 보여준다.
  return preview.kind === "skill" ? " → 대상 미정" : "";
}

function firstBattleSkillId(skills: BattleActiveSkill[]) {
  return skills[0]?.id ?? null;
}

function battleSkillCost(skill: BattleActiveSkill, p: BattleParticipant): number {
  return Math.max(0, Math.floor((skill.cost ?? 0) + p.skill_cost));
}

function affordableBattleSkills(skills: BattleActiveSkill[], p: BattleParticipant): BattleActiveSkill[] {
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

function isEnemySkillAoe(skill: { skill_type: string; manual_target_count?: boolean }): boolean {
  return skill.skill_type === "광역 공격" && !skill.manual_target_count;
}

/** 에너미가 이번 라운드에 예고한 행동을 사람이 읽을 수 있는 문구로 만든다. */
function describePendingAction(
  enemy: BattleEnemyState,
  pending: BattleSession["pending_enemy_actions"][number] | undefined,
  participantsById: Map<number, BattleParticipant>,
  environmentsById: Map<number, BattleSessionEnvironment>,
): string | null {
  if (!pending) return null;
  if (pending.kind === "none" || pending.skill_index == null) return "예고: 무반응";
  const skill = enemy.skills[pending.skill_index];
  if (!skill) return null;
  if (pending.kind === "summon") {
    return `예고: ${skill.name} (소환 · ${skill.summon_name ?? "???"} x${skill.summon_count ?? 1})`;
  }
  const isAoe = isEnemySkillAoe(skill);
  const targetLabel = isAoe
    ? "전원"
    : pending.target_character_ids
        .map((id) => participantsById.get(id)?.name)
        .filter((name): name is string => Boolean(name))
        .join(", ") || "대상 없음";
  if (skill.skill_type === "지속 디버프") return `예고: ${skill.name} → ${targetLabel} (지속 디버프)`;
  if (skill.skill_type === "환경") {
    const environmentName = skill.environment_id != null
      ? environmentsById.get(skill.environment_id)?.name ?? `환경 #${skill.environment_id}`
      : "환경";
    return `예고: ${skill.name} → ${targetLabel} (${environmentName} +${skill.environment_stack_count ?? 1}스택)`;
  }
  const base = Math.floor((enemy.attack * skill.damage_percent) / 100);
  return `예고: ${skill.name} → ${targetLabel} (예상 피해 ${fmt(base)})`;
}

interface TargetOption {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

/** 갈무리(고정폭 픽셀 글꼴)에서 한글은 한 칸, 영문·숫자·기호는 반 칸을 차지한다.
 *  글자 수가 아니라 실제 차지하는 폭으로 재야 "라 카드리 오즈벡 (MP 부족)"처럼 한글과
 *  괄호가 섞인 이름의 길이를 맞게 판단한다. */
function labelWidthEm(label: string): number {
  let em = 0;
  for (const char of label) em += /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u4E00-\u9FFF]/.test(char) ? 1 : 0.5;
  return em;
}

/** 대상 이름이 길수록 글자를 줄인다. 카드가 좁아 긴 이름은 그대로 두면 넘치는데, 이름은
 *  누구를 고른 건지 알려주는 정보라 잘라내는 대신 줄여서 전부 보여준다. 그래도 넘칠 만큼
 *  긴 이름은 마지막 수단으로 줄바꿈된다(break-words). */
function targetLabelSizeClass(label: string): string {
  const em = labelWidthEm(label);
  if (em <= 7) return "text-[11px]";
  if (em <= 9) return "text-[10px]";
  if (em <= 11) return "text-[9px]";
  return "text-[8px]";
}

function SkillTargetPicker({ values, options, onChange, count, editingClassName, onOpenChange }: {
  values: string[]; options: TargetOption[]; onChange: (keys: string[]) => void; count: number;
  editingClassName?: string; onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const required = Math.min(count, options.length);
  function setPickerOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }
  const selectedLabel = values.length
    ? options.filter((option) => values.includes(option.key)).map((option) => option.label).join(", ")
    : "";
  return <>
    <Button variant="outline" className={cn("h-auto min-h-8 w-full whitespace-normal break-words px-2 py-1 text-left leading-tight",
      selectedLabel ? targetLabelSizeClass(selectedLabel) : "text-[11px]", editingClassName)} onClick={() => {
      setSelection(values.filter((key) => options.some((option) => option.key === key)).slice(0, required));
      setPickerOpen(true);
    }}>{selectedLabel || "대상 선택"}</Button>
    {open && <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/50 p-4" onClick={() => setPickerOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="기술 적용 대상 선택" className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-line bg-surface p-4" onClick={(event) => event.stopPropagation()}>
        <p className="mb-3 text-sm font-semibold">기술 적용 인원: {count}명 · 선택 {selection.length}/{required}명</p>
        {required < count && <p className="mb-3 text-xs text-muted">선택 가능한 대상 {required}명에게 적용합니다.</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{options.map((option) => {
          const checked = selection.includes(option.key);
          return <button key={option.key} type="button" aria-pressed={checked} disabled={!checked && selection.length >= required}
            className={cn("rounded-lg border border-line p-2 text-sm disabled:opacity-40", checked && "border-gold bg-gold/15 text-gold")}
            onClick={() => setSelection((prev) => checked ? prev.filter((key) => key !== option.key) : [...prev, option.key])}>{option.label}</button>;
        })}</div>
        <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setPickerOpen(false)}>취소</Button>
          <Button disabled={required === 0 || selection.length !== required} onClick={() => { onChange(selection); setPickerOpen(false); }}>선택 완료</Button></div>
      </div>
    </div>}
  </>;
}

/** 대상 지정 UI. 드롭다운 대신 중앙 팝업으로 대상 목록을 보여준다. */
function TargetPickerButton({
  value,
  options,
  onChange,
  placeholder,
  title,
  editingClassName,
  onOpenChange,
}: {
  value: string | null;
  options: TargetOption[];
  onChange: (key: string) => void;
  placeholder: string;
  title: string;
  editingClassName?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.key === value) ?? null;
  const sortedOptions = [...options].sort((a, b) => (
    typeof a.label === "string" && typeof b.label === "string"
      ? a.label.localeCompare(b.label, "ko")
      : 0
  ));
  function setPickerOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className={cn(
          "flex h-auto min-h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-ivory transition focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent",
          typeof selected?.label === "string" ? targetLabelSizeClass(selected.label) : "text-[11px]",
          editingClassName,
        )}
      >
        <span className={cn("flex min-w-0 items-center gap-1.5", !selected && "text-muted")}>
          {selected?.icon}
          <span className="min-w-0 break-words text-left leading-tight">{selected ? selected.label : placeholder}</span>
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-110 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl border border-line bg-surface p-3 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
            {options.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted">대상이 없습니다.</p>
            ) : (
              <div className="grid grid-cols-5 gap-1.5">
                {sortedOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => {
                      onChange(option.key);
                      setPickerOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      option.key === value ? "bg-gold/15 text-gold" : "text-ivory hover:bg-inset",
                      option.disabled && "pointer-events-none opacity-40",
                    )}
                  >
                    {option.icon}
                    <span className="min-w-0 flex-1 wrap-break-word">{option.label}</span>
                    {option.key === value && <Check size={14} className="shrink-0 text-gold" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function BattleArena({ sessionId, readOnly = false, onExit, externalSession, draftPreview: externalDraftPreview }: Props) {
  const { member } = useAuth();
  const isAdmin = member != null && isAdminRole(member.role);
  const showLogFormulas = isAdmin;
  const { confirm } = useDialog();
  const { toast } = useToast();
  const controlled = externalSession !== undefined;
  const [internalSession, setSession] = useState<BattleSession | null>(null);
  const sessionRef = useRef<BattleSession | null>(null);
  const [socketVersion, setSocketVersion] = useState<string | null>(null);
  const session = externalSession !== undefined ? externalSession : internalSession;
  const [ownDraftPreview, setOwnDraftPreview] = useState<BattleDraftPreview | null>(null);
  const [remoteEditing, setRemoteEditing] = useState<Record<string, RemoteEditingState>>({});
  const [localEditing, setLocalEditing] = useState<Record<string, Pick<BattleEditingState, "input_id" | "field">>>({});
  const editingCloseTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const draftPreview = controlled ? (externalDraftPreview ?? null) : ownDraftPreview;
  const [loading, setLoading] = useState(!controlled);
  const [submitting, setSubmitting] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const [savingPairs, setSavingPairs] = useState(false);
  const savingPairsRef = useRef(false);

  const [charDrafts, setCharDrafts] = useState<Record<number, CharDraft>>({});
  const [bulkActionKind, setBulkActionKind] = useState<CharacterActionKind>("attack");
  const [telegraphDrafts, setTelegraphDrafts] = useState<Record<number, TelegraphDraft>>({});
  const [itemsByCharacter, setItemsByCharacter] = useState<Record<number, CharacterOwnedItem[]>>({});
  const itemsLoadPromiseRef = useRef<Promise<void> | null>(null);
  const itemsLoadedRef = useRef(false);
  const itemsLoadVersionRef = useRef(0);
  const activeSkillSourceKey = session?.participants
    .map((p) => `${p.character_id}:${p.pair_source_character_id ?? p.character_id}`).join(",") ?? "";
  const activeSkillLoadoutKey = `${sessionId}:${activeSkillSourceKey}`;
  const [loadedSkills, setLoadedSkills] = useState<{ key: string; skills: Record<number, BattleActiveSkill[]> } | null>(null);
  const skillsByCharacter = loadedSkills?.key === activeSkillLoadoutKey ? loadedSkills.skills : EMPTY_BATTLE_SKILLS;
  const skillsReady = readOnly || loadedSkills?.key === activeSkillLoadoutKey;
  const [participantSort, setParticipantSort] = useState<ParticipantSort>("attention");

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCandidates, setJoinCandidates] = useState<Character[]>([]);
  const [joinCharacterId, setJoinCharacterId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [enemyJoinOpen, setEnemyJoinOpen] = useState(false);
  const [enemyJoinCandidates, setEnemyJoinCandidates] = useState<Enemy[]>([]);
  const [joinEnemyId, setJoinEnemyId] = useState<string | null>(null);
  const [joiningEnemy, setJoiningEnemy] = useState(false);

  // controlled 모드(러너 관전 화면)에서는 부모가 이미 소켓을 갖고 있으므로 여기서는 연결하지 않는다.
  const { connected: battleSocketConnected, send: sendBattleWs, clientId: battleClientId } = useBattleSocket(!controlled ? session?.id ?? null : null, (msg) => {
    if (msg.type === "battle_update") {
      if (!applyBattleSession(msg.session, msg.draft)) return;
      setSocketVersion(msg.session.updated_at);
      setOwnDraftPreview(msg.preview);
    } else if (msg.type === "battle_deleted") {
      onExit();
    } else if (msg.version !== sessionRef.current?.updated_at) {
      return;
    } else if (msg.type === "draft_preview") {
      setOwnDraftPreview(msg.draft);
    } else if (msg.type === "editing_state" && msg.editor_client_id !== battleClientId) {
      const key = `${msg.editor_client_id}:${msg.input_id}`;
      setRemoteEditing((previous) => {
        if (!msg.active) {
          if (!(key in previous)) return previous;
          const next = { ...previous };
          delete next[key];
          return next;
        }
        return { ...previous, [key]: { ...msg, updatedAt: Date.now() } };
      });
    } else if (msg.type === "draft_patch") {
      if (msg.draft_type === "character") {
        setCharDrafts((previous) => {
          const draft = previous[msg.entity_id];
          if (!draft) return previous;
          return { ...previous, [msg.entity_id]: { ...draft, ...(msg.patch as Partial<CharDraft>) } };
        });
      } else {
        setTelegraphDrafts((previous) => {
          const draft = previous[msg.entity_id];
          if (!draft) return previous;
          return { ...previous, [msg.entity_id]: { ...draft, ...(msg.patch as Partial<TelegraphDraft>) } };
        });
      }
    }
  });

  useEffect(() => {
    const states = Object.values(remoteEditing);
    if (states.length === 0) return;
    const nextExpiry = Math.min(...states.map((state) => state.updatedAt + EDITING_STATE_TTL_MS));
    const timer = setTimeout(() => {
      const expiresBefore = Date.now() - EDITING_STATE_TTL_MS;
      setRemoteEditing((previous) => Object.fromEntries(
        Object.entries(previous).filter(([, state]) => state.updatedAt > expiresBefore),
      ));
    }, Math.max(0, nextExpiry - Date.now()));
    return () => clearTimeout(timer);
  }, [remoteEditing]);

  const syncDraftsFromBattle = useEffectEvent((data: BattleSession) => {
    applyBattleSession(data);
  });

  function updateEditingState(inputId: string, field: BattleEditingState["field"], active: boolean) {
    if (!isAdmin || controlled) return;
    const key = `${field}:${inputId}`;
    const closeTimer = editingCloseTimersRef.current[key];
    if (closeTimer) {
      clearTimeout(closeTimer);
      delete editingCloseTimersRef.current[key];
    }
    if (!active) {
      editingCloseTimersRef.current[key] = setTimeout(() => {
        setLocalEditing((previous) => {
          if (!(key in previous)) return previous;
          const next = { ...previous };
          delete next[key];
          return next;
        });
        sendBattleWs({ type: "editing_state", version: session?.updated_at, input_id: inputId, field, active: false });
        delete editingCloseTimersRef.current[key];
      }, EDITING_INDICATOR_GRACE_MS);
      return;
    }
    setLocalEditing((previous) => {
      return { ...previous, [key]: { input_id: inputId, field } };
    });
    sendBattleWs({ type: "editing_state", version: session?.updated_at, input_id: inputId, field, active: true });
  }

  useEffect(() => () => {
    for (const timer of Object.values(editingCloseTimersRef.current)) clearTimeout(timer);
  }, []);

  useEffect(() => {
    const inputs = Object.values(localEditing);
    if (inputs.length === 0 || !isAdmin || controlled) return;
    const timer = setInterval(() => {
      for (const input of inputs) {
        sendBattleWs({ type: "editing_state", version: session?.updated_at, ...input, active: true });
      }
    }, EDITING_STATE_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [localEditing, isAdmin, controlled, sendBattleWs, session?.updated_at]);

  useEffect(() => {
    if (controlled) return; // 부모가 세션을 직접 공급하는 모드에서는 자체 조회를 하지 않는다.
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const data = await fetchBattle(sessionId);
        if (cancelled) return;
        syncDraftsFromBattle(data);
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : "전투 조회 실패", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sessionId, toast, controlled]);

  // 관전(readOnly) 화면은 아무도 행동을 제출하지 않으므로, 라운드 진행 상황을 놓치지 않도록 주기적으로 다시 불러온다.
  // (부모가 세션을 공급하는 controlled 모드에서는 부모가 이미 폴링하므로 중복 폴링을 하지 않는다.)
  useEffect(() => {
    if (!readOnly || controlled || battleSocketConnected || session?.status !== "in_progress") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function poll() {
      if (cancelled) return;
      if (document.visibilityState === "hidden") {
        timer = setTimeout(() => void poll(), 6000 + Math.random() * 2000);
        return;
      }
      try {
        const data = await fetchBattle(sessionId);
        if (!cancelled) syncDraftsFromBattle(data);
      } catch {
        // 폴링 실패는 조용히 무시하고 다음 주기에 다시 시도한다.
      } finally {
        if (!cancelled) timer = setTimeout(() => void poll(), 6000 + Math.random() * 2000);
      }
    }
    timer = setTimeout(() => void poll(), 6000 + Math.random() * 2000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [readOnly, sessionId, controlled, battleSocketConnected, session?.status]);

  const activeSkillParticipantKey = session?.participants
    .map((participant) => participant.character_id)
    .join(",") ?? "";
  const activeSkillSessionId = session?.id ?? null;
  const activeSkillStatus = session?.status;

  useEffect(() => {
    if (session?.mode === "real" && session.status !== "in_progress") invalidateBattleCharacterCache();
  }, [session?.id, session?.mode, session?.status]);

  useEffect(() => {
    if (readOnly || activeSkillSessionId == null || activeSkillStatus !== "in_progress") return;
    const sessionId = activeSkillSessionId;
    let cancelled = false;

    async function loadSkills() {
      try {
        const participantIds = activeSkillParticipantKey
          .split(",")
          .filter(Boolean)
          .map(Number);
        const loaded = await fetchBattleActiveSkills(sessionId, participantIds, activeSkillSourceKey);
        if (!cancelled) setLoadedSkills({ key: activeSkillLoadoutKey, skills: loaded.skills_by_character });
      } catch {
        if (!cancelled) setLoadedSkills({ key: activeSkillLoadoutKey, skills: {} });
      }
    }

    void loadSkills();
    return () => { cancelled = true; };
  }, [readOnly, activeSkillSessionId, activeSkillStatus, activeSkillParticipantKey, activeSkillSourceKey, activeSkillLoadoutKey]);

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
        if (!kinds.includes(draft.kind) || (draft.kind === "heal" && participant.mp < 1)) {
          next[participant.character_id] = {
            ...draft,
            kind: defaultCharKind(participant.faction, participant.mp),
            skill_node_id: firstBattleSkillId(affordableBattleSkills(battleSkills, participant)),
          };
          changed = true;
          continue;
        }
        if (
          draft.kind === "defend"
          && draft.protect_target_character_id != null
          && draft.protect_target_character_id !== participant.character_id
          && participant.mp < 1
        ) {
          next[participant.character_id] = { ...draft, protect_target_character_id: participant.character_id };
          changed = true;
          continue;
        }
        if (draft.kind !== "skill") continue;
        const affordable = affordableBattleSkills(battleSkills, participant);
        if (affordable.length === 0) {
          next[participant.character_id] = {
            ...draft,
            kind: defaultCharKind(participant.faction, participant.mp),
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

  // 관리자가 아군 턴 행동 초안을 편집할 때마다, 확정 전 미리보기로 러너에게 실시간 중계한다.
  useEffect(() => {
    if (readOnly || controlled || !session || session.phase !== "ally"
      || !battleSocketConnected || socketVersion !== session.updated_at) return;
    const timer = setTimeout(() => {
      const draft: BattleDraftPreview = {};
      for (const [characterIdKey, charDraft] of Object.entries(charDrafts)) {
        const characterId = Number(characterIdKey);
        const actor = session.participants.find((p) => p.character_id === characterId);
        if (!actor) continue;
        const skill = charDraft.kind === "skill" && charDraft.skill_node_id != null
          ? (skillsByCharacter[characterId] ?? []).find((s) => s.id === charDraft.skill_node_id) ?? null
          : null;
        const item = charDraft.kind === "item" && charDraft.item_id != null
          ? (itemsByCharacter[characterId] ?? []).find((i) => i.item_id === charDraft.item_id) ?? null
          : null;
        // 기술/아이템 조회가 끝나기 전의 빈 정보로 다른 운영자의 미리보기를 덮지 않는다.
        if (charDraft.kind === "skill" && !skill) continue;
        if (charDraft.kind === "item" && charDraft.item_id != null && !item) continue;
        draft[characterId] = {
          kind: charDraft.kind,
          skill_node_id: charDraft.skill_node_id,
          skill_name: skill?.display_name ?? null,
          skill_image_url: skill?.image_url ?? null,
          item_id: charDraft.item_id,
          item_name: item?.item_name ?? null,
          item_image_url: item?.item_image_url ?? null,
          target_character_id: charDraft.target_character_id,
          protect_target_character_id: charDraft.protect_target_character_id,
          target_names: draftTargetNames(actor, charDraft, skill, session),
        };
      }
      sendBattleWs({ type: "draft_update", version: session.updated_at, draft, sources: charDrafts });
    }, 300);
    return () => clearTimeout(timer);
  }, [charDrafts, readOnly, controlled, session, skillsByCharacter, itemsByCharacter, sendBattleWs, battleSocketConnected, socketVersion]);

  function resetCharDrafts(data: BattleSession, patches: BattleDraftSnapshot["character"] = {}) {
    const next: Record<number, CharDraft> = {};
    for (const p of data.participants) {
      if (!isTargetable(p, data.round)) continue;
      const battleSkills = skillsByCharacter[p.character_id] ?? [];
      next[p.character_id] = {
        kind: defaultCharKind(p.faction, p.mp),
        skill_node_id: firstBattleSkillId(affordableBattleSkills(battleSkills, p)),
        target_enemy_id: data.enemies.find((enemy) => isEnemyTargetable(enemy, data.round))?.enemy_id ?? null,
        target_character_id: p.character_id,
        protect_target_character_id: p.character_id,
        item_id: null,
        ...(patches[p.character_id] as Partial<CharDraft>),
      };
    }
    setCharDrafts(next);
  }

  function resetTelegraphDrafts(data: BattleSession, patches: BattleDraftSnapshot["enemy"] = {}) {
    const next: Record<number, TelegraphDraft> = {};
    for (const enemy of data.enemies) {
      if (enemy.hp <= 0 || enemy.joined_round === data.round) continue;
      const saved = patches[enemy.enemy_id] as Partial<TelegraphDraft & TelegraphActionDraft> | undefined;
      const count = enemy.action_count ?? 1;
      next[enemy.enemy_id] = {
        actions: Array.from({ length: count }, (_, index) => {
          const restored = saved?.actions?.[index] ?? (index === 0 && saved?.kind ? saved : undefined);
          return {
            kind: "none",
            skill_index: null,
            target_character_ids: [],
            ...restored,
          };
        }),
      };
    }
    setTelegraphDrafts(next);
  }

  // REST 응답과 소켓 갱신 모두 같은 경로를 거친다. 같은 응답을 두 번 받아도
  // 이미 편집하기 시작한 새 턴의 초안을 다시 초기화하지 않는다.
  function applyBattleSession(data: BattleSession, snapshot?: BattleDraftSnapshot): boolean {
    const previous = sessionRef.current;
    if (previous?.id === data.id && previous.updated_at > data.updated_at) return false;
    const changed = previous?.id !== data.id || previous.updated_at !== data.updated_at;
    const formationOnly = changed && previous != null && sameBattleCombatState(previous, data);
    if (changed) {
      sessionRef.current = data;
      setSession(data);
    }
    if (changed && !formationOnly) {
      invalidateAvailableItems();
      setOwnDraftPreview(null);
      setRemoteEditing({});
      setLocalEditing({});
      for (const timer of Object.values(editingCloseTimersRef.current)) clearTimeout(timer);
      editingCloseTimersRef.current = {};
    }
    if ((changed && !formationOnly) || snapshot !== undefined) {
      resetCharDrafts(data, snapshot?.character);
      resetTelegraphDrafts(data, snapshot?.enemy);
    }
    return true;
  }

  function patchChar(characterId: number, patch: Partial<CharDraft>) {
    setCharDrafts((prev) => ({ ...prev, [characterId]: { ...prev[characterId], ...patch } }));
    if (isAdmin && !controlled) {
      sendBattleWs({ type: "draft_patch", version: session?.updated_at, draft_type: "character", entity_id: characterId, patch });
    }
  }

  function patchTelegraph(enemyId: number, patch: Partial<TelegraphDraft>) {
    setTelegraphDrafts((prev) => ({ ...prev, [enemyId]: { ...prev[enemyId], ...patch } }));
    if (isAdmin && !controlled) {
      sendBattleWs({ type: "draft_patch", version: session?.updated_at, draft_type: "enemy", entity_id: enemyId, patch });
    }
  }

  function patchTelegraphAction(enemyId: number, index: number, patch: Partial<TelegraphActionDraft>) {
    const draft = telegraphDrafts[enemyId];
    if (!draft) return;
    patchTelegraph(enemyId, { actions: draft.actions.map((action, i) => i === index ? { ...action, ...patch } : action) });
  }

  function moveTelegraphAction(enemyId: number, index: number, offset: number) {
    const actions = [...telegraphDrafts[enemyId].actions];
    [actions[index], actions[index + offset]] = [actions[index + offset], actions[index]];
    patchTelegraph(enemyId, { actions });
  }

  function toggleTelegraphTarget(enemyId: number, actionIndex: number, characterId: number, maxCount: number) {
    const draft = telegraphDrafts[enemyId]?.actions[actionIndex];
    if (!draft) return;
    const exists = draft.target_character_ids.includes(characterId);
    if (!exists && draft.target_character_ids.length >= maxCount) return;
    const target_character_ids = exists
      ? draft.target_character_ids.filter((id) => id !== characterId)
      : [...draft.target_character_ids, characterId];
    patchTelegraphAction(enemyId, actionIndex, { target_character_ids });
  }

  function invalidateAvailableItems() {
    itemsLoadVersionRef.current += 1;
    itemsLoadedRef.current = false;
    itemsLoadPromiseRef.current = null;
    setItemsByCharacter({});
  }

  async function ensureItemsLoaded() {
    if (!session || itemsLoadedRef.current) return;
    if (itemsLoadPromiseRef.current) return itemsLoadPromiseRef.current;

    const loadVersion = itemsLoadVersionRef.current;
    const load = fetchBattleAvailableItems(session.id)
      .then((result) => {
        if (itemsLoadVersionRef.current !== loadVersion) return;
        setItemsByCharacter(result.items_by_character);
        itemsLoadedRef.current = true;
      })
      .catch(() => {
        if (itemsLoadVersionRef.current !== loadVersion) return;
        setItemsByCharacter({});
      })
      .finally(() => {
        if (itemsLoadVersionRef.current === loadVersion) itemsLoadPromiseRef.current = null;
      });
    itemsLoadPromiseRef.current = load;
    return load;
  }

  const hasItemDraft = Object.values(charDrafts).some((draft) => draft.kind === "item");
  const loadDraftItems = useEffectEvent(() => { void ensureItemsLoaded(); });
  useEffect(() => {
    if (!readOnly && hasItemDraft) loadDraftItems();
  }, [readOnly, hasItemDraft, session?.updated_at]);

  function applyBulkCharacterAction() {
    if (!session) return;
    const hasDowned = session.participants.some((p) => p.downed);
    for (const [characterId, draft] of Object.entries(charDrafts)) {
      const numericCharacterId = Number(characterId);
      const p = participantsById.get(numericCharacterId);
      const battleSkills = skillsByCharacter[numericCharacterId] ?? [];
      if (!p || !allowedKinds(p, hasDowned, battleSkills.length > 0).includes(bulkActionKind)) continue;
      const affordableSkills = affordableBattleSkills(battleSkills, p);
      if (bulkActionKind === "skill" && affordableSkills.length === 0) continue;
      patchChar(numericCharacterId, {
        kind: bulkActionKind,
        skill_target_keys: [],
        skill_node_id: bulkActionKind === "skill" ? firstBattleSkillId(affordableSkills) : draft.skill_node_id,
        target_character_id: bulkActionKind === "skill" ? numericCharacterId : draft.target_character_id,
        protect_target_character_id: bulkActionKind === "defend" ? numericCharacterId : draft.protect_target_character_id,
        item_id: bulkActionKind === "item" ? draft.item_id : null,
      });
    }
    if (bulkActionKind === "item") {
      void ensureItemsLoaded();
    }
  }

  async function handleSubmitTelegraph() {
    if (!session) return;
    const actingEnemies = session.enemies.filter((enemy) => isEnemyTargetable(enemy, session.round));
    for (const enemy of actingEnemies) {
      const actions = telegraphDrafts[enemy.enemy_id]?.actions ?? [];
      if (actions.length !== (enemy.action_count ?? 1) || (enemy.skills.length > 0 && actions.some((action) => action.skill_index == null))) {
        toast(`${enemy.name}: 행동횟수에 맞춰 스킬 ${enemy.action_count ?? 1}개를 순서대로 선택해 주세요.`, "error");
        return;
      }
    }
    const enemyActions: BattleEnemyActionInput[] = actingEnemies.flatMap((enemy) =>
      telegraphDrafts[enemy.enemy_id].actions.map((draft) => ({
        enemy_id: enemy.enemy_id,
        kind: draft.kind,
        skill_index: draft.skill_index ?? undefined,
        target_character_ids: draft.target_character_ids,
      })),
    );
    try {
      setSubmitting(true);
      const updated = await submitBattleTelegraph(session.id, enemyActions);
      applyBattleSession(updated);
    } catch (e) {
      toast(e instanceof Error ? e.message : "적의 행동 암시 진행 실패", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitAllyTurn() {
    if (!session || !skillsReady || savingPairs) return;
    const characterActions: BattleCharacterActionInput[] = Object.entries(charDrafts).map(([id, draft]) => {
      const characterId = Number(id);
      // 기술 대상이 SELF인 기술은 대상을 고르지 않고 시전자 본인으로 자동 지정한다.
      const skill = draft.kind === "skill" ? resolveSelectedSkill(characterId, draft.skill_node_id) : null;
      const selfTargeted = skill != null && getBattleSkillTargetMode(skill) === "self";
      const autoTargeted = skill != null && AUTO_ALLY_TARGET_SKILL_NAMES.has(skill.default_name);
      return {
        character_id: characterId,
        kind: draft.kind,
        skill_node_id: draft.kind === "skill" ? (draft.skill_node_id ?? undefined) : undefined,
        skill_target_keys: draft.kind !== "skill" || autoTargeted
          ? undefined
          : (selfTargeted ? [`ally:${characterId}`] : draft.skill_target_keys),
        target_enemy_id: draft.target_enemy_id ?? undefined,
        target_character_id: selfTargeted ? characterId : draft.target_character_id ?? undefined,
        protect_target_character_id: draft.kind === "defend" ? (draft.protect_target_character_id ?? undefined) : undefined,
        item_id: draft.item_id ?? undefined,
      };
    });
    try {
      setSubmitting(true);
      const updated = await submitBattleAllyTurn(session.id, characterActions);
      applyBattleSession(updated);
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
      applyBattleSession(updated);
    } catch (e) {
      toast(e instanceof Error ? e.message : "에너미 턴 진행 실패", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUndoTurn() {
    const previous = session ? describePreviousTurn(session) : null;
    if (!session || !previous) return;
    const ok = await confirm({
      title: "이전 턴 다시 진행하기",
      description: `${previous}의 로그가 사라지고, 그 턴을 다시 진행할 수 있는 상태로 되돌립니다.`,
      confirmText: "되돌리기",
      tone: "danger",
    });
    if (!ok) return;
    try {
      setUndoing(true);
      const updated = await undoLastBattleTurn(session.id);
      applyBattleSession(updated);
    } catch (e) {
      toast(e instanceof Error ? e.message : "턴 되돌리기 실패", "error");
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
      applyBattleSession(updated);
      toast("전투가 조기 종료되었습니다.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "전투 종료 실패", "error");
    } finally {
      setTerminating(false);
    }
  }

  async function handleCopyTurnLog(round: number, entry: BattleSession["log"][number]) {
    const label = entry.phase ? PHASE_LABEL[entry.phase] : `라운드 ${round}`;
    try {
      await navigator.clipboard.writeText(entry.events.join("\n"));
      toast(`${label} 로그를 복사했습니다.`, "success");
    } catch {
      toast("로그 복사에 실패했습니다.", "error");
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
      applyBattleSession(updated);
      setJoinOpen(false);
      setJoinCharacterId(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "난입 실패", "error");
    } finally {
      setJoining(false);
    }
  }

  async function handlePairSwap(sourceId: number, targetId: number) {
    const current = sessionRef.current;
    if (!current?.pair_battle || current.status !== "in_progress" || readOnly || savingPairsRef.current) return;
    const next = swapBattlePairMembers(current.pairs, sourceId, targetId);
    if (next === current.pairs) return;
    savingPairsRef.current = true;
    setSavingPairs(true);
    try {
      const updated = await updateBattlePairs(current.id, next);
      applyBattleSession(updated);
      toast("페어 매칭을 변경했습니다.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "페어 변경 실패", "error");
    } finally {
      savingPairsRef.current = false;
      setSavingPairs(false);
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
      applyBattleSession(updated);
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

  const effectiveParticipantSort: ParticipantSort = isAdmin ? participantSort : "hp";
  const sortedParticipants = useMemo(() => {
    const participants = session?.participants ?? [];
    return participants.toSorted((a, b) => {
      if (effectiveParticipantSort === "attention") return b.attn - a.attn || a.name.localeCompare(b.name, "ko");
      if (effectiveParticipantSort === "hp") return a.hp / Math.max(1, a.max_hp) - b.hp / Math.max(1, b.max_hp) || a.name.localeCompare(b.name, "ko");
      if (effectiveParticipantSort === "position") return factionRank(a.faction) - factionRank(b.faction) || a.name.localeCompare(b.name, "ko");
      return a.name.localeCompare(b.name, "ko");
    });
  }, [session?.participants, effectiveParticipantSort]);

  const editingFieldByInputId = useMemo(() => {
    const fields = new Map<string, BattleEditingState["field"]>();
    for (const state of Object.values(remoteEditing)) fields.set(state.input_id, state.field);
    return fields;
  }, [remoteEditing]);

  function editingClassName(inputId: string, field: BattleEditingState["field"]) {
    if (editingFieldByInputId.get(inputId) !== field) return "";
    return field === "action"
      ? "border-red-500 ring-1 ring-red-500/50"
      : "border-sky-500 ring-1 ring-sky-500/50";
  }

  const participantsById = useMemo(
    () => new Map((session?.participants ?? []).map((participant) => [participant.character_id, participant])),
    [session?.participants],
  );
  /** 캐릭터 카드와 같은 규칙으로 이 캐릭터가 사용할 기술을 찾는다. */
  const resolveSelectedSkill = useCallback((characterId: number, skillNodeId: number | null) => {
    const participant = participantsById.get(characterId);
    if (!participant) return null;
    const affordable = affordableBattleSkills(skillsByCharacter[characterId] ?? [], participant);
    return (skillNodeId != null ? affordable.find((skill) => skill.id === skillNodeId) : null) ?? affordable[0] ?? null;
  }, [participantsById, skillsByCharacter]);
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
  const pendingActionsByEnemy = useMemo(() => {
    const grouped = new Map<number, BattleSession["pending_enemy_actions"]>();
    for (const action of session?.pending_enemy_actions ?? []) {
      const actions = grouped.get(action.enemy_id) ?? [];
      actions.push(action);
      grouped.set(action.enemy_id, actions);
    }
    return grouped;
  }, [session?.pending_enemy_actions]);
  const environmentsById = useMemo(
    () => new Map((session?.environments ?? []).map((environment) => [environment.id, environment])),
    [session?.environments],
  );
  const enemyTitle = useMemo(
    () => (session?.enemies ?? []).map((enemy) => enemy.name).join(", "),
    [session?.enemies],
  );
  const rewardCardSession = useMemo(
    () => ({
      id: session?.id ?? 0,
      mode: session?.mode ?? "practice",
      chapter: session?.chapter ?? null,
      status: session?.status ?? "in_progress",
      round: session?.round ?? 1,
      enemy_names: (session?.enemies ?? []).map((enemy) => enemy.name),
    }),
    [session?.chapter, session?.enemies, session?.id, session?.mode, session?.round, session?.status],
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
          {session.pair_battle && <Badge variant="outline"><Link2 size={12} className="mr-1" />페어 전투</Badge>}
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

      {readOnly && (
        <AlertBanner tone="success">
          {session.mode === "practice"
            ? inProgress
              ? "러너에게 보이는 관전 화면을 미리 확인하고 있습니다."
              : "완료된 모의전의 러너 관전 화면 미리보기입니다."
            : inProgress
              ? "실전 전투가 진행 중입니다. (관전 전용)"
              : "완료된 실전 전투 기록입니다. (읽기 전용)"}
        </AlertBanner>
      )}

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
          const enemyDraft = telegraphDrafts[enemy.enemy_id];
          const attackSkills = enemy.skills.map((s, i) => ({ ...s, index: i })).filter((s) => s.skill_type !== "소환");
          const summonSkills = enemy.skills.map((s, i) => ({ ...s, index: i })).filter((s) => s.skill_type === "소환");
          const pendingActions = !dead && phase !== "telegraph" ? pendingActionsByEnemy.get(enemy.enemy_id) ?? [] : [];
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
                <span className="font-num text-xs text-muted">공격력 {enemy.attack} · 행동 {enemy.action_count ?? 1}회</span>
              </div>
              <HpBar hp={enemy.hp} max={enemy.max_hp} color="bg-red-500" />
              {(enemy.status_effects?.length ?? 0) > 0 && (
                <StackBars items={statusEffectBarItems(enemy.status_effects ?? [])} className="mt-2" />
              )}

              {canAct && !dead && phase === "telegraph" && enemyDraft && (
                <div className="mt-3 flex flex-col gap-3">
                  <p className="text-xs text-muted">위에서 아래로 실행합니다. 소환은 암시 턴에 먼저 처리됩니다.</p>
                  {enemyDraft.actions.map((draft, actionIndex) => {
                    const selectedSkill = draft.skill_index != null ? enemy.skills[draft.skill_index] : null;
                    const needsManualTargets = draft.kind === "attack" && selectedSkill && (selectedSkill.manual_target_count || !isEnemySkillAoe(selectedSkill));
                    const targetCount = selectedSkill?.manual_target_count ? targetableParticipants.length : selectedSkill ? Math.max(1, selectedSkill.target_count) : 0;
                    const actionInputId = `enemy:${enemy.enemy_id}:action:${actionIndex}`;
                    return (
                      <div key={actionIndex} className="flex flex-col gap-2 rounded-lg border border-line p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-muted">{actionIndex + 1}번째 행동</span>
                          <Select
                            value={draft.kind === "none" ? (enemy.skills.length === 0 ? "none" : "") : `${draft.kind}:${draft.skill_index}`}
                            onOpenChange={(open) => updateEditingState(actionInputId, "action", open)}
                            onValueChange={(v) => {
                              if (v === "none") { patchTelegraphAction(enemy.enemy_id, actionIndex, { kind: "none", skill_index: null, target_character_ids: [] }); return; }
                              const [kind, idx] = v.split(":");
                              patchTelegraphAction(enemy.enemy_id, actionIndex, {
                                kind: kind as EnemyActionKind,
                                skill_index: Number(idx),
                                target_character_ids: autoTargetsForEnemySkill(enemy.skills[Number(idx)], targetableParticipants),
                              });
                            }}
                          >
                            <SelectTrigger aria-label={`${enemy.name} ${actionIndex + 1}번째 스킬`} className={cn("h-8 w-full sm:w-72 text-xs", editingClassName(actionInputId, "action"))}>
                              <SelectValue placeholder="사용할 스킬 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {enemy.skills.length === 0 && <SelectItem value="none">무반응</SelectItem>}
                                {attackSkills.map((s) => (
                                  <SelectItem key={s.index} value={`attack:${s.index}`}>
                                    {s.skill_type} · {s.name} ({s.manual_target_count ? "수동 지정" : isEnemySkillAoe(s) ? "전체" : `${s.target_count}인 · ${s.auto_target_mode === "random" ? "무작위" : "주목도 순"}`} / {s.skill_type === "지속 디버프"
                                      ? "지속 디버프"
                                      : s.skill_type === "환경"
                                        ? `${s.environment_id != null ? environmentsById.get(s.environment_id)?.name ?? `환경 #${s.environment_id}` : "환경"} +${s.environment_stack_count ?? 1}스택`
                                        : `${s.damage_percent}%`})
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
                          {enemyDraft.actions.length > 1 && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" disabled={actionIndex === 0} aria-label={`${enemy.name} ${actionIndex + 1}번째 행동 앞으로`} onClick={() => moveTelegraphAction(enemy.enemy_id, actionIndex, -1)}>앞으로</Button>
                              <Button size="sm" variant="outline" disabled={actionIndex === enemyDraft.actions.length - 1} aria-label={`${enemy.name} ${actionIndex + 1}번째 행동 뒤로`} onClick={() => moveTelegraphAction(enemy.enemy_id, actionIndex, 1)}>뒤로</Button>
                            </div>
                          )}
                        </div>

                        {needsManualTargets && (
                          <div className="rounded-lg border border-line bg-inset/60 p-2">
                            <p className="mb-1.5 text-[11px] text-muted">
                              {selectedSkill?.manual_target_count
                                ? `대상 수동 지정 · ${draft.target_character_ids.length}명 선택 (매 라운드 인원 변경 가능)`
                                : `${selectedSkill?.skill_type === "환경" ? "환경 부여" : selectedSkill?.skill_type === "지속 디버프" ? "약화" : "공격"} 대상 선택 (${draft.target_character_ids.length}/${targetCount}명)`}
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
                                      onCheckedChange={() => toggleTelegraphTarget(enemy.enemy_id, actionIndex, p.character_id, targetCount)}
                                    />
                                    {p.name}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {pendingActions.map((action, index) => (
                <div key={index} className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
                  <Megaphone size={12} className="shrink-0" />
                  <span>{index + 1}번째 · {describePendingAction(enemy, action, participantsById, environmentsById)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* 공용 하수인 */}
      {session.summons.length > 0 && (
        <div className="rounded-xl border border-line bg-inset p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">하수인 (공격 우선 대상)</p>
          <div className="grid grid-cols-5 gap-2">
            {session.summons.map((s) => (
              <div key={s.id} className="rounded-lg border border-line bg-surface px-3 py-2">
                <p className="mb-1 text-sm font-semibold text-ivory">{summonDisplayNames.get(s.id) ?? s.name}</p>
                {s.action_type && s.action_type !== "attack" && <p className="mb-1 text-xs text-muted">
                  {{ explosion: "폭발", debuff: "약화", buff: "강화" }[s.action_type]} · {s.trigger_phase === "telegraph" ? "암시 턴" : s.trigger_phase === "ally" ? "아군 턴" : "적 턴"} · {s.action_type === "explosion" ? "1회 발동 후 소멸" : "매 라운드 반복"}
                </p>}
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

      {isAdmin && !session.pair_battle && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs font-semibold text-muted">캐릭터 정렬</span>
          <div className="flex rounded-lg border border-line bg-inset p-1" role="group" aria-label="캐릭터 정렬">
            {PARTICIPANT_SORTS.map(({ value, label }) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={participantSort === value ? "default" : "ghost"}
                aria-pressed={participantSort === value}
                onClick={() => setParticipantSort(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* 캐릭터 그리드 */}
      {session.pair_battle && (
        <p className="text-xs leading-relaxed text-muted">
          페어 상대의 포지션·능력치·기술을 사용하며 아이템은 본인 보유분을 사용합니다.
          페어 변경 시 현재 HP·MP 비율을 유지하고 행동을 다시 선택합니다.
          실전 종료 시 남은 HP 비율을 본래 최대 HP에 적용하며 MP는 전부 회복합니다.
        </p>
      )}
      <BattlePairGrid
        characters={sortedParticipants.map((participant) => ({ id: participant.character_id, name: participant.name }))}
        pairs={session.pair_battle ? session.pairs : null}
        onSwap={canAct && session.pair_battle ? handlePairSwap : undefined}
        disabled={savingPairs}
      >
        {sortedParticipants.map((p) => {
          const draft = charDrafts[p.character_id];
          const active = isActive(p);
          const battleSkills = skillsByCharacter[p.character_id] ?? [];
          const affordableSkills = affordableBattleSkills(battleSkills, p);
          const items = itemsByCharacter[p.character_id] ?? [];
          const showActionUi = canAct && phase === "ally" && active && draft;
          const actionPreview = readOnly && phase === "ally" && active ? draftPreview?.[p.character_id] : undefined;
          const previewIcon = actionPreview?.kind === "skill"
            ? { name: actionPreview.skill_name ?? "기술", imageUrl: actionPreview.skill_image_url }
            : actionPreview?.kind === "item" && actionPreview.item_id != null
              ? { name: actionPreview.item_name ?? "아이템", imageUrl: actionPreview.item_image_url }
              : null;
          const kindOptions = allowedKinds(p, hasDowned, battleSkills.length > 0);
          const selectedSkill = draft?.skill_node_id != null
            ? affordableSkills.find((skill) => skill.id === draft.skill_node_id) ?? affordableSkills[0] ?? null
            : affordableSkills[0] ?? null;
          const selectedSkillTargetMode = draft?.kind === "skill" && selectedSkill
            ? getBattleSkillTargetMode(selectedSkill)
            : null;
          const actionInputId = `character:${p.character_id}:action`;
          // 선택된 행동 문구를 미리 만들어 대상 버튼과 같은 기준으로 글자 크기를 정한다.
          const selectedActionLabel = draft
            ? draft.kind === "skill" && selectedSkill
              ? selectedSkill.display_name
              : CHAR_ACTION_LABEL[draft.kind]
            : "";
          const targetInputId = `character:${p.character_id}:target`;
          const extraControls: { key: string; icon: LucideIcon; control: ReactNode }[] = [];

          if (draft?.kind === "skill" && selectedSkill && AUTO_ALLY_TARGET_SKILL_NAMES.has(selectedSkill.default_name)) {
            extraControls.push({
              key: "skill-target",
              icon: Sparkles,
              control: (
                <div className="flex h-8 w-full items-center rounded-lg border border-line bg-surface px-2.5 text-[11px] text-muted">
                  체력 낮은 순 {getBattleSkillTargetCount(selectedSkill)}명 자동 지정
                </div>
              ),
            });
          } else if (draft?.kind === "skill" && selectedSkillTargetMode === "self") {
            extraControls.push({
              key: "skill-target",
              icon: Sparkles,
              control: (
                <div className="flex h-8 w-full items-center rounded-lg border border-line bg-surface px-2.5 text-[11px] text-muted">
                  본인 자동 지정
                </div>
              ),
            });
          } else if (draft?.kind === "skill" && selectedSkill) {
            const multi = selectedSkillTargetMode === "enemy-multi" || selectedSkillTargetMode === "ally-multi";
            const count = multi ? getBattleSkillTargetCount(selectedSkill) : 1;
            const options: TargetOption[] = selectedSkillTargetMode?.startsWith("enemy")
              ? targetableEnemies.map((enemy) => ({ key: `enemy:${enemy.enemy_id}`, label: enemy.name }))
              : selectedSkillTargetMode === "none"
                ? [{ key: `ally:${p.character_id}`, label: "본인" }]
                : (
                  selectedSkill.category === "강화" || ACTIVE_ALLY_SKILL_NAMES.has(selectedSkill.default_name)
                    ? targetableParticipants
                    : healableParticipants
                )
                  .filter((target) => !SELF_EXCLUDED_SKILL_NAMES.has(selectedSkill.default_name) || target.character_id !== p.character_id)
                  .map((target) => ({ key: `ally:${target.character_id}`, label: `${target.name}${target.downed ? " (기절)" : ""}` }));
            extraControls.push({ key: "skill-target", icon: Sparkles, control:
              <SkillTargetPicker values={draft.skill_target_keys ?? []} options={options} count={count}
                editingClassName={editingClassName(targetInputId, "target")}
                onOpenChange={(open) => updateEditingState(targetInputId, "target", open)}
                onChange={(keys) => patchChar(p.character_id, { skill_target_keys: keys,
                  target_character_id: keys[0]?.startsWith("ally:") ? Number(keys[0].split(":")[1]) : p.character_id,
                  target_enemy_id: keys[0]?.startsWith("enemy:") ? Number(keys[0].split(":")[1]) : null,
                })} />,
            });
          } else if (draft && draft.kind === "attack" && targetableEnemies.length > 1) {
            extraControls.push({
              key: "enemy-target",
              icon: Skull,
              control: (
                <TargetPickerButton
                  title="공격 대상 선택"
                  placeholder="대상 선택"
                  value={draft.target_enemy_id != null ? String(draft.target_enemy_id) : null}
                  editingClassName={editingClassName(targetInputId, "target")}
                  onOpenChange={(open) => updateEditingState(targetInputId, "target", open)}
                  onChange={(value) => patchChar(p.character_id, { target_enemy_id: Number(value) })}
                  options={targetableEnemies.map((enemy) => ({ key: String(enemy.enemy_id), label: enemy.name }))}
                />
              ),
            });
          } else if (draft?.kind === "heal") {
            extraControls.push({
              key: "heal-target",
              icon: HeartPulse,
              control: (
                <TargetPickerButton
                  title="치유 대상 선택"
                  placeholder="대상 선택"
                  value={draft.target_character_id != null ? String(draft.target_character_id) : null}
                  editingClassName={editingClassName(targetInputId, "target")}
                  onOpenChange={(open) => updateEditingState(targetInputId, "target", open)}
                  onChange={(value) => patchChar(p.character_id, { target_character_id: Number(value) })}
                  options={healableParticipants.map((target) => ({
                    key: String(target.character_id),
                    label: `${target.name}${target.downed ? " (기절)" : ""}`,
                  }))}
                />
              ),
            });
          } else if (draft?.kind === "rescue") {
            extraControls.push({
              key: "rescue-target",
              icon: UserPlus,
              control: (
                <TargetPickerButton
                  title="구조 대상 선택"
                  placeholder="대상 선택"
                  value={draft.target_character_id != null ? String(draft.target_character_id) : null}
                  editingClassName={editingClassName(targetInputId, "target")}
                  onOpenChange={(open) => updateEditingState(targetInputId, "target", open)}
                  onChange={(value) => patchChar(p.character_id, { target_character_id: Number(value) })}
                  options={downedParticipants.map((target) => ({ key: String(target.character_id), label: target.name }))}
                />
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
                <TargetPickerButton
                  title="보호 대상 선택"
                  placeholder="대상 선택"
                  value={draft.protect_target_character_id != null ? String(draft.protect_target_character_id) : String(p.character_id)}
                  editingClassName={editingClassName(targetInputId, "target")}
                  onOpenChange={(open) => updateEditingState(targetInputId, "target", open)}
                  onChange={(value) => patchChar(p.character_id, { protect_target_character_id: Number(value) })}
                  options={targetableParticipants.map((target) => {
                    const isSelf = target.character_id === p.character_id;
                    const disabled = !isSelf && p.mp < 1;
                    return {
                      key: String(target.character_id),
                      label: isSelf ? "본인" : disabled ? `${target.name} (MP 부족)` : target.name,
                      disabled,
                    };
                  })}
                />
              ),
            });
          }

          const actionControls: { key: string; icon: LucideIcon; control: ReactNode }[] = [
            {
              key: "action",
              icon: ListChecks,
              control: (
                <Select
                  value={draft?.kind === "skill" && selectedSkill ? `skill:${selectedSkill.id}` : draft?.kind}
                  onOpenChange={(open) => updateEditingState(actionInputId, "action", open)}
                  onValueChange={(value) => {
                    const kind = (value.startsWith("skill:") ? "skill" : value) as CharacterActionKind;
                    const nextPatch: Partial<CharDraft> = {
                      kind,
                      item_id: kind === "item" ? draft?.item_id ?? null : null,
                      protect_target_character_id: kind === "defend" ? p.character_id : draft?.protect_target_character_id ?? p.character_id,
                    };
                    if (kind === "skill") {
                      nextPatch.skill_node_id = Number(value.slice("skill:".length));
                      nextPatch.skill_target_keys = [];
                      nextPatch.target_enemy_id = targetableEnemies[0]?.enemy_id ?? null;
                      nextPatch.target_character_id = p.character_id;
                    }
                    patchChar(p.character_id, nextPatch);
                    if (kind === "item") void ensureItemsLoaded();
                  }}
                >
                  <SelectTrigger className={cn("h-auto min-h-8 w-full [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:break-words [&>span]:text-left",
                    selectedActionLabel ? targetLabelSizeClass(selectedActionLabel) : "text-[11px]",
                    editingClassName(actionInputId, "action"))}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    <SelectGroup>
                      {kindOptions.map((kind) => {
                        if (kind === "skill" && affordableSkills.length > 0) return affordableSkills.map((skill) => (
                          <SelectItem key={`skill:${skill.id}`} value={`skill:${skill.id}`} className="whitespace-normal break-words">
                            {skill.display_name}
                          </SelectItem>
                        ));
                        const skillUnavailable = kind === "skill" && affordableSkills.length === 0;
                        const healUnavailable = kind === "heal" && p.mp < 1;
                        const unavailable = skillUnavailable || healUnavailable;
                        return (
                          <SelectItem key={kind} value={kind} disabled={unavailable}>
                            {skillUnavailable
                              ? "기술(MP 부족)"
                              : healUnavailable
                                ? "치유(MP 부족)"
                                : CHAR_ACTION_LABEL[kind]}
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

          // 표시할 배지를 먼저 모은다. 바깥 조건을 따로 적어 두면 안쪽 조건과 어긋나기 쉽고,
          // 그때 빈 컨테이너가 남아 space-y 간격만큼 카드가 혼자 높아진다.
          const statusBadges = [
            p.downed && <Badge key="downed" variant="destructive" className="text-[10px]">기절</Badge>,
            p.retreated && <Badge key="retreated" variant="secondary" className="text-[10px]">퇴각</Badge>,
            active && p.defending && phase === "enemy" && (
              <Badge key="defending" variant="outline" className="text-[10px]">
                <HeartPulse size={10} className="mr-0.5" />
                방어 중
                {p.protect_target != null && p.protect_target !== p.character_id
                  ? ` · ${participantsById.get(p.protect_target)?.name ?? ""} 보호`
                  : ""}
              </Badge>
            ),
            active && p.joined_round === session.round && (
              <Badge key="joined" variant="outline" className="text-[10px]">난입 · 이번 라운드 행동 불가</Badge>
            ),
          ].filter(Boolean);

          return (
            <div
              key={p.character_id}
              className={cn(
                "w-full rounded-2xl border p-2.5 transition-colors duration-200",
                !session.pair_battle && "max-w-[21rem]",
                !active
                  ? "border-line bg-primary-light/10 opacity-60"
                  : showActionUi
                    ? getCharacterCardTone(draft?.kind)
                    : actionPreview
                      ? getCharacterCardTone(actionPreview.kind)
                      : "border-line bg-surface",
              )}
            >
              <div className="space-y-2.5">
                <div className="flex gap-2.5">
                  <div className="flex w-16 shrink-0 flex-col gap-1.5 self-start">
                    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                      <CharacterAvatar
                        src={p.image_url}
                        alt={p.name}
                        className={cn("aspect-square w-full rounded-none", !active && "grayscale")}
                        iconSize={18}
                        sizes="64px"
                      />
                    </div>
                    {previewIcon && (
                      <div
                        className="skill-icon-glow aspect-square w-full overflow-hidden border border-line bg-surface"
                        title={previewIcon.name}
                      >
                        <CharacterAvatar
                          src={previewIcon.imageUrl}
                          alt={previewIcon.name}
                          className="aspect-square w-full rounded-none"
                          iconSize={16}
                          sizes="64px"
                        />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-2.5">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ivory">
                      <ParticipantFactionIcon faction={p.faction} />
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

                    {actionPreview && (
                      <div
                        className="flex items-center gap-1.5 rounded-full border border-dashed border-line/70 bg-surface/60 px-2 py-1 text-[11px] text-muted"
                        title="아직 확정되지 않은 행동입니다"
                      >
                        <span className="whitespace-normal break-words">
                          {previewActionLabel(actionPreview)}
                          {previewTargetSuffix(actionPreview)}
                        </span>
                      </div>
                    )}

                    <StackBars items={(p.environment_stacks ?? []).map((stack) => ({
                      key: String(stack.id),
                      label: stack.name,
                      count: stack.count,
                      color: stack.color,
                    }))} />

                    {statusBadges.length > 0 && (
                      <div className="flex flex-wrap gap-2">{statusBadges}</div>
                    )}

                    {p.status_effects != null && p.status_effects.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {displayStatusEffects(p.status_effects).map((effect, index) => {
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
                      actionControls.length >= 3 || actionControls.length === 2
                        ? "grid-cols-2 items-start"
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
                        {key !== "action" && <Icon className="h-3.5 w-3.5 shrink-0 text-muted" />}
                        {control}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </BattlePairGrid>

      {/* 진행 / 결과 */}
      {!inProgress ? (
        <div className="space-y-4">
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
          {isAdmin ? <BattleRewardCard session={rewardCardSession} /> : null}
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
            <Button onClick={handleSubmitAllyTurn} disabled={submitting || undoing || terminating || savingPairs || !skillsReady}>
              <Sparkles size={15} />
              {submitting ? "진행 중..." : !skillsReady ? "기술을 불러오는 중..." : `라운드 ${session.round} · 아군 턴 진행`}
            </Button>
          )}
          {phase === "enemy" && (
            <Button onClick={handleSubmitEnemyTurn} disabled={submitting || undoing || terminating}>
              <Swords size={15} />
              {submitting ? "진행 중..." : `라운드 ${session.round} · 에너미의 턴 진행`}
            </Button>
          )}
          {session.mode === "real" && describePreviousTurn(session) != null && (
            <Button
              variant="outline"
              onClick={handleUndoTurn}
              disabled={submitting || undoing || terminating}
            >
              <Undo2 size={15} />
              {undoing ? "되돌리는 중..." : "이전 턴 다시 진행하기"}
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
          {isAdmin ? <BattleRoundMetricsTable log={session.log} /> : null}
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">전투 로그</span>
          {[...groupedLog].reverse().map((group, groupIndex) => (
            <div key={group.round} className={cn("space-y-2", groupIndex > 0 && "border-t border-line pt-3")}>
              <div className="text-xs font-bold text-ivory/85">라운드 {group.round}</div>
              {[...group.entries].reverse().map((entry, entryIndex) => (
                <div key={entryIndex} className="space-y-1 pl-2">
                  <div className="flex items-center gap-1.5">
                    {entry.phase && (
                      <span className="text-[11px] font-semibold text-gold/90">{PHASE_LABEL[entry.phase]}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopyTurnLog(group.round, entry)}
                      className="text-muted transition-colors hover:text-gold"
                      title="이 턴 로그 복사"
                      aria-label="이 턴 로그 복사"
                    >
                      <Files size={12} />
                    </button>
                  </div>
                  {entry.events.map((e, i) => (
                    <div key={i} className="text-sm text-ivory/85">
                      <BattleLogEvent
                        event={showLogFormulas ? e : stripAttnInfo(e)}
                        previousEvent={entry.events[i - 1]}
                        session={session}
                        calculation={entry.calculations?.[e]}
                        showFormula={showLogFormulas}
                      />
                    </div>
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
