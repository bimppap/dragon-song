"use client";

import { useEffect, useState } from "react";
import { Coins, Flame, Gem, Heart, Shield, Sparkles, Sword, Trophy, UserPlus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createCharacter, fetchSkillNodes, formatEffect } from "@/lib/api";
import type { Character, Faction, SkillBook, SkillNode } from "@/lib/api";
import AlertBanner from "@/components/common/AlertBanner";

type CharacterCreateForm = {
  name: string;
  hp: string;
  hp_max: string;
  hp_max_p: string;
  hp_regen_true: string;
  hp_regen_fixed: string;
  mp: string;
  mp_max: string;
  mp_regen: string;
  atk: string;
  atk_p: string;
  def: string;
  def_p: string;
  def_eff: string;
  attn: string;
  presence: string;
  heal_eff: string;
  sh: string;
  dmg_p: string;
  dmg_r: string;
  skill_lv: string;
  skill_eff_true: string;
  skill_eff_fixed: string;
  skill_cost: string;
  skill_target: string;
  stat_courage: string;
  stat_endurance: string;
  stat_charity: string;
  stat_wisdom: string;
  start_sh: string;
  revive_hp: string;
  act_time: string;
  over_heal: boolean;
  gold: string;
  cp: string;
  ap: string;
  lv: string;
  rank: string;
  exp: string;
};

type NumericFormField = Exclude<keyof CharacterCreateForm, "name" | "over_heal">;

const EMPTY_FORM: CharacterCreateForm = {
  name: "",
  hp: "100",
  hp_max: "100",
  hp_max_p: "100",
  hp_regen_true: "0",
  hp_regen_fixed: "100",
  mp: "0",
  mp_max: "0",
  mp_regen: "0",
  atk: "10",
  atk_p: "100",
  def: "10",
  def_p: "100",
  def_eff: "100",
  attn: "0",
  presence: "100",
  heal_eff: "100",
  sh: "0",
  dmg_p: "100",
  dmg_r: "100",
  skill_lv: "0",
  skill_eff_true: "0",
  skill_eff_fixed: "100",
  skill_cost: "0",
  skill_target: "0",
  stat_courage: "0",
  stat_endurance: "0",
  stat_charity: "0",
  stat_wisdom: "0",
  start_sh: "0",
  revive_hp: "10",
  act_time: "1",
  over_heal: false,
  gold: "0",
  cp: "0",
  ap: "10",
  lv: "1",
  rank: "1",
  exp: "0",
};

const STAT_CONFIG = [
  { name: "hp_max", label: "최대 체력", icon: Heart,   color: "text-rose-500" },
  { name: "mp_max", label: "최대 마나", icon: Zap,      color: "text-sky-500" },
  { name: "atk",     label: "공격력",   icon: Sword,    color: "text-orange-500" },
  { name: "def",     label: "방어력",   icon: Shield,   color: "text-blue-500" },
  { name: "gold",    label: "골드",     icon: Coins,    color: "text-yellow-500" },
  { name: "cp",      label: "CP",       icon: Gem,      color: "text-cyan-500" },
  { name: "ap",      label: "AP",       icon: Flame,    color: "text-gold" },
  { name: "lv",      label: "성장 등급", icon: Trophy,   color: "text-emerald-500" },
  { name: "rank",    label: "모험가 등급", icon: Trophy, color: "text-gold" },
  { name: "exp",     label: "경험치",   icon: Sparkles, color: "text-gold" },
] as const;

