"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CloudFog, Footprints, Image as ImageIcon, Pencil, Plus, Sparkles, Trash2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  createEnvironment,
  deleteEnemy,
  deleteEnvironment,
  fetchChapters,
  fetchEnemies,
  fetchEnvironments,
  updateChapter,
  updateEnemy,
  updateEnvironment,
  uploadEnemyImage,
  uploadEnemySummonImage,
} from "@/lib/api";
import type { Chapter, Enemy, EnemyCreate, EnemySkill, Environment } from "@/lib/api";
import { cn, parsePositiveInt, todayDateValue } from "@/lib/utils";
import { useDialog } from "@/components/common/DialogProvider";
import { useToast } from "@/components/common/ToastProvider";
import EmptyState from "@/components/common/EmptyState";

const SKILL_TYPES = ["지정 공격A", "지정 공격B", "광역 공격A", "광역 공격B", "소환", "지속 디버프"] as const;
type SkillType = (typeof SKILL_TYPES)[number];

const EFFECT_STATS = [
  ["atk", "공격력"], ["atk_p", "공격력 증가율 (%)"], ["def", "방어력"], ["def_p", "방어력 증가율 (%)"],
  ["def_eff", "방어 효율 (%)"], ["dmg_p", "피해 증가율 (%)"], ["dmg_r", "피해 감소율 (%)"], ["heal_eff", "치유 효율 (%)"],
  ["attn", "주목도"], ["presence", "존재감 (%)"], ["skill_eff_fixed", "기술 효율 (%)"], ["skill_eff_true", "고정 기술 효율"],
  ["skill_target", "기술 대상 수"], ["hp_regen_true", "고정 체력 재생"], ["hp_regen_fixed", "체력 재생률 (%)"], ["mp_regen", "마나 재생"],
];
const EMPTY_SETTING_VALUE = "__empty_setting__";

