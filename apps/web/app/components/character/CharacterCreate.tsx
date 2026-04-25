"use client";

import { useState } from "react";
import { UserPlus, Sword, Shield, Heart, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const EMPTY_FORM = { name: "", hp: "", attack: "", defense: "", gold: "1000" };

const STAT_CONFIG = [
  { name: "hp",      label: "HP",   icon: Heart,  color: "text-rose-500" },
  { name: "attack",  label: "공격력", icon: Sword,  color: "text-orange-500" },
  { name: "defense", label: "방어력", icon: Shield, color: "text-blue-500" },
  { name: "gold",    label: "골드",  icon: Coins,  color: "text-yellow-500" },
] as const;

interface Props {
  onCreated: () => void;
}

export default function CharacterCreate({ onCreated }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`${API_URL}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          hp: Number(form.hp),
          attack: Number(form.attack),
          defense: Number(form.defense),
          gold: Number(form.gold),
        }),
      });
      setForm(EMPTY_FORM);
      onCreated();
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  return (
    <section className="max-w-lg space-y-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
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
            <div key={name} className="space-y-1.5">
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

        <Button type="submit" disabled={loading}>
          <UserPlus size={15} />
          {loading ? "생성 중..." : "생성하기"}
        </Button>
      </form>
    </section>
  );
}
