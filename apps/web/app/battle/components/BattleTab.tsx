"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Flag, Heart, History, PlayCircle, Shield, Swords, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createBattle,
  fetchBattles,
  fetchCharacters,
  fetchChapters,
  fetchEnemies,
  type BattleMode,
  type BattleSessionSummary,
  type Chapter,
  type Character,
  type Enemy,
} from "@/lib/api";
import AlertBanner from "@/components/common/AlertBanner";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import EmptyState from "@/components/common/EmptyState";
import BattleArena from "./BattleArena";

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

interface ActiveBattle {
  sessionId: number;
  readOnly: boolean;
}

function groupEnemiesByChapter(enemies: Enemy[], chapters: Chapter[]): { chapter: string; enemies: Enemy[] }[] {
  const order = chapters.map((c) => c.name);
  const map = new Map<string, Enemy[]>();
  for (const enemy of enemies) {
    const key = enemy.chapter ?? "챕터 미지정";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(enemy);
  }
  const keys = [...map.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return keys.map((chapter) => ({ chapter, enemies: map.get(chapter)! }));
}

function statusBadge(status: BattleSessionSummary["status"]) {
  if (status === "victory") return <Badge variant="success">승리</Badge>;
  if (status === "defeat") return <Badge variant="destructive">패배</Badge>;
  return <Badge variant="warning">진행 중</Badge>;
}

export default function BattleTab() {
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [resumable, setResumable] = useState<BattleSessionSummary[]>([]);
  const [history, setHistory] = useState<BattleSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [selectedEnemyIds, setSelectedEnemyIds] = useState<Set<number>>(new Set());
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<ActiveBattle | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const [enemyList, chapterList, characterList, resumableList, historyList] = await Promise.all([
          fetchEnemies(),
          fetchChapters(),
          fetchCharacters(),
          fetchBattles({ mode: "real", status: "in_progress" }),
          fetchBattles({ mode: "real" }),
        ]);
        if (cancelled) return;
        setEnemies(enemyList);
        setChapters(chapterList);
        setCharacters(characterList);
        setResumable(resumableList);
        setHistory(historyList);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "전투 데이터 조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const grouped = useMemo(() => groupEnemiesByChapter(enemies, chapters), [enemies, chapters]);

  function toggleEnemy(id: number) {
    setSelectedEnemyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCharacter(id: number) {
    setSelectedCharacterIds((prev) => {
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
      setActive({ sessionId: session.id, readOnly: false });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "전투 시작 실패");
    } finally {
      setStarting(false);
    }
  }

  if (active) {
    return (
      <BattleArena
        sessionId={active.sessionId}
        readOnly={active.readOnly}
        onExit={() => {
          setActive(null);
          setSelectedEnemyIds(new Set());
          setSelectedCharacterIds(new Set());
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  return (
    <div className="space-y-8">
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
          체력 재생력(고정) + 최대 체력 × 체력 재생력(비례)만큼 회복하고 마나 재생력만큼 마나가 회복됩니다. 소환수가
          있으면 캐릭터의 공격은 소환수부터 소모하며, 초과 피해는 에너미에게 넘어가지 않습니다. 난입한 캐릭터는 난입한
          라운드에는 공격/치유 대상이 되지 않습니다.
        </p>
      </div>

      {error && <AlertBanner>{error}</AlertBanner>}

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
                  onClick={() => setActive({ sessionId: session.id, readOnly: false })}
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
              <CardTitle>에너미 선택</CardTitle>
              <CardDescription>챕터별로 묶인 에너미 중 이번 전투에 등장시킬 에너미를 모두 선택하세요.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {grouped.length === 0 ? (
                <EmptyState>등록된 에너미가 없습니다. 에너미 탭에서 먼저 등록하세요.</EmptyState>
              ) : (
                grouped.map(({ chapter, enemies: chapterEnemies }) => (
                  <div key={chapter} className="space-y-2">
                    <h3 className="text-sm font-bold text-ivory">{chapter}</h3>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {chapterEnemies.map((enemy) => {
                        const checked = selectedEnemyIds.has(enemy.id);
                        return (
                          <label
                            key={enemy.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                              checked ? "border-gold bg-gold/10" : "border-line hover:border-line"
                            }`}
                          >
                            <Checkbox checked={checked} onCheckedChange={() => toggleEnemy(enemy.id)} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-semibold text-ivory">{enemy.name}</span>
                              </div>
                              <div className="font-num mt-0.5 flex gap-3 text-xs text-muted">
                                <span>HP {numberFormatter.format(enemy.base_hp)}</span>
                                <span className="flex items-center gap-0.5"><Zap size={10} />{numberFormatter.format(enemy.attack)}</span>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>캐릭터 선택</CardTitle>
              <CardDescription>전투에 참여할 캐릭터를 선택하세요. 진영 구성에 따라 에너미 체력이 증가합니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {characters.map((c) => {
                  const checked = selectedCharacterIds.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                        checked ? "border-gold bg-gold/10" : "border-line hover:border-line"
                      }`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleCharacter(c.id)} />
                      <CharacterAvatar src={c.image_url} alt={c.name} className="size-8 rounded-lg" iconSize={14} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-ivory">{c.name}</span>
                          {c.faction && <Badge variant="secondary" className="text-[10px]">{c.faction}</Badge>}
                        </div>
                      </div>
                    </label>
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History size={16} className="text-gold" />
                전투 기록
              </CardTitle>
              <CardDescription>완료되거나 진행 중인 실전 전투 기록입니다. 클릭하면 로그를 다시 볼 수 있습니다.</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <EmptyState>실전 전투 기록이 없습니다.</EmptyState>
              ) : (
                <div className="flex flex-col divide-y divide-line">
                  {history.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() =>
                        setActive({ sessionId: session.id, readOnly: session.status !== "in_progress" })
                      }
                      className="flex items-center justify-between gap-3 py-3 text-left hover:opacity-80"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-ivory">{session.enemy_names.join(", ") || `전투 #${session.id}`}</span>
                        <span className="text-xs text-muted">{session.chapter ?? "챕터 미지정"} · 라운드 {session.round}</span>
                      </div>
                      {statusBadge(session.status)}
                    </button>
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
