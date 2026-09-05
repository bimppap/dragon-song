"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Ambulance, CalendarClock, Eye, Flag, Heart, History, Image as ImageIcon, ListOrdered, PlayCircle, RotateCcw, Shield, Sparkles, Swords, Trash2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createBattle,
  deleteBattle,
  fetchActiveChapter,
  fetchBattles,
  fetchCharacters,
  fetchEnemies,
  fetchEnvironments,
  rollbackBattle,
  type BattleMode,
  type BattleSessionSummary,
  type Chapter,
  type Character,
  type Enemy,
  type Environment,
} from "@/lib/api";
import { useToast } from "@/components/common/ToastProvider";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import EmptyState from "@/components/common/EmptyState";
import { useDialog } from "@/components/common/DialogProvider";
import BattleArena from "./BattleArena";

const numberFormatter = new Intl.NumberFormat("ko-KR");

const BATTLE_DESCRIPTIONS: { label: string; icon: React.ElementType; accent: string; formula: string }[] = [
  {
    label: "공격값",
    icon: Swords,
    accent: "text-red-500",
    formula: "공격력 × (1 + 공격력 증폭률) × (1 + 피해량 증폭률)",
  },
  {
    label: "수비값(=받는 피해량)",
    icon: Shield,
    accent: "text-gold",
    formula: "에너미가 주는 피해 × (1 − 피해 감소율) − (방어력 × (1 + 방어력 증폭) × (1 + 방어 효율))",
  },
  {
    label: "치유값",
    icon: Heart,
    accent: "text-emerald-500",
    formula: "대상자의 최대 체력 × 0.25 × (1 + 시전자의 치유 효율)",
  },
  {
    label: "구조",
    icon: Ambulance,
    accent: "text-fuchsia-500",
    formula: "기절 상태의 캐릭터에게 사용할 수 있다. 구조된 캐릭터는 최대 체력의 10%를 회복하고 기절 상태에서 벗어난다.",
  },
  {
    label: "MP",
    icon: Zap,
    accent: "text-sky-500",
    formula: "기술을 사용할 때 소모된다. 기술마다 비용이 다르며, 부족할 경우 기술을 사용하지 못한다.",
  },
  {
    label: "주목도",
    icon: Eye,
    accent: "text-amber-500",
    formula: "개전 시 0으로 시작. 행동에 따라 주목도가 쌓이며, 라운드마다 누적된다.",
  },
  {
    label: "존재감",
    icon: Sparkles,
    accent: "text-violet-400",
    formula: "행동할 때 주목도 계산에 사용되는 지표.",
  },
  {
    label: "발동 순서",
    icon: ListOrdered,
    accent: "text-slate-400",
    formula: "아군의 행동 턴에서 발동 순서에 따라 행동이 개시된다. 숫자가 낮을수록 빠르다. 퇴각·구조·아이템 사용(-1) → 방어(3) → 치유(5) → 공격(8) → 무반응(9)",
  },
];

interface ActiveBattle {
  sessionId: number;
  mode: BattleMode;
  readOnly: boolean;
  runnerPreview: boolean;
}

interface PartyCounts {
  attackers: number;
  defenders: number;
  healers: number;
}

function countSelectedParty(characters: Character[], selectedCharacterIds: Set<number>): PartyCounts {
  return characters.reduce<PartyCounts>((counts, character) => {
    if (!selectedCharacterIds.has(character.id)) return counts;
    if (character.faction === "공격") counts.attackers += 1;
    else if (character.faction === "수비") counts.defenders += 1;
    else if (character.faction === "치유") counts.healers += 1;
    return counts;
  }, { attackers: 0, defenders: 0, healers: 0 });
}

function getEnemyFinalStats(enemy: Enemy, partyCounts: PartyCounts) {
  const bonusHp =
    partyCounts.attackers * enemy.hp_per_attacker
    + partyCounts.defenders * enemy.hp_per_defender
    + partyCounts.healers * enemy.hp_per_healer;

  return {
    bonusHp,
    finalHp: enemy.base_hp + bonusHp,
  };
}

function getCharacterNameFontSize(name: string): number {
  return Math.min(14, 132 / Math.max(1, Array.from(name).length));
}

const FACTION_POSITION_IMAGE: Record<string, string> = {
  공격: "/position/position_1.png",
  수비: "/position/position_2.png",
  치유: "/position/position_3.png",
};

function CharacterFactionIcon({ faction }: { faction: Character["faction"] }) {
  if (!faction) return null;
  const image = FACTION_POSITION_IMAGE[faction];
  if (!image) return null;
  return (
    <span
      title={faction}
      aria-label={faction}
      className="absolute left-2 top-2 z-10 flex items-center justify-center drop-shadow-md"
    >
      <Image src={image} alt={faction} width={26} height={26} />
    </span>
  );
}

