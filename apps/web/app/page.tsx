"use client";

import { useEffect, useState, useCallback } from "react";
import { UserPlus, Sword, Shield, Heart, Coins } from "lucide-react";
import { fetchCharacters } from "@/lib/api";
import type { Character } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const EMPTY_FORM = { name: "", hp: "", attack: "", defense: "", gold: "1000" };

const STAT_CONFIG = [
  { name: "hp",      label: "HP",   icon: Heart,  color: "text-rose-500" },
  { name: "attack",  label: "공격력", icon: Sword,  color: "text-orange-500" },
  { name: "defense", label: "방어력", icon: Shield, color: "text-blue-500" },
  { name: "gold",    label: "골드",  icon: Coins,  color: "text-yellow-500" },
] as const;

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition";

export default function CharacterPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setCharacters(await fetchCharacters());
  }, []);

  useEffect(() => { load(); }, [load]);

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
      await load();
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">

      {/* 캐릭터 생성 */}
      <section className="space-y-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
          <UserPlus size={18} className="text-indigo-500" />
          캐릭터 생성
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">이름</label>
            <input
              name="name"
              placeholder="캐릭터 이름"
              value={form.name}
              onChange={handleChange}
              required
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STAT_CONFIG.map(({ name, label, icon: Icon, color }) => (
              <div key={name} className="space-y-1">
                <label className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <Icon size={11} className={color} />
                  {label}
                </label>
                <input
                  name={name}
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form[name]}
                  onChange={handleChange}
                  required
                  className={inputCls}
                />
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <UserPlus size={15} />
            {loading ? "생성 중..." : "생성하기"}
          </button>
        </form>
      </section>

      <hr className="border-slate-200" />

      {/* 캐릭터 목록 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">캐릭터 목록</h2>
          <span className="text-xs text-slate-400 font-medium">{characters.length}명</span>
        </div>

        {characters.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">아직 생성된 캐릭터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wide w-12">ID</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">이름</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-rose-400 uppercase tracking-wide">HP</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-orange-400 uppercase tracking-wide">공격력</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-blue-400 uppercase tracking-wide">방어력</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-yellow-500 uppercase tracking-wide">골드</th>
                </tr>
              </thead>
              <tbody>
                {characters.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-3 text-slate-400 font-mono text-xs">{c.id}</td>
                    <td className="py-3.5 px-3 font-medium text-slate-800">{c.name}</td>
                    <td className="py-3.5 px-3 text-right text-rose-600 font-semibold">{c.hp.toLocaleString()}</td>
                    <td className="py-3.5 px-3 text-right text-orange-600 font-semibold">{c.attack.toLocaleString()}</td>
                    <td className="py-3.5 px-3 text-right text-blue-600 font-semibold">{c.defense.toLocaleString()}</td>
                    <td className="py-3.5 px-3 text-right text-yellow-600 font-semibold">{c.gold.toLocaleString()} G</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