function SettingSelect({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return <div className="flex min-w-0 flex-col gap-1.5 text-xs text-ivory/85">
    <span>{label}</span>
    <Select value={value || EMPTY_SETTING_VALUE} onValueChange={(next) => onChange(next === EMPTY_SETTING_VALUE ? "" : next)}>
      <SelectTrigger aria-label={label} className="h-auto min-h-9 text-xs [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:text-left">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>{options.map(([key, text]) => <SelectItem key={key || EMPTY_SETTING_VALUE} value={key || EMPTY_SETTING_VALUE}>{text}</SelectItem>)}</SelectGroup>
      </SelectContent>
    </Select>
  </div>;
}

const ALL_CHAPTERS = "__all__";

type SkillFormEntry = {
  manual_target_count: boolean;
  debuff_stat: string;
  debuff_amount: string;
  debuff_stackable: boolean;
  summon_action_type: "attack" | "explosion" | "debuff" | "buff";
  summon_trigger_phase: "telegraph" | "ally" | "enemy";
  summon_effect_stat: string;
  summon_effect_percent: string;
  summon_buff_enemy_id: string;
  summon_buff_stat: "attack" | "damage";
  skill_type: SkillType;
  name: string;
  target_count: string;
  damage_percent: string;
  summon_name: string;
  summon_hp: string;
  summon_attack: string;
  summon_count: string;
  /** 이미 업로드되어 저장된 하수인 이미지 URL. */
  summon_image_url: string | null;
  /** 아직 업로드하지 않은, 선택만 해둔 하수인 이미지 파일. */
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
  manual_target_count: false, debuff_stat: "atk", debuff_amount: "0", debuff_stackable: false,
  summon_action_type: "attack", summon_trigger_phase: "enemy", summon_effect_stat: "atk",
  summon_effect_percent: "0", summon_buff_enemy_id: "", summon_buff_stat: "attack",
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
      manual_target_count: s.manual_target_count,
      debuff_stat: s.debuff_stat, debuff_amount: Number(s.debuff_amount) || 0, debuff_stackable: s.debuff_stackable,
      summon_action_type: s.summon_action_type, summon_trigger_phase: s.summon_trigger_phase,
      summon_effect_stat: s.summon_effect_stat, summon_effect_percent: Number(s.summon_effect_percent) || 0,
      summon_buff_enemy_id: s.summon_buff_enemy_id ? Number(s.summon_buff_enemy_id) : null, summon_buff_stat: s.summon_buff_stat,
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
          manual_target_count: s.manual_target_count ?? false,
          debuff_stat: s.debuff_stat ?? "atk", debuff_amount: String(s.debuff_amount ?? 0), debuff_stackable: s.debuff_stackable ?? false,
          summon_action_type: s.summon_action_type ?? "attack", summon_trigger_phase: s.summon_trigger_phase ?? "enemy",
          summon_effect_stat: s.summon_effect_stat ?? "atk", summon_effect_percent: String(s.summon_effect_percent ?? 0),
          summon_buff_enemy_id: s.summon_buff_enemy_id != null ? String(s.summon_buff_enemy_id) : "", summon_buff_stat: s.summon_buff_stat ?? "attack",
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
  "지속 디버프": "bg-purple-500/20 text-purple-300",
};

export default function EnemyTab() {
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [chapterList, setChapterList] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<string>(ALL_CHAPTERS);
  const [rewardDraft, setRewardDraft] = useState({ victory: "0", action: "0", exp: "0" });
  const [rewardSaving, setRewardSaving] = useState(false);
  const [chaptersLoaded, setChaptersLoaded] = useState(false);
  const [form, setForm] = useState<EnemyFormState>(DEFAULT_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEnemy, setEditingEnemy] = useState<Enemy | null>(null);
  const { toast } = useToast();
  const { confirm } = useDialog();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [environmentsLoading, setEnvironmentsLoading] = useState(false);
  const [environmentDraft, setEnvironmentDraft] = useState({ name: "", color: "#e879f9", stackable: true, dispellable: false, enemy_condition: "always" as Environment["enemy_condition"], condition_enemy_id: "", stacks_per_round: "1", damage_per_stack: "0" });
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<number | null>(null);
  const [environmentSaving, setEnvironmentSaving] = useState(false);
  const [deletingEnvironmentId, setDeletingEnvironmentId] = useState<number | null>(null);

  const selectedChapterData = chapterList.find((chapter) => chapter.name === selectedChapter) ?? null;
  const rewardDirty = selectedChapterData != null && (
    String(selectedChapterData.battle_victory_reward_gold) !== rewardDraft.victory
    || String(selectedChapterData.battle_action_reward_gold) !== rewardDraft.action
    || String(selectedChapterData.battle_participation_reward_exp) !== rewardDraft.exp
  );

  function rewardDraftFrom(chapter: Chapter) {
    return {
      victory: String(chapter.battle_victory_reward_gold),
      action: String(chapter.battle_action_reward_gold),
      exp: String(chapter.battle_participation_reward_exp),
    };
  }

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
          setRewardDraft(rewardDraftFrom(defaultChapter));
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setEnvironmentDraft({ name: "", color: "#e879f9", stackable: true, dispellable: false, enemy_condition: "always" as Environment["enemy_condition"], condition_enemy_id: "", stacks_per_round: "1", damage_per_stack: "0" });
      setEditingEnvironmentId(null);
      if (!chaptersLoaded || selectedChapter === ALL_CHAPTERS) { setEnvironments([]); return; }
      setEnvironmentsLoading(true);
      try {
        const list = await fetchEnvironments(selectedChapter);
        if (!cancelled) setEnvironments(list);
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : "환경을 불러오지 못했습니다.", "error");
      } finally {
        if (!cancelled) setEnvironmentsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [chaptersLoaded, selectedChapter, toast]);

  function startEditEnvironment(environment: Environment) {
    setEditingEnvironmentId(environment.id);
    setEnvironmentDraft({
      name: environment.name,
      color: environment.color,
      stackable: environment.stackable,
      dispellable: environment.dispellable,
      enemy_condition: environment.enemy_condition,
      condition_enemy_id: environment.condition_enemy_id != null ? String(environment.condition_enemy_id) : "",
      stacks_per_round: String(environment.stacks_per_round),
      damage_per_stack: String(environment.damage_per_stack),
    });
  }

  function resetEnvironmentDraft() {
    setEditingEnvironmentId(null);
    setEnvironmentDraft({ name: "", color: "#e879f9", stackable: true, dispellable: false, enemy_condition: "always" as Environment["enemy_condition"], condition_enemy_id: "", stacks_per_round: "1", damage_per_stack: "0" });
  }

  async function handleEnvironmentSubmit() {
    if (selectedChapter === ALL_CHAPTERS || !environmentDraft.name.trim()) return;
    if (environmentDraft.enemy_condition !== "always" && !environmentDraft.condition_enemy_id) { toast("조건 에너미를 선택해 주세요.", "error"); return; }
    setEnvironmentSaving(true);
    try {
      const payload = {
        chapter: selectedChapter,
        name: environmentDraft.name.trim(),
        color: environmentDraft.color,
        stackable: environmentDraft.stackable,
        dispellable: environmentDraft.dispellable,
        enemy_condition: environmentDraft.enemy_condition,
        condition_enemy_id: environmentDraft.enemy_condition === "always" ? null : Number(environmentDraft.condition_enemy_id),
        stacks_per_round: parsePositiveInt(environmentDraft.stacks_per_round),
        damage_per_stack: parsePositiveInt(environmentDraft.damage_per_stack),
      };
      if (editingEnvironmentId != null) {
        const updated = await updateEnvironment(editingEnvironmentId, payload);
        setEnvironments((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      } else {
        const created = await createEnvironment(payload);
        setEnvironments((prev) => [...prev, created]);
      }
      resetEnvironmentDraft();
    } catch (e) {
      toast(e instanceof Error ? e.message : "환경 저장에 실패했습니다.", "error");
    } finally {
      setEnvironmentSaving(false);
    }
  }

  async function handleDeleteEnvironment(environment: Environment) {
    const ok = await confirm({
      title: "환경 삭제",
      description: `'${environment.name}' 환경을 삭제할까요?`,
      confirmText: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    setDeletingEnvironmentId(environment.id);
    try {
      await deleteEnvironment(environment.id);
      setEnvironments((prev) => prev.filter((e) => e.id !== environment.id));
      if (editingEnvironmentId === environment.id) resetEnvironmentDraft();
    } catch (e) {
      toast(e instanceof Error ? e.message : "환경 삭제에 실패했습니다.", "error");
    } finally {
      setDeletingEnvironmentId(null);
    }
  }

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

  async function handleDeleteEnemy() {
    if (!editingEnemy) return;
    const ok = await confirm({
      title: "에너미 삭제",
      description: "관련된 정보가 전부 사라집니다. 삭제하시겠습니까?",
      confirmText: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteEnemy(editingEnemy.id);
      setEnemies((prev) => prev.filter((e) => e.id !== editingEnemy.id));
      setEditingEnemy(null);
      setModalOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "에너미 삭제에 실패했습니다.", "error");
    } finally {
      setDeleting(false);
    }
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

  /** updateChapter는 챕터 레코드를 통째로 교체하므로, 지금 건드리지 않는 필드도 항상 현재 값으로 함께 보내야 한다. */
  function chapterPayloadBase(chapter: Chapter) {
    return {
      name: chapter.name,
      start_date: chapter.start_date,
      end_date: chapter.end_date,
      battle_date: chapter.battle_date,
      music_url: chapter.music_url,
      battle_victory_reward_gold: chapter.battle_victory_reward_gold,
      battle_action_reward_gold: chapter.battle_action_reward_gold,
      battle_participation_reward_exp: chapter.battle_participation_reward_exp,
    };
  }

  async function handleRewardSave() {
    if (!selectedChapterData) return;
    setRewardSaving(true);
    try {
      const updatedChapter = await updateChapter(selectedChapterData.id, {
        ...chapterPayloadBase(selectedChapterData),
        battle_victory_reward_gold: parsePositiveInt(rewardDraft.victory),
        battle_action_reward_gold: parsePositiveInt(rewardDraft.action),
        battle_participation_reward_exp: parsePositiveInt(rewardDraft.exp),
      });
      setChapterList((prev) => prev.map((chapter) => (chapter.id === updatedChapter.id ? updatedChapter : chapter)));
      setRewardDraft(rewardDraftFrom(updatedChapter));
      toast("보상 설정을 저장했습니다.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "보상 설정 저장에 실패했습니다.", "error");
    } finally {
      setRewardSaving(false);
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
                setRewardDraft(chapter ? rewardDraftFrom(chapter) : { victory: "0", action: "0", exp: "0" });
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

          {loading ? (
            <EmptyState>
              에너미 목록을 불러오는 중입니다.
            </EmptyState>
          ) : enemies.length === 0 ? (
            <EmptyState>
              {selectedChapter === ALL_CHAPTERS ? "등록된 에너미가 없습니다." : "이 챕터에 등록된 에너미가 없습니다."}
            </EmptyState>
          ) : (
          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {enemies.map((enemy) => (
              <div key={enemy.id} className="rounded-xl border border-line px-4 py-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-line bg-inset">
                      {enemy.image_url ? (
                        <Image src={enemy.image_url} alt={enemy.name} fill unoptimized className="object-cover object-top" />
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
                          {skill.summon_action_type && skill.summon_action_type !== "attack" && ` · ${{ explosion: "폭발", debuff: "약화", buff: "강화" }[skill.summon_action_type]} · ${skill.summon_trigger_phase === "telegraph" ? "다음 라운드 암시" : skill.summon_trigger_phase === "ally" ? "아군 행동" : "적 행동"}`}
                        </span>
                      ) : (
                        <span className="text-muted">
                          {skill.manual_target_count ? "타겟 수동 지정" : `타겟 ${skill.target_count}명`} / {skill.skill_type === "지속 디버프" ? `${EFFECT_STATS.find(([key]) => key === skill.debuff_stat)?.[1] ?? skill.debuff_stat} -${skill.debuff_amount} · ${skill.debuff_stackable ? "중첩 허용" : "중첩 불가"}` : `피해 ${skill.damage_percent}%`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          )}

          {selectedChapterData && (
            <div className="mb-5 flex flex-col gap-3 rounded-xl border border-line bg-inset/30 px-4 py-4">
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ivory">
                  <CloudFog size={14} className="text-muted" />
                  환경
                </p>
                <p className="text-xs text-muted">
                  매 라운드 &ldquo;적의 행동 암시&rdquo; 턴마다 캐릭터에게 스택이 쌓이고, (스택 수 − 1) × 스택당 피해를 입힙니다. 한 챕터에 여러 환경을 등록할 수 있습니다.
                </p>
              </div>

              {environmentsLoading ? (
                <p className="text-xs text-muted">환경을 불러오는 중입니다.</p>
              ) : environments.length > 0 && (
                <div className="flex flex-col gap-2">
                  {environments.map((environment) => (
                    <div key={environment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-ivory">{environment.name}</span>
                        <span className="text-xs text-muted">
                          <span className="mr-1 inline-block h-3 w-1 rotate-20 rounded-full" style={{ backgroundColor: environment.color }} aria-hidden="true" />
                          라운드당 스택 +{environment.stacks_per_round} · 스택당 {environment.damage_per_stack} 피해 · {environment.stackable ? "중첩 허용" : "중첩 불가"} · {environment.dispellable ? "해제 가능" : "해제 불가"}
                          {environment.enemy_condition !== "always" && ` · ${enemies.find((enemy) => enemy.id === environment.condition_enemy_id)?.name ?? "지정 에너미"} ${environment.enemy_condition === "alive" ? "생존 시" : "생존하지 않을 때"}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => startEditEnvironment(environment)}
                          className="h-7 w-7 text-muted hover:text-gold"
                          aria-label={`${environment.name} 수정`}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteEnvironment(environment)}
                          disabled={deletingEnvironmentId === environment.id}
                          className="h-7 w-7 text-muted hover:text-red-500"
                          aria-label={`${environment.name} 삭제`}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <SettingSelect label="환경 적용 조건" value={environmentDraft.enemy_condition} options={[["always", "항상 적용"], ["alive", "지정 에너미가 살아있을 때"], ["dead", "지정 에너미가 살아있지 않을 때"]]} onChange={(value) => setEnvironmentDraft((prev) => ({ ...prev, enemy_condition: value as Environment["enemy_condition"] }))} />
                {environmentDraft.enemy_condition !== "always" && <SettingSelect label="조건 에너미" value={environmentDraft.condition_enemy_id} options={[["", "에너미 선택"], ...enemies.filter((enemy) => enemy.chapter === selectedChapter).map((enemy) => [String(enemy.id), enemy.name])]} onChange={(value) => setEnvironmentDraft((prev) => ({ ...prev, condition_enemy_id: value }))} />}
                <label className="flex items-center gap-2 text-xs"><Checkbox checked={environmentDraft.dispellable} onCheckedChange={(checked) => setEnvironmentDraft((prev) => ({ ...prev, dispellable: checked === true }))} />기술·정화수로 해제 가능</label>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-ivory/85">스택 이름</label>
                  <Input
                    value={environmentDraft.name}
                    onChange={(e) => setEnvironmentDraft((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="예: 독개스"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-ivory/85">라운드당 쌓이는 스택</label>
                  <Input
                    type="number" min={0}
                    value={environmentDraft.stacks_per_round}
                    onChange={(e) => setEnvironmentDraft((prev) => ({ ...prev, stacks_per_round: e.target.value }))}
                    placeholder="1"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-ivory/85">스택당 피해량</label>
                  <Input
                    type="number" min={0}
                    value={environmentDraft.damage_per_stack}
                    onChange={(e) => setEnvironmentDraft((prev) => ({ ...prev, damage_per_stack: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="environment-color" className="text-xs font-semibold text-ivory/85">스택 색상</label>
                  <input id="environment-color" type="color" value={environmentDraft.color}
                    onChange={(event) => setEnvironmentDraft((prev) => ({ ...prev, color: event.target.value }))}
                    className="h-9 w-16 cursor-pointer rounded border border-line bg-surface p-1" />
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-ivory">
                    <input type="checkbox" checked={environmentDraft.stackable} className="accent-gold"
                      onChange={(event) => setEnvironmentDraft((prev) => ({ ...prev, stackable: event.target.checked }))} />
                    중첩 허용
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleEnvironmentSubmit}
                    disabled={environmentSaving || !environmentDraft.name.trim()}
                  >
                    {environmentSaving ? "저장 중..." : editingEnvironmentId != null ? "수정 완료" : "환경 추가"}
                  </Button>
                  {editingEnvironmentId != null && (
                    <Button type="button" variant="ghost" onClick={resetEnvironmentDraft}>취소</Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {selectedChapterData && (
            <div className="mb-5 flex flex-col gap-3 rounded-xl border border-line bg-inset/30 px-4 py-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-ivory">실전 전투 보상</p>
                <p className="text-xs text-muted">
                  실전 전투가 끝나면 전투 페이지 상단의 보상 전송 카드에서 이 값을 기준으로 계산된 보상을 확인하고 지급할 수 있습니다.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-ivory/85">
                    <Trophy size={13} className="text-gold" />
                    승리보상 (골드, 1라운드 이상 참여한 전원)
                  </label>
                  <div className="relative">
                    <Input
                      type="number" min={0}
                      value={rewardDraft.victory}
                      onChange={(e) => setRewardDraft((prev) => ({ ...prev, victory: e.target.value }))}
                      placeholder="0"
                      className="pr-8"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">G</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-ivory/85">
                    <Footprints size={13} className="text-emerald-400" />
                    행동보상 (골드, 무반응 제외 행동 라운드당)
                  </label>
                  <div className="relative">
                    <Input
                      type="number" min={0}
                      value={rewardDraft.action}
                      onChange={(e) => setRewardDraft((prev) => ({ ...prev, action: e.target.value }))}
                      placeholder="0"
                      className="pr-8"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">G</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-ivory/85">
                    <Sparkles size={13} className="text-cyan-400" />
                    전원보상 (경험치, 참여 여부 무관 전체 러너)
                  </label>
                  <Input
                    type="number" min={0}
                    value={rewardDraft.exp}
                    onChange={(e) => setRewardDraft((prev) => ({ ...prev, exp: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="self-end"
                onClick={handleRewardSave}
                disabled={rewardSaving || !rewardDirty}
              >
                {rewardSaving ? "저장 중..." : "보상 설정 저장"}
              </Button>
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
                        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={skill.manual_target_count} onChange={(event) => updateSkill(idx, "manual_target_count", event.target.checked)} />수동 지정 (매 라운드 선택)</label>
                        <Input
                          type="number" min={0} className="h-8 text-xs"
                          disabled={skill.manual_target_count}
                          value={skill.target_count}
                          onChange={(e) => updateSkill(idx, "target_count", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-ivory/85">피해량 (%)</label>
                        <Input
                          type="number" min={0} className="h-8 text-xs"
                          disabled={skill.skill_type === "지속 디버프"}
                          value={skill.damage_percent}
                          onChange={(e) => updateSkill(idx, "damage_percent", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}

                  {skill.skill_type === "지속 디버프" && <div className="grid gap-2 sm:grid-cols-3">
                    <SettingSelect label="감소 능력치" value={skill.debuff_stat} options={EFFECT_STATS} onChange={(value) => updateSkill(idx, "debuff_stat", value)} />
                    <label className="text-xs">감소량 {EFFECT_STATS.find(([key]) => key === skill.debuff_stat)?.[1].includes("%") ? "(%)" : "(수치)"}<Input type="number" min={0} step="any" value={skill.debuff_amount} onChange={(event) => updateSkill(idx, "debuff_amount", event.target.value)} /></label>
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={skill.debuff_stackable} onChange={(event) => updateSkill(idx, "debuff_stackable", event.target.checked)} />중첩 허용</label>
                  </div>}
                  {isSummon && (
                    <div className="flex flex-col gap-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <SettingSelect label="하수인 공격 타입" value={skill.summon_action_type} options={[["attack", "일반 공격"], ["explosion", "폭발"], ["debuff", "약화"], ["buff", "강화"]]} onChange={(value) => updateSkill(idx, "summon_action_type", value as SkillFormEntry["summon_action_type"])} />
                        {skill.summon_action_type !== "attack" && <SettingSelect label="발동 턴" value={skill.summon_trigger_phase} options={[["telegraph", "다음 라운드 암시"], ["ally", "이번 라운드 아군의 행동"], ["enemy", "이번 라운드 적의 행동"]]} onChange={(value) => updateSkill(idx, "summon_trigger_phase", value as SkillFormEntry["summon_trigger_phase"])} />}
                        {skill.summon_action_type === "debuff" && <SettingSelect label="감소 능력치" value={skill.summon_effect_stat} options={EFFECT_STATS} onChange={(value) => updateSkill(idx, "summon_effect_stat", value)} />}
                        {skill.summon_action_type === "buff" && <>
                          <SettingSelect label="강화할 에너미" value={skill.summon_buff_enemy_id} options={[["", "소환한 에너미"], ...enemies.filter((enemy) => enemy.chapter === form.chapter).map((enemy) => [String(enemy.id), enemy.name])]} onChange={(value) => updateSkill(idx, "summon_buff_enemy_id", value)} />
                          <SettingSelect label="증가 능력치" value={skill.summon_buff_stat} options={[["attack", "공격력"], ["damage", "피해량"]]} onChange={(value) => updateSkill(idx, "summon_buff_stat", value as SkillFormEntry["summon_buff_stat"])} />
                        </>}
                        {(skill.summon_action_type === "buff" || skill.summon_action_type === "debuff") && <label className="text-xs">{skill.summon_action_type === "buff" ? "증가" : "감소"}량 (%)<Input type="number" min={0} step="any" value={skill.summon_effect_percent} onChange={(event) => updateSkill(idx, "summon_effect_percent", event.target.value)} /></label>}
                      </div>
                      {skill.summon_action_type !== "attack" && <p className="text-xs text-muted">{skill.summon_action_type === "explosion" ? "광역 피해를 주고 소멸합니다. 공격력에 폭발 피해량을 입력하세요." : "살아 있는 동안 매 라운드 지정 턴에 반복 발동합니다."}</p>}

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-ivory/85">하수인 이름</label>
                        <Input
                          className="h-8 text-xs"
                          value={skill.summon_name}
                          onChange={(e) => updateSkill(idx, "summon_name", e.target.value)}
                          placeholder="하수인 이름"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-ivory/85">하수인 이미지</label>
                        <div className="flex items-center gap-3">
                          <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-inset">
                            {skill.summon_image_preview ? (
                              <Image src={skill.summon_image_preview} alt="하수인 이미지 미리보기" fill unoptimized className="object-cover object-top" />
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
                          <label className="text-xs font-semibold text-ivory/85">하수인 체력</label>
                          <Input
                            type="number" min={0} className="h-8 text-xs"
                            value={skill.summon_hp}
                            onChange={(e) => updateSkill(idx, "summon_hp", e.target.value)}
                            placeholder="0"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-ivory/85">하수인 공격력</label>
                          <Input
                            type="number" min={0} className="h-8 text-xs"
                            value={skill.summon_attack}
                            onChange={(e) => updateSkill(idx, "summon_attack", e.target.value)}
                            placeholder="0"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-ivory/85">하수인 수</label>
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

          <div className="flex items-center gap-2">
            <Button type="submit" className="flex-1" disabled={submitting || deleting}>
              {editingEnemy ? <Pencil size={15} /> : <Plus size={15} />}
              {submitting
                ? (editingEnemy ? "수정 중..." : "추가 중...")
                : (editingEnemy ? "수정 완료" : "에너미 추가")}
            </Button>
            {editingEnemy && (
              <Button type="button" variant="destructive" onClick={handleDeleteEnemy} disabled={submitting || deleting}>
                <Trash2 size={15} />
                {deleting ? "삭제 중..." : "삭제"}
              </Button>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
