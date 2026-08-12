"use client";

import { useState } from "react";
import { Coins, Flame, Gem, Heart, Shield, Sparkles, Sword, Trophy, UserPlus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCharacter } from "@/lib/api";
import type { Character } from "@/lib/api";
import AlertBanner from "@/components/common/AlertBanner";

type CharacterCreateForm = {
  name: string;
  hp_max: string;
  mp_max: string;
  atk: string;
  def: string;
  gold: string;
  cp: string;
  ap: string;
  lv: string;
  rank: string;
  exp: string;
};

const EMPTY_FORM: CharacterCreateForm = {
  name: "",
  hp_max: "100",
  mp_max: "0",
  atk: "10",
  def: "10",
  gold: "1000",
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
  { name: "ap",      label: "AP",       icon: Flame,    color: "text-indigo-500" },
  { name: "lv",      label: "성장 등급", icon: Trophy,   color: "text-emerald-500" },
  { name: "rank",    label: "모험가 등급", icon: Trophy, color: "text-amber-500" },
  { name: "exp",     label: "경험치",   icon: Sparkles, color: "text-violet-500" },
] as const;

interface Props {
  onCreated: (character: Character) => void;
}

export default function CharacterCreate({ onCreated }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const createdCharacter = await createCharacter({
        name: form.name,
        hp: Number(form.hp_max),
        hp_max: Number(form.hp_max),
        mp: Number(form.mp_max),
        mp_max: Number(form.mp_max),
        atk: Number(form.atk),
        def: Number(form.def),
        gold: Number(form.gold),
        cp: Number(form.cp),
        ap: Number(form.ap),
        lv: Number(form.lv),
        rank: Number(form.rank),
        exp: Number(form.exp),
      });
      setForm(EMPTY_FORM);
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
    <section className="max-w-lg flex flex-col gap-5">
      {errorMessage && (
        <AlertBanner>{errorMessage}</AlertBanner>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">이름</label>
          <Input
            name="name"
            placeholder="캐릭터 이름"
            value={form.name}
            onChange={handleChange}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {STAT_CONFIG.map(({ name, label, icon: Icon, color }) => (
            <div key={name} className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">
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
        <p className="text-xs text-slate-400">
          위 항목 외의 상세 능력치(공격력 증폭, 방어 효율, 기술 관련 등)는 0으로 생성되며, 상세정보에서 확인할 수 있습니다.
        </p>

        <Button type="submit" disabled={loading}>
          <UserPlus size={15} />
          {loading ? "생성 중..." : "생성하기"}
        </Button>
      </form>
    </section>
  );
}