const DETAIL_STAT_CONFIG: { name: NumericFormField; label: string; percent?: boolean }[] = [
  { name: "hp", label: "현재 체력" },
  { name: "hp_max_p", label: "체력 증폭 (%)", percent: true },
  { name: "hp_regen_true", label: "체력 재생력 (고정)" },
  { name: "hp_regen_fixed", label: "체력 재생력 (비례 %)", percent: true },
  { name: "mp", label: "현재 마나" },
  { name: "mp_regen", label: "마나 재생력" },
  { name: "atk_p", label: "공격력 증폭 (%)", percent: true },
  { name: "def_p", label: "방어력 증폭 (%)", percent: true },
  { name: "def_eff", label: "방어 효율 (%)", percent: true },
  { name: "attn", label: "주목도" },
  { name: "presence", label: "존재감 (%)", percent: true },
  { name: "heal_eff", label: "치유 효율 (%)", percent: true },
  { name: "sh", label: "보호막" },
  { name: "dmg_p", label: "피해 증폭 (%)", percent: true },
  { name: "dmg_r", label: "피해 감소 (%)", percent: true },
  { name: "skill_lv", label: "기술 등급" },
  { name: "skill_eff_true", label: "기술 효율 (고정)" },
  { name: "skill_eff_fixed", label: "기술 효율 (비례 %)", percent: true },
  { name: "skill_cost", label: "기술 비용" },
  { name: "skill_target", label: "기술 대상" },
  { name: "stat_courage", label: "용기" },
  { name: "stat_endurance", label: "인내" },
  { name: "stat_charity", label: "자애" },
  { name: "stat_wisdom", label: "지혜" },
];

const ADMIN_STAT_CONFIG: { name: "start_sh" | "revive_hp" | "act_time"; label: string; percent?: boolean }[] = [
  { name: "start_sh", label: "시작 보호막" },
  { name: "revive_hp", label: "부활 후 체력 (%)", percent: true },
  { name: "act_time", label: "행동 횟수" },
];

interface Props {
  onCreated: (character: Character) => void;
}