function statusBadge(status: BattleSessionSummary["status"]) {
  if (status === "victory") return <Badge variant="success">승리</Badge>;
  if (status === "defeat") return <Badge variant="destructive">패배</Badge>;
  if (status === "early_terminated") return <Badge variant="secondary">조기 종료</Badge>;
  return <Badge variant="warning">진행 중</Badge>;
}

export default function BattleTab() {
  const { confirm } = useDialog();
  const { toast } = useToast();
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [resumable, setResumable] = useState<BattleSessionSummary[]>([]);
  const [history, setHistory] = useState<BattleSessionSummary[]>([]);
  const [historyMode, setHistoryMode] = useState<BattleMode>("real");
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [rollingBackId, setRollingBackId] = useState<number | null>(null);

  const [selectedEnemyIds, setSelectedEnemyIds] = useState<Set<number>>(new Set());
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<ActiveBattle | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const [enemyList, environmentList, activeChapterData, characterList, resumableList] = await Promise.all([
          fetchEnemies(),
          fetchEnvironments(),
          fetchActiveChapter(),
          fetchCharacters(),
          fetchBattles({ mode: "real", status: "in_progress" }),
        ]);
        if (cancelled) return;
        setEnemies(enemyList);
        setEnvironments(environmentList);
        setActiveChapter(activeChapterData);
        setCharacters(characterList);
        setResumable(resumableList);
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : "전투 데이터 조회 실패", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [reloadKey, toast]);

  // 실전/모의전 토글은 전투 기록만 다시 불러온다. 전체 loading을 같이 켜면 이 카드 위의
  // 큰 선택 영역이 통째로 사라졌다 다시 그려지면서 스크롤 위치가 맨 위로 튀는 문제가 있었다.
  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        setHistoryLoading(true);
        const historyList = await fetchBattles({ mode: historyMode });
        if (!cancelled) setHistory(historyList);
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : "전투 기록 조회 실패", "error");
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    loadHistory();
    return () => { cancelled = true; };
  }, [reloadKey, historyMode, toast]);

  async function handleDelete(session: BattleSessionSummary) {
    const ok = await confirm({
      title: "전투 기록 삭제",
      description: `${session.enemy_names.join(", ") || `전투 #${session.id}`} 기록을 삭제할까요? 되돌릴 수 없습니다.`,
      confirmText: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    setDeletingId(session.id);
    try {
      await deleteBattle(session.id);
      setHistory((prev) => prev.filter((s) => s.id !== session.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : "전투 기록 삭제 실패", "error");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRollback(session: BattleSessionSummary) {
    const ok = await confirm({
      title: "실전 전투 롤백",
      description: `${session.enemy_names.join(", ") || `전투 #${session.id}`} 실전 테스트를 롤백할까요?\n참가자 HP/MP, 전투 중 사용한 아이템, 이미 지급한 전투 보상을 테스트 전 상태로 되돌리고 전투 기록도 함께 삭제합니다.\n테스트 직후에만 사용하는 것을 권장합니다.`,
      confirmText: "롤백",
      tone: "danger",
    });
    if (!ok) return;
    setRollingBackId(session.id);
    try {
      await rollbackBattle(session.id);
      setHistory((prev) => prev.filter((s) => s.id !== session.id));
      setResumable((prev) => prev.filter((s) => s.id !== session.id));
      toast("실전 테스트 데이터를 롤백했습니다.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "실전 전투 롤백 실패", "error");
    } finally {
      setRollingBackId(null);
    }
  }

  const currentChapterEnemies = useMemo(
    () => (activeChapter ? enemies.filter((enemy) => enemy.chapter === activeChapter.name) : []),
    [activeChapter, enemies],
  );
  const environmentsById = useMemo(
    () => new Map(environments.map((environment) => [environment.id, environment])),
    [environments],
  );
  const selectedPartyCounts = useMemo(
    () => countSelectedParty(characters, selectedCharacterIds),
    [characters, selectedCharacterIds],
  );

  function toggleCharacter(id: number) {
    setSelectedCharacterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleEnemy(id: number) {
    setSelectedEnemyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleStart(mode: BattleMode) {
    if (selectedEnemyIds.size === 0 || selectedCharacterIds.size === 0) return;
    try {
      setStarting(true);
      const session = await createBattle({
        mode,
        enemy_ids: [...selectedEnemyIds],
        character_ids: [...selectedCharacterIds],
      });
      setActive({ sessionId: session.id, mode, readOnly: false, runnerPreview: false });
    } catch (e) {
      toast(e instanceof Error ? e.message : "전투 시작 실패", "error");
    } finally {
      setStarting(false);
    }
  }

  if (active) {
    return (
      <div className="space-y-4">
        {active.mode === "practice" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ivory">모의전 화면 확인</p>
              <p className="text-xs text-muted">같은 전투를 관리자 조작 화면과 러너 관전 화면으로 전환해 확인합니다.</p>
            </div>
            <div className="flex rounded-lg border border-line bg-inset p-1" role="group" aria-label="모의전 화면 전환">
              <Button
                type="button"
                size="sm"
                variant={!active.runnerPreview ? "default" : "ghost"}
                aria-pressed={!active.runnerPreview}
                onClick={() => setActive((current) => current ? { ...current, runnerPreview: false } : current)}
              >
                <Swords size={14} />
                관리자 조작
              </Button>
              <Button
                type="button"
                size="sm"
                variant={active.runnerPreview ? "default" : "ghost"}
                aria-pressed={active.runnerPreview}
                onClick={() => setActive((current) => current ? { ...current, runnerPreview: true } : current)}
              >
                <Eye size={14} />
                러너 화면
              </Button>
            </div>
          </div>
        )}
        <BattleArena
          sessionId={active.sessionId}
          readOnly={active.readOnly || active.runnerPreview}
          onExit={() => {
            setActive(null);
            setSelectedEnemyIds(new Set());
            setSelectedCharacterIds(new Set());
            setReloadKey((k) => k + 1);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2 border-b border-line pb-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">전투 설명</h2>
        <p className="text-xs text-muted">※ 증폭률/효율은 모두 0으로 시작하고 시전자의 것을 기준으로 한다는 전제.</p>
        <div className="space-y-1.5">
          {BATTLE_DESCRIPTIONS.map(({ label, icon: Icon, accent, formula }) => (
            <div key={label} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="flex shrink-0 items-center gap-1 font-semibold text-ivory">
                <Icon size={13} className={accent} />
                {label}
              </span>
              <span className="text-muted">{formula}</span>
            </div>
          ))}
        </div>
      </div>

      {resumable.length > 0 && (
        <Card className="border-gold/40 bg-gold/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-2 text-sm text-ivory">
              <CalendarClock size={16} className="text-gold" />
              진행 중인 실전 전투가 {resumable.length}건 있습니다.
            </div>
            <div className="flex flex-wrap gap-2">
              {resumable.map((session) => (
                <Button
                  key={session.id}
                  size="sm"
                  onClick={() => setActive({
                    sessionId: session.id,
                    mode: session.mode,
                    readOnly: false,
                    runnerPreview: false,
                  })}
                >
                  <PlayCircle size={14} />
                  {session.enemy_names.join(", ") || `전투 #${session.id}`} 이어하기 (라운드 {session.round})
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <EmptyState>전투 데이터를 불러오는 중입니다.</EmptyState>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{activeChapter ? `${activeChapter.name} 에너미` : "현재 챕터 에너미"}</CardTitle>
                {activeChapter?.battle_date ? (
                  <Badge variant={activeChapter.is_battle_day ? "success" : "outline"} className="font-num">
                    전투 일정 {activeChapter.battle_date}
                  </Badge>
                ) : null}
              </div>
              <CardDescription>
                {activeChapter
                  ? "현재 챕터에서 전투를 시작할 에너미를 선택하세요. 체크한 캐릭터 조합에 따라 최종 HP가 아래 정보에 즉시 반영됩니다."
                  : "진행 중인 챕터가 없어 현재 챕터 에너미를 표시할 수 없습니다."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">공격 {selectedPartyCounts.attackers}명</Badge>
                <Badge variant="secondary">수비 {selectedPartyCounts.defenders}명</Badge>
                <Badge variant="secondary">치유 {selectedPartyCounts.healers}명</Badge>
              </div>

              {!activeChapter ? (
                <EmptyState>진행 중인 챕터가 없습니다.</EmptyState>
              ) : currentChapterEnemies.length === 0 ? (
                <EmptyState>현재 챕터에 등록된 에너미가 없습니다.</EmptyState>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {currentChapterEnemies.map((enemy) => {
                    const { bonusHp, finalHp } = getEnemyFinalStats(enemy, selectedPartyCounts);
                    const checked = selectedEnemyIds.has(enemy.id);

                    return (
                      <div
                        key={enemy.id}
                        className={`flex flex-col gap-4 rounded-2xl border p-4 transition-colors ${
                          checked ? "border-gold bg-gold/10" : "border-line bg-surface hover:border-gold/45"
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-xl border border-line bg-inset">
                            {enemy.image_url ? (
                              <Image src={enemy.image_url} alt={enemy.name} fill sizes="96px" unoptimized className="object-cover object-top" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-muted">
                                <ImageIcon size={24} />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Checkbox checked={checked} onCheckedChange={() => toggleEnemy(enemy.id)} />
                              <span className="text-lg font-semibold text-ivory">{enemy.name}</span>
                              {checked && <Badge variant="secondary">선택됨</Badge>}
                              {enemy.chapter && <Badge variant="outline">{enemy.chapter}</Badge>}
                            </div>
                            <div className="grid gap-2 text-sm sm:grid-cols-2">
                              <div className="rounded-lg border border-line bg-inset/40 px-3 py-2">
                                <p className="text-xs text-muted">기본 HP</p>
                                <p className="font-num font-semibold text-ivory">{numberFormatter.format(enemy.base_hp)}</p>
                              </div>
                              <div className="rounded-lg border border-line bg-inset/40 px-3 py-2">
                                <p className="text-xs text-muted">최종 HP</p>
                                <p className="font-num font-semibold text-gold">{numberFormatter.format(finalHp)}</p>
                              </div>
                              <div className="rounded-lg border border-line bg-inset/40 px-3 py-2">
                                <p className="text-xs text-muted">파티 보정 HP</p>
                                <p className="font-num font-semibold text-ivory">{bonusHp > 0 ? `+${numberFormatter.format(bonusHp)}` : "0"}</p>
                              </div>
                              <div className="rounded-lg border border-line bg-inset/40 px-3 py-2">
                                <p className="text-xs text-muted">공격력</p>
                                <p className="font-num font-semibold text-ivory">{numberFormatter.format(enemy.attack)}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 text-xs text-muted sm:grid-cols-3">
                          <div className="rounded-lg border border-line bg-inset/30 px-3 py-2">
                            공격 러너당 +{numberFormatter.format(enemy.hp_per_attacker)} HP
                          </div>
                          <div className="rounded-lg border border-line bg-inset/30 px-3 py-2">
                            수비 러너당 +{numberFormatter.format(enemy.hp_per_defender)} HP
                          </div>
                          <div className="rounded-lg border border-line bg-inset/30 px-3 py-2">
                            치유 러너당 +{numberFormatter.format(enemy.hp_per_healer)} HP
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">기술 정보</p>
                          {enemy.skills.length === 0 ? (
                            <p className="text-sm text-muted">등록된 기술이 없습니다.</p>
                          ) : (
                            <div className="grid gap-2">
                              {enemy.skills.map((skill, index) => (
                                <div key={`${enemy.id}-${skill.name}-${index}`} className="rounded-xl border border-line bg-inset/30 px-3 py-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">{skill.skill_type}</Badge>
                                    <span className="font-semibold text-ivory">{skill.name}</span>
                                  </div>
                                  <p className="mt-1 text-xs text-muted">
                                    {skill.skill_type === "소환"
                                      ? `${skill.summon_name ?? "하수인"} · HP ${numberFormatter.format(skill.summon_hp ?? 0)} · 공격 ${numberFormatter.format(skill.summon_attack ?? 0)} · 수량 ${numberFormatter.format(skill.summon_count ?? 1)}`
                                      : skill.skill_type === "환경"
                                        ? `${skill.environment_id != null ? environmentsById.get(skill.environment_id)?.name ?? `환경 #${skill.environment_id}` : "환경"} · ${numberFormatter.format(skill.environment_stack_count ?? 1)}스택 부여 · ${skill.manual_target_count ? "수동 지정" : `대상 ${numberFormatter.format(skill.target_count)}명 · ${skill.auto_target_mode === "random" ? "무작위" : "주목도 순"}`}`
                                        : skill.skill_type === "지속 디버프"
                                          ? `${skill.manual_target_count ? "수동 지정" : `대상 ${numberFormatter.format(skill.target_count)}명 · ${skill.auto_target_mode === "random" ? "무작위" : "주목도 순"}`} · 지속 디버프`
                                          : `대상 ${numberFormatter.format(skill.target_count)}명 · ${skill.auto_target_mode === "random" ? "무작위" : "주목도 순"} · 피해 ${numberFormatter.format(skill.damage_percent)}%`}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>캐릭터 선택</CardTitle>
                <CardDescription>전투에 참여할 캐릭터를 선택하세요. 진영 구성에 따라 에너미 체력이 증가합니다.</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={characters.length === 0}
                onClick={() => setSelectedCharacterIds(
                  selectedCharacterIds.size === characters.length
                    ? new Set()
                    : new Set(characters.map((c) => c.id)),
                )}
              >
                {selectedCharacterIds.size === characters.length ? "전체 해제" : "전원 선택"}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid max-w-3xl grid-cols-6 gap-3">
                {characters.map((c) => {
                  const checked = selectedCharacterIds.has(c.id);
                  return (
                    <div
                      key={c.id}
                      role="checkbox"
                      tabIndex={0}
                      aria-checked={checked}
                      onClick={() => toggleCharacter(c.id)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        toggleCharacter(c.id);
                      }}
                      className={`flex cursor-pointer flex-col items-center gap-2 overflow-hidden rounded-2xl border bg-surface pb-3 transition-colors ${
                        checked ? "border-gold ring-1 ring-gold/50" : "border-line hover:border-gold/45"
                      }`}
                    >
                      <div className="relative w-full">
                        <CharacterAvatar
                          src={c.image_url}
                          alt={c.name}
                          className="aspect-square w-full rounded-none"
                          iconSize={28}
                          sizes="128px"
                        />
                        <CharacterFactionIcon faction={c.faction} />
                        <Checkbox
                          checked={checked}
                          className="absolute right-2 top-2 z-10 size-5 rounded border-2 bg-surface shadow-md"
                          onClick={(event) => event.stopPropagation()}
                          onCheckedChange={() => toggleCharacter(c.id)}
                        />
                      </div>
                      <span
                        className="w-full whitespace-nowrap px-1 text-center font-semibold leading-tight text-ivory"
                        style={{ fontSize: `${getCharacterNameFontSize(c.name)}px` }}
                      >
                        {c.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="outline"
              disabled={selectedEnemyIds.size === 0 || selectedCharacterIds.size === 0 || starting}
              onClick={() => handleStart("practice")}
            >
              <Flag size={15} />
              모의전 시작 ({selectedCharacterIds.size}명 · 에너미 {selectedEnemyIds.size}마리)
            </Button>
            <Button
              disabled={selectedEnemyIds.size === 0 || selectedCharacterIds.size === 0 || starting}
              onClick={() => handleStart("real")}
            >
              <Swords size={15} />
              실전 시작
            </Button>
            <p className="text-xs text-muted">실전은 전투 로그가 남아 이후에 다시 확인할 수 있습니다.</p>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <History size={16} className="text-gold" />
                  전투 기록
                </CardTitle>
                <CardDescription>
                  {historyMode === "real"
                    ? "완료되거나 진행 중인 실전 전투 기록입니다. 러너에게는 보이지 않습니다. 클릭하면 로그를 다시 볼 수 있습니다."
                    : "모의전 기록입니다. 러너에게는 보이지 않습니다. 클릭하면 로그를 다시 볼 수 있습니다."}
                </CardDescription>
              </div>
              <div className="flex shrink-0 gap-1 rounded-lg border border-line bg-inset p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={historyMode === "real" ? "default" : "ghost"}
                  onClick={() => setHistoryMode("real")}
                >
                  실전
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={historyMode === "practice" ? "default" : "ghost"}
                  onClick={() => setHistoryMode("practice")}
                >
                  모의전
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <EmptyState>전투 기록을 불러오는 중입니다.</EmptyState>
              ) : history.length === 0 ? (
                <EmptyState>{historyMode === "real" ? "실전 전투 기록이 없습니다." : "모의전 기록이 없습니다."}</EmptyState>
              ) : (
                <div className="flex flex-col divide-y divide-line">
                  {history.map((session) => (
                    <div key={session.id} className="flex items-center justify-between gap-3 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          setActive({
                            sessionId: session.id,
                            mode: session.mode,
                            readOnly: session.mode === "real" && session.status !== "in_progress",
                            runnerPreview: false,
                          })
                        }
                        className="flex min-w-0 flex-1 items-center gap-3 text-left hover:opacity-80"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="truncate font-semibold text-ivory">{session.enemy_names.join(", ") || `전투 #${session.id}`}</span>
                          <span className="shrink-0 text-xs text-muted">{session.chapter ?? "챕터 미지정"} · 라운드 {session.round}</span>
                        </div>
                        {statusBadge(session.status)}
                      </button>
                      {session.mode === "real" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          disabled={rollingBackId === session.id}
                          onClick={() => handleRollback(session)}
                        >
                          <RotateCcw size={14} />
                          {rollingBackId === session.id ? "롤백 중..." : "실전 롤백"}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted hover:text-red-500"
                          disabled={deletingId === session.id}
                          onClick={() => handleDelete(session)}
                          aria-label="전투 기록 삭제"
                        >
                          <Trash2 size={15} />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
