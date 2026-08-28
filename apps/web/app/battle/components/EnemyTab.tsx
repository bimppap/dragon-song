"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Image as ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
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
import Modal from "@/components/common/Modal";
import {
  createEnemy,
  fetchChapters,
  fetchEnemies,
  updateChapter,
  updateEnemy,
  uploadEnemyImage,
  uploadEnemySummonImage,
} from "@/lib/api";
import type { Chapter, Enemy, EnemyCreate, EnemySkill } from "@/lib/api";
import { cn, parsePositiveInt, todayDateValue } from "@/lib/utils";
import { useToast } from "@/components/common/ToastProvider";
import EmptyState from "@/components/common/EmptyState";

const SKILL_TYPES = ["지정 공격A", "지정 공격B", "광역 공격A", "광역 공격B", "소환"] as const;
type SkillType = (typeof SKILL_TYPES)[number];

const ALL_CHAPTERS = "__all__";

type SkillFormEntry = {
  skill_type: SkillType;
  name: string;
  target_count: string;
  damage_percent: string;
  summon_name: string;
  summon_hp: string;
  summon_attack: string;
  summon_count: string;
  /** 이미 업로드되어 저장된 소환수 이미지 URL. */
  summon_image_url: string | null;
  /** 아직 업로드하지 않은, 선택만 해둔 소환수 이미지 파일. */
  summon_image_file: File | null;
  /** 미리보기용 URL (blob 또는 기존 image_url). */
  summon_image_preview: string | null;
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
  summon_image_url: null,
  summon_image_file: null,
  summon_image_preview: null,
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
      summon_image_url: isSummon ? s.summon_image_url : null,
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

function enemyToForm(enemy: Enemy): EnemyFormState {
  return {
    name: enemy.name,
    chapter: enemy.chapter ?? "",
    base_hp: String(enemy.base_hp),
    hp_per_attacker: String(enemy.hp_per_attacker),
    hp_per_defender: String(enemy.hp_per_defender),
    hp_per_healer: String(enemy.hp_per_healer),
    attack: String(enemy.attack),
    skills: enemy.skills.length > 0
      ? enemy.skills.map((s) => ({
          skill_type: s.skill_type as SkillType,
          name: s.name,
          target_count: String(s.target_count),
          damage_percent: String(s.damage_percent),
          summon_name: s.summon_name ?? "",
          summon_hp: String(s.summon_hp ?? 0),
          summon_attack: String(s.summon_attack ?? 0),
          summon_count: String(s.summon_count ?? 1),
          summon_image_url: s.summon_image_url ?? null,
          summon_image_file: null,
          summon_image_preview: s.summon_image_url ?? null,
        }))
      : [{ ...EMPTY_SKILL }],
  };
}

const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  "지정 공격A": "bg-blue-500/20 text-blue-300",
  "지정 공격B": "bg-gold/15 text-gold",
  "광역 공격A": "bg-orange-500/20 text-orange-300",
  "광역 공격B": "bg-red-500/20 text-red-300",
  소환: "bg-gold/15 text-gold",
};

