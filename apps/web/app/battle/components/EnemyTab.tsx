"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createEnemy, fetchChapters, fetchEnemies } from "@/lib/api";
import type { Chapter, Enemy, EnemyCreate, EnemySkill } from "@/lib/api";
import { cn, parsePositiveInt } from "@/lib/utils";
import AlertBanner from "@/components/common/AlertBanner";
import EmptyState from "@/components/common/EmptyState";

const SKILL_TYPES = ["지정 공격A", "지정 공격B", "광역 공격A", "광역 공격B", "소환"] as const;
type SkillType = (typeof SKILL_TYPES)[number];

type SkillFormEntry = {
  skill_type: SkillType;
  name: string;
  target_count: string;
  damage_percent: string;
  summon_name: string;
  summon_hp: string;
  summon_attack: string;
  summon_count: string;
};

type EnemyFormState = {
  name: string;
  chapter: string;
  base_hp: string;
  hp_per_attacker: string;
  hp_per_defender: string;
  hp_per_healer: string;
  attack: string;
  skills: SkillFormEntry[];
};

const EMPTY_SKILL: SkillFormEntry = {
  skill_type: "지정 공격A",
  name: "",
  target_count: "1",
  damage_percent: "100",
  summon_name: "",
  summon_hp: "0",
  summon_attack: "0",
  summon_count: "1",
};

const DEFAULT_FORM: EnemyFormState = {
  name: "",
  chapter: "",
  base_hp: "0",
  hp_per_attacker: "0",
  hp_per_defender: "0",
  hp_per_healer: "0",
  attack: "0",
  skills: [{ ...EMPTY_SKILL }],
};

function toPayload(form: EnemyFormState): EnemyCreate {
  const skills: EnemySkill[] = form.skills.map((s) => {
    const isSummon = s.skill_type === "소환";
    return {
      skill_type: s.skill_type,
      name: s.name.trim(),
      target_count: isSummon ? 0 : parsePositiveInt(s.target_count),
      damage_percent: isSummon ? 0 : parsePositiveInt(s.damage_percent),
      summon_name: isSummon ? s.summon_name.trim() || null : null,
      summon_hp: isSummon ? parsePositiveInt(s.summon_hp) : null,
      summon_attack: isSummon ? parsePositiveInt(s.summon_attack) : null,
      summon_count: isSummon ? parsePositiveInt(s.summon_count) : null,
    };
  });
  return {
    name: form.name.trim(),
    chapter: form.chapter.trim() || null,
    base_hp: parsePositiveInt(form.base_hp),
    hp_per_attacker: parsePositiveInt(form.hp_per_attacker),
    hp_per_defender: parsePositiveInt(form.hp_per_defender),
    hp_per_healer: parsePositiveInt(form.hp_per_healer),
    attack: parsePositiveInt(form.attack),
    skills,
  };
}

const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  "지정 공격A": "bg-blue-100 text-blue-700",
  "지정 공격B": "bg-amber-100 text-amber-700",
  "광역 공격A": "bg-orange-100 text-orange-700",
  "광역 공격B": "bg-red-100 text-red-700",
  소환: "bg-amber-100 text-amber-700",
};

