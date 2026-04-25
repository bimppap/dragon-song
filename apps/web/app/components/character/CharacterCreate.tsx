"use client";

import { useState } from "react";
import { Coins, Flame, Heart, Shield, Sparkles, Sword, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCharacter } from "@/lib/api";
import type { Character } from "@/lib/api";

type CharacterCreateForm = {
  name: string;
  hp: string;
  attack: string;
  defense: string;
  gold: string;
  ap: string;
  experience: string;
};

const EMPTY_FORM: CharacterCreateForm = {
  name: "",
  hp: "",
  attack: "",
  defense: "",
  gold: "1000",
  ap: "10",
  experience: "1",
};

const STAT_CONFIG = [
  { name: "hp",      label: "HP",   icon: Heart,  color: "text-rose-500" },
  { name: "attack",  label: "공격력", icon: Sword,  color: "text-orange-500" },
  { name: "defense", label: "방어력", icon: Shield, color: "text-blue-500" },
  { name: "gold",    label: "골드",  icon: Coins,  color: "text-yellow-500" },
  { name: "ap", label: "AP", icon: Flame, color: "text-indigo-500" },
  { name: "experience", label: "경험치", icon: Sparkles, color: "text-violet-500" },
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
        hp: Number(form.hp),
        attack: Number(form.attack),
        defense: Number(form.defense),
        gold: Number(form.gold),
        ap: Number(form.ap),
        experience: Number(form.experience),
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
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMessage}
        </div>
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
                min={name === "ap" || name === "experience" ? 1 : 0}
                placeholder="0"
                value={form[name]}
                onChange={handleChange}
                required
              />
            </div>
          ))}
        </div>

        <Button type="submit" disabled={loading}>
          <UserPlus size={15} />
          {loading ? "생성 중..." : "생성하기"}
        </Button>
      </form>
    </section>
  );
}