export default function CharacterCreate({ onCreated }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [faction, setFaction] = useState<Faction | null>(null);
  const [skillBook, setSkillBook] = useState<SkillBook | null>(null);
  const [skillNodes, setSkillNodes] = useState<SkillNode[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!skillBook) return;
    let cancelled = false;
    fetchSkillNodes(skillBook)
      .then((nodes) => { if (!cancelled) setSkillNodes(nodes); })
      .catch((error) => { if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "기술 조회에 실패했습니다."); });
    return () => { cancelled = true; };
  }, [skillBook]);

  function handleFactionChange(value: string) {
    setFaction(value === "none" ? null : value as Faction);
  }

  function handleSkillBookChange(value: string) {
    setSkillBook(value === "none" ? null : value as SkillBook);
    setSkillNodes([]);
    setSelectedSkillIds(new Set());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const createdCharacter = await createCharacter({
        name: form.name,
        faction,
        skill_node_ids: [...selectedSkillIds],
        hp: Number(form.hp),
        hp_max: Number(form.hp_max),
        hp_max_p: Number(form.hp_max_p) / 100 - 1,
        hp_regen_true: Number(form.hp_regen_true),
        hp_regen_fixed: Number(form.hp_regen_fixed) / 100 - 1,
        mp: Number(form.mp),
        mp_max: Number(form.mp_max),
        mp_regen: Number(form.mp_regen),
        atk: Number(form.atk),
        atk_p: Number(form.atk_p) / 100 - 1,
        def: Number(form.def),
        def_p: Number(form.def_p) / 100 - 1,
        def_eff: Number(form.def_eff) / 100 - 1,
        attn: Number(form.attn),
        presence: Number(form.presence) / 100 - 1,
        heal_eff: Number(form.heal_eff) / 100 - 1,
        sh: Number(form.sh),
        dmg_p: Number(form.dmg_p) / 100 - 1,
        dmg_r: Number(form.dmg_r) / 100 - 1,
        skill_lv: Number(form.skill_lv),
        skill_eff_true: Number(form.skill_eff_true),
        skill_eff_fixed: Number(form.skill_eff_fixed) / 100 - 1,
        skill_cost: Number(form.skill_cost),
        skill_target: Number(form.skill_target),
        stat_courage: Number(form.stat_courage),
        stat_endurance: Number(form.stat_endurance),
        stat_charity: Number(form.stat_charity),
        stat_wisdom: Number(form.stat_wisdom),
        start_sh: Number(form.start_sh),
        revive_hp: Number(form.revive_hp) / 100,
        act_time: Number(form.act_time),
        over_heal: form.over_heal,
        gold: Number(form.gold),
        cp: Number(form.cp),
        ap: Number(form.ap),
        lv: Number(form.lv),
        rank: Number(form.rank),
        exp: Number(form.exp),
      });
      setForm(EMPTY_FORM);
      setFaction(null);
      setSkillBook(null);
      setSelectedSkillIds(new Set());
      setErrorMessage(null);
      onCreated(createdCharacter);
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "캐릭터 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const field = e.target.name as keyof CharacterCreateForm;
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  return (
    <section className="flex max-w-5xl flex-col gap-5">
      {errorMessage && (
        <AlertBanner>{errorMessage}</AlertBanner>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide">이름</label>
          <Input
            name="name"
            placeholder="캐릭터 이름"
            value={form.name}
            onChange={handleChange}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">진영</label>
          <Select value={faction ?? "none"} onValueChange={handleFactionChange}>
            <SelectTrigger><SelectValue placeholder="진영 선택" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">선택 안 함</SelectItem>
                {(["공격", "수비", "치유"] as Faction[]).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">초기 기술 서</label>
          <p className="text-xs text-muted">기술트리는 역할(진영)과 무관합니다. 기술을 선택할 서를 골라주세요.</p>
          <Select value={skillBook ?? "none"} onValueChange={handleSkillBookChange}>
            <SelectTrigger><SelectValue placeholder="서 선택" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">선택 안 함</SelectItem>
                {(["용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"] as SkillBook[]).map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {skillBook && (
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">초기 기술</p>
              <p className="mt-1 text-xs text-muted">선행 기술, 계열, AP 제한 없이 원하는 기술을 선택할 수 있습니다.</p>
            </div>
            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto border-y border-line py-2 sm:grid-cols-2">
              {skillNodes.map((node) => (
                <label key={node.id} className="flex cursor-pointer items-start gap-2 px-1 py-1.5">
                  <Checkbox
                    checked={selectedSkillIds.has(node.id)}
                    onCheckedChange={(checked) => setSelectedSkillIds((current) => {
                      const next = new Set(current);
                      if (checked) next.add(node.id); else next.delete(node.id);
                      return next;
                    })}
                  />
                  <span className="min-w-0 text-sm text-ivory">
                    <span className="block font-semibold">{node.default_name}</span>
                    <span className="block text-xs text-muted">{node.effects.length ? node.effects.map(formatEffect).join(", ") : "효과 없음"}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-y border-line py-4">
          <div>
            <p className="text-sm font-semibold text-ivory">기본 능력치</p>
            <p className="mt-1 text-xs text-muted">생성 시 사용할 기본 자원과 능력치를 설정합니다.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {STAT_CONFIG.map(({ name, label, icon: Icon, color }) => (
              <div key={name} className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  <Icon size={11} className={color} />
                  {label}
                </label>
                <Input
                  name={name}
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form[name]}
                  onChange={handleChange}
                  required
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-line pb-4">
          <div>
            <p className="text-sm font-semibold text-ivory">상세 능력치</p>
            <p className="mt-1 text-xs text-muted">제한 없이 직접 입력할 수 있으며, 비율 항목은 화면에 보일 % 기준으로 입력합니다.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {DETAIL_STAT_CONFIG.map(({ name, label, percent }) => (
              <div key={name} className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted">{label}</label>
                <Input
                  name={name}
                  type="number"
                  step={percent ? "any" : 1}
                  value={form[name]}
                  onChange={handleChange}
                  required
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-gold/30 pb-4">
          <div>
            <p className="text-sm font-semibold text-gold">관리자 전용 능력치</p>
            <p className="mt-1 text-xs text-muted">러너에게 숨겨지는 관리자 전용 수치입니다.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {ADMIN_STAT_CONFIG.map(({ name, label, percent }) => (
              <div key={name} className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gold">{label}</label>
                <Input
                  name={name}
                  type="number"
                  step={percent ? "any" : 1}
                  value={form[name]}
                  onChange={handleChange}
                  required
                />
              </div>
            ))}
            <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm font-semibold text-gold">
              <Checkbox
                checked={form.over_heal}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, over_heal: checked === true }))}
              />
              오버힐 허용
            </label>
          </div>
        </div>

        <Button type="submit" disabled={loading}>
          <UserPlus size={15} />
          {loading ? "생성 중..." : "생성하기"}
        </Button>
      </form>
    </section>
  );
}