export default function EnemyTab() {
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [chapterList, setChapterList] = useState<Chapter[]>([]);
  const [form, setForm] = useState<EnemyFormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [enemyList, chapList] = await Promise.all([fetchEnemies(), fetchChapters()]);
        if (cancelled) return;
        setEnemies(enemyList);
        setChapterList(chapList);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  function setField<K extends keyof EnemyFormState>(key: K, value: EnemyFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addSkill() {
    setForm((prev) => ({ ...prev, skills: [...prev.skills, { ...EMPTY_SKILL }] }));
  }

  function removeSkill(index: number) {
    setForm((prev) => ({ ...prev, skills: prev.skills.filter((_, i) => i !== index) }));
  }

  function updateSkill<K extends keyof SkillFormEntry>(index: number, key: K, value: SkillFormEntry[K]) {
    setForm((prev) => ({
      ...prev,
      skills: prev.skills.map((s, i) => (i === index ? { ...s, [key]: value } : s)),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (form.skills.length === 0) { setError("스킬을 하나 이상 추가해주세요."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createEnemy(toPayload(form));
      setEnemies((prev) => [...prev, created]);
      setForm({ ...DEFAULT_FORM, chapter: form.chapter, skills: [{ ...EMPTY_SKILL }] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "에너미 생성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
      {error && (
        <AlertBanner className="xl:col-span-2">{error}</AlertBanner>
      )}

      {/* 에너미 리스트 */}
      <Card>
        <CardHeader>
          <CardTitle>에너미 리스트</CardTitle>
          <CardDescription>등록된 모든 에너미와 스킬 세트를 확인합니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loading ? (
            <EmptyState>
              에너미 목록을 불러오는 중입니다.
            </EmptyState>
          ) : enemies.length === 0 ? (
            <EmptyState>
              등록된 에너미가 없습니다.
            </EmptyState>
          ) : (
            enemies.map((enemy) => (
              <div key={enemy.id} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{enemy.name}</span>
                    {enemy.chapter && (
                      <span className="text-xs text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">
                        {enemy.chapter}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>HP {enemy.base_hp.toLocaleString()}</span>
                    <span>공격 {enemy.attack.toLocaleString()}</span>
                  </div>
                </div>

                {(enemy.hp_per_attacker > 0 || enemy.hp_per_defender > 0 || enemy.hp_per_healer > 0) && (
                  <div className="flex gap-3 text-xs text-slate-500 dark:text-slate-400">
                    {enemy.hp_per_attacker > 0 && <span>공격 인원당 +{enemy.hp_per_attacker.toLocaleString()} HP</span>}
                    {enemy.hp_per_defender > 0 && <span>수비 인원당 +{enemy.hp_per_defender.toLocaleString()} HP</span>}
                    {enemy.hp_per_healer > 0 && <span>치유 인원당 +{enemy.hp_per_healer.toLocaleString()} HP</span>}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  {enemy.skills.map((skill, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", SKILL_TYPE_COLOR[skill.skill_type as SkillType] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300")}>
                        {skill.skill_type}
                      </span>
                      <span className="font-medium text-slate-800 dark:text-slate-100">{skill.name}</span>
                      {skill.skill_type === "소환" ? (
                        <span className="text-slate-500 dark:text-slate-400">
                          {skill.summon_name} (HP {(skill.summon_hp ?? 0).toLocaleString()} / 공격 {skill.summon_attack ?? 0}) ×{skill.summon_count ?? 1}
                        </span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">
                          타겟 {skill.target_count}명 / 피해 {skill.damage_percent}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* 에너미 추가 폼 */}
      <Card>
        <CardHeader>
          <CardTitle>에너미 추가</CardTitle>
          <CardDescription>새 에너미를 등록합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">이름</label>
              <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="에너미 이름" required />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">챕터 (선택)</label>
              <Select
                value={form.chapter || "__none__"}
                onValueChange={(v) => setField("chapter", v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="챕터 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="__none__">없음</SelectItem>
                    {chapterList.map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-4 flex flex-col gap-3">
              <p className="text-xs font-semibold tracking-widest text-slate-500 dark:text-slate-400 uppercase">체력 / 공격력</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">기본 체력</label>
                  <Input type="number" min={0} value={form.base_hp} onChange={(e) => setField("base_hp", e.target.value)} placeholder="0" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">공격력</label>
                  <Input type="number" min={0} value={form.attack} onChange={(e) => setField("attack", e.target.value)} placeholder="0" />
                </div>
              </div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">인원당 증가 체력</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { key: "hp_per_attacker" as const, label: "공격 인원" },
                  { key: "hp_per_defender" as const, label: "수비 인원" },
                  { key: "hp_per_healer" as const, label: "치유 인원" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</label>
                    <Input type="number" min={0} value={form[key]} onChange={(e) => setField(key, e.target.value)} placeholder="0" />
                  </div>
                ))}
              </div>
            </div>

            {/* 스킬 세트 */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">스킬 세트</label>
                <Button type="button" variant="outline" onClick={addSkill} className="h-7 px-3 text-xs gap-1">
                  <Plus size={12} /> 스킬 추가
                </Button>
              </div>

              {form.skills.map((skill, idx) => {
                const isSummon = skill.skill_type === "소환";
                return (
                  <div key={idx} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">스킬 {idx + 1}</span>
                      {form.skills.length > 1 && (
                        <Button type="button" variant="ghost" onClick={() => removeSkill(idx)} className="h-6 w-6 p-0 text-slate-400 dark:text-slate-500 hover:text-red-500">
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">스킬 유형</label>
                        <Select
                          value={skill.skill_type}
                          onValueChange={(v: SkillType) => updateSkill(idx, "skill_type", v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {SKILL_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">스킬명</label>
                        <Input
                          className="h-8 text-xs"
                          value={skill.name}
                          onChange={(e) => updateSkill(idx, "name", e.target.value)}
                          placeholder="스킬 이름"
                        />
                      </div>
                    </div>

                    {!isSummon && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">타겟 인원</label>
                          <Input
                            type="number" min={0} className="h-8 text-xs"
                            value={skill.target_count}
                            onChange={(e) => updateSkill(idx, "target_count", e.target.value)}
                            placeholder="0"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">피해량 (%)</label>
                          <Input
                            type="number" min={0} className="h-8 text-xs"
                            value={skill.damage_percent}
                            onChange={(e) => updateSkill(idx, "damage_percent", e.target.value)}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    )}

                    {isSummon && (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">소환수 이름</label>
                          <Input
                            className="h-8 text-xs"
                            value={skill.summon_name}
                            onChange={(e) => updateSkill(idx, "summon_name", e.target.value)}
                            placeholder="소환수 이름"
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">소환수 체력</label>
                            <Input
                              type="number" min={0} className="h-8 text-xs"
                              value={skill.summon_hp}
                              onChange={(e) => updateSkill(idx, "summon_hp", e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">소환수 공격력</label>
                            <Input
                              type="number" min={0} className="h-8 text-xs"
                              value={skill.summon_attack}
                              onChange={(e) => updateSkill(idx, "summon_attack", e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">소환 인원수</label>
                            <Input
                              type="number" min={1} className="h-8 text-xs"
                              value={skill.summon_count}
                              onChange={(e) => updateSkill(idx, "summon_count", e.target.value)}
                              placeholder="1"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              <Plus size={15} />
              {submitting ? "추가 중..." : "에너미 추가"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