export default function EnemyTab() {
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [chapterList, setChapterList] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<string>(ALL_CHAPTERS);
  const [battleDateDraft, setBattleDateDraft] = useState("");
  const [chaptersLoaded, setChaptersLoaded] = useState(false);
  const [form, setForm] = useState<EnemyFormState>(DEFAULT_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEnemy, setEditingEnemy] = useState<Enemy | null>(null);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedChapterData = chapterList.find((chapter) => chapter.name === selectedChapter) ?? null;
  const battleDateDirty = (selectedChapterData?.battle_date ?? "") !== battleDateDraft;

  useEffect(() => {
    let cancelled = false;
    fetchChapters()
      .then((chapList) => {
        if (cancelled) return;
        setChapterList(chapList);
        if (chapList.length > 0) {
          const today = todayDateValue();
          const defaultChapter = chapList.find(
            (chapter) => chapter.start_date <= today && today <= chapter.end_date,
          ) ?? chapList[0];
          setSelectedChapter(defaultChapter.name);
          setBattleDateDraft(defaultChapter.battle_date ?? "");
        }
      })
      .catch((e) => { if (!cancelled) toast(e instanceof Error ? e.message : "챕터를 불러오지 못했습니다.", "error"); })
      .finally(() => { if (!cancelled) setChaptersLoaded(true); });
    return () => { cancelled = true; };
  }, [toast]);

  useEffect(() => {
    if (!chaptersLoaded) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const enemyList = await fetchEnemies(selectedChapter === ALL_CHAPTERS ? undefined : selectedChapter);
        if (!cancelled) setEnemies(enemyList);
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : "에너미를 불러오지 못했습니다.", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [chaptersLoaded, selectedChapter, toast]);

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

  function openAddModal() {
    setForm({ ...DEFAULT_FORM, chapter: selectedChapter === ALL_CHAPTERS ? "" : selectedChapter });
    setEditingEnemy(null);
    setImageFile(null);
    setImagePreview(null);
    setModalOpen(true);
  }

  function openEditModal(enemy: Enemy) {
    setForm(enemyToForm(enemy));
    setEditingEnemy(enemy);
    setImageFile(null);
    setImagePreview(enemy.image_url);
    setModalOpen(true);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : (editingEnemy?.image_url ?? null));
  }

  function handleSummonImageChange(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setForm((prev) => ({
      ...prev,
      skills: prev.skills.map((s, i) => (
        i === index
          ? { ...s, summon_image_file: file, summon_image_preview: file ? URL.createObjectURL(file) : s.summon_image_url }
          : s
      )),
    }));
  }

  async function handleBattleDateSave() {
    if (!selectedChapterData) return;
    setScheduleSaving(true);
    try {
      const updatedChapter = await updateChapter(selectedChapterData.id, {
        name: selectedChapterData.name,
        start_date: selectedChapterData.start_date,
        end_date: selectedChapterData.end_date,
        battle_date: battleDateDraft || null,
        music_url: selectedChapterData.music_url,
      });
      setChapterList((prev) => prev.map((chapter) => (chapter.id === updatedChapter.id ? updatedChapter : chapter)));
      setBattleDateDraft(updatedChapter.battle_date ?? "");
    } catch (e) {
      toast(e instanceof Error ? e.message : "전투 일정 저장에 실패했습니다.", "error");
    } finally {
      setScheduleSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (form.skills.length === 0) { toast("스킬을 하나 이상 추가해주세요.", "error"); return; }
    setSubmitting(true);
    try {
      let saved = editingEnemy
        ? await updateEnemy(editingEnemy.id, toPayload(form))
        : await createEnemy(toPayload(form));

      if (imageFile) {
        saved = await uploadEnemyImage(saved.id, imageFile);
      }
      for (let i = 0; i < form.skills.length; i++) {
        const file = form.skills[i].summon_image_file;
        if (file) {
          saved = await uploadEnemySummonImage(saved.id, i, file);
        }
      }

      if (editingEnemy) {
        setEnemies((prev) => {
          const replaced = prev.map((e) => (e.id === saved.id ? saved : e));
          if (selectedChapter !== ALL_CHAPTERS && saved.chapter !== selectedChapter) {
            return replaced.filter((e) => e.id !== saved.id);
          }
          return replaced;
        });
      } else {
        setEnemies((prev) => [...prev, saved]);
      }
      setModalOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : (editingEnemy ? "에너미 수정에 실패했습니다." : "에너미 생성에 실패했습니다."), "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>에너미 관리</CardTitle>
            <CardDescription>챕터를 선택해 해당 챕터의 에너미를 확인하고 추가합니다.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={selectedChapter}
              onValueChange={(value) => {
                setSelectedChapter(value);
                const chapter = chapterList.find((item) => item.name === value) ?? null;
                setBattleDateDraft(chapter?.battle_date ?? "");
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="챕터 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL_CHAPTERS}>전체 챕터</SelectItem>
                  {chapterList.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={openAddModal}
              disabled={selectedChapter === ALL_CHAPTERS}
              className="gap-2"
              title={selectedChapter === ALL_CHAPTERS ? "에너미를 추가할 챕터를 먼저 선택하세요." : undefined}
            >
              <Plus size={15} />
              에너미 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {selectedChapterData && (
            <div className="mb-5 flex flex-col gap-3 rounded-xl border border-line bg-inset/30 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-ivory">{selectedChapterData.name} 전투 일정</p>
                <p className="text-xs text-muted">
                  챕터 기간 {selectedChapterData.start_date} ~ {selectedChapterData.end_date} 안에서 지정할 수 있습니다. 비워두면 러너 전투
                  페이지에 대기 문구가 표시됩니다.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  type="date"
                  value={battleDateDraft}
                  min={selectedChapterData.start_date}
                  max={selectedChapterData.end_date}
                  onChange={(event) => setBattleDateDraft(event.target.value)}
                  className="sm:w-44"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleBattleDateSave}
                  disabled={scheduleSaving || !battleDateDirty}
                >
                  {scheduleSaving ? "저장 중..." : "전투 일정 저장"}
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <EmptyState>
              에너미 목록을 불러오는 중입니다.
            </EmptyState>
          ) : enemies.length === 0 ? (
            <EmptyState>
              {selectedChapter === ALL_CHAPTERS ? "등록된 에너미가 없습니다." : "이 챕터에 등록된 에너미가 없습니다."}
            </EmptyState>
          ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {enemies.map((enemy) => (
              <div key={enemy.id} className="rounded-xl border border-line px-4 py-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-line bg-inset">
                      {enemy.image_url ? (
                        <Image src={enemy.image_url} alt={enemy.name} fill className="object-cover object-top" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageIcon size={16} className="text-muted" />
                        </div>
                      )}
                    </div>
                    <span className="font-semibold text-ivory">{enemy.name}</span>
                    {enemy.chapter && (
                      <span className="text-xs text-muted border border-line rounded px-1.5 py-0.5">
                        {enemy.chapter}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span>HP {enemy.base_hp.toLocaleString()}</span>
                    <span>공격 {enemy.attack.toLocaleString()}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditModal(enemy)}
                      className="h-7 w-7 text-muted hover:text-gold"
                      aria-label={`${enemy.name} 수정`}
                    >
                      <Pencil size={14} />
                    </Button>
                  </div>
                </div>

                {(enemy.hp_per_attacker > 0 || enemy.hp_per_defender > 0 || enemy.hp_per_healer > 0) && (
                  <div className="flex gap-3 text-xs text-muted">
                    {enemy.hp_per_attacker > 0 && <span>공격 인원당 +{enemy.hp_per_attacker.toLocaleString()} HP</span>}
                    {enemy.hp_per_defender > 0 && <span>수비 인원당 +{enemy.hp_per_defender.toLocaleString()} HP</span>}
                    {enemy.hp_per_healer > 0 && <span>치유 인원당 +{enemy.hp_per_healer.toLocaleString()} HP</span>}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  {enemy.skills.map((skill, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", SKILL_TYPE_COLOR[skill.skill_type as SkillType] ?? "bg-primary-light/20 text-ivory/85")}>
                        {skill.skill_type}
                      </span>
                      <span className="font-medium text-ivory">{skill.name}</span>
                      {skill.skill_type === "소환" ? (
                        <span className="text-muted">
                          {skill.summon_name} (HP {(skill.summon_hp ?? 0).toLocaleString()} / 공격 {skill.summon_attack ?? 0}) ×{skill.summon_count ?? 1}
                        </span>
                      ) : (
                        <span className="text-muted">
                          타겟 {skill.target_count}명 / 피해 {skill.damage_percent}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editingEnemy
            ? `에너미 수정 · ${form.chapter || "없음"}`
            : `에너미 추가 · ${selectedChapter === ALL_CHAPTERS ? "" : selectedChapter}`
        }
      >
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-ivory">이름</label>
            <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="에너미 이름" required />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-ivory">이미지</label>
            <div className="flex items-center gap-4">
              <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-inset">
                {imagePreview ? (
                  // blob: 미리보기 URL은 next/image 옵티마이저가 처리할 수 없어 unoptimized로 렌더링한다.
                  <Image src={imagePreview} alt="에너미 이미지 미리보기" fill unoptimized className="object-cover object-top" />
                ) : (
                  <ImageIcon size={22} className="text-muted" />
                )}
              </div>
              <div className="space-y-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="block text-sm text-ivory/85 file:mr-3 file:rounded-lg file:border-0 file:bg-gold/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gold hover:file:bg-gold/15"
                />
                <p className="text-xs text-muted">업로드 시 자동으로 WebP로 변환되며, 5MB를 넘으면 실패합니다.</p>
              </div>
            </div>
          </div>

          {editingEnemy && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-ivory">챕터</label>
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
          )}

          <div className="rounded-xl border border-line bg-inset px-4 py-4 flex flex-col gap-3">
            <p className="text-xs font-semibold tracking-widest text-muted uppercase">체력 / 공격력</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-ivory/85">기본 체력</label>
                <Input type="number" min={0} value={form.base_hp} onChange={(e) => setField("base_hp", e.target.value)} placeholder="0" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-ivory/85">공격력</label>
                <Input type="number" min={0} value={form.attack} onChange={(e) => setField("attack", e.target.value)} placeholder="0" />
              </div>
            </div>
            <p className="text-xs font-semibold text-muted">인원당 증가 체력</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { key: "hp_per_attacker" as const, label: "공격 인원" },
                { key: "hp_per_defender" as const, label: "수비 인원" },
                { key: "hp_per_healer" as const, label: "치유 인원" },
              ].map(({ key, label }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-ivory/85">{label}</label>
                  <Input type="number" min={0} value={form[key]} onChange={(e) => setField(key, e.target.value)} placeholder="0" />
                </div>
              ))}
            </div>
          </div>

          {/* 스킬 세트 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-ivory">스킬 세트</label>
              <Button type="button" variant="outline" onClick={addSkill} className="h-7 px-3 text-xs gap-1">
                <Plus size={12} /> 스킬 추가
              </Button>
            </div>

            {form.skills.map((skill, idx) => {
              const isSummon = skill.skill_type === "소환";
              return (
                <div key={idx} className="rounded-xl border border-line bg-surface px-4 py-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted">스킬 {idx + 1}</span>
                    {form.skills.length > 1 && (
                      <Button type="button" variant="ghost" onClick={() => removeSkill(idx)} className="h-6 w-6 p-0 text-muted hover:text-red-500">
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-ivory/85">스킬 유형</label>
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
                      <label className="text-xs font-semibold text-ivory/85">스킬명</label>
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
                        <label className="text-xs font-semibold text-ivory/85">타겟 인원</label>
                        <Input
                          type="number" min={0} className="h-8 text-xs"
                          value={skill.target_count}
                          onChange={(e) => updateSkill(idx, "target_count", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-ivory/85">피해량 (%)</label>
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
                        <label className="text-xs font-semibold text-ivory/85">소환수 이름</label>
                        <Input
                          className="h-8 text-xs"
                          value={skill.summon_name}
                          onChange={(e) => updateSkill(idx, "summon_name", e.target.value)}
                          placeholder="소환수 이름"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-ivory/85">소환수 이미지</label>
                        <div className="flex items-center gap-3">
                          <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-inset">
                            {skill.summon_image_preview ? (
                              <Image src={skill.summon_image_preview} alt="소환수 이미지 미리보기" fill unoptimized className="object-cover object-top" />
                            ) : (
                              <ImageIcon size={16} className="text-muted" />
                            )}
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleSummonImageChange(idx, e)}
                            className="block text-xs text-ivory/85 file:mr-2 file:rounded-lg file:border-0 file:bg-gold/10 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-gold hover:file:bg-gold/15"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-ivory/85">소환수 체력</label>
                          <Input
                            type="number" min={0} className="h-8 text-xs"
                            value={skill.summon_hp}
                            onChange={(e) => updateSkill(idx, "summon_hp", e.target.value)}
                            placeholder="0"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-ivory/85">소환수 공격력</label>
                          <Input
                            type="number" min={0} className="h-8 text-xs"
                            value={skill.summon_attack}
                            onChange={(e) => updateSkill(idx, "summon_attack", e.target.value)}
                            placeholder="0"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-ivory/85">소환 인원수</label>
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
            {editingEnemy ? <Pencil size={15} /> : <Plus size={15} />}
            {submitting
              ? (editingEnemy ? "수정 중..." : "추가 중...")
              : (editingEnemy ? "수정 완료" : "에너미 추가")}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
