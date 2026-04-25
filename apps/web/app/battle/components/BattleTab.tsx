import { Swords, Shield, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const MOCK_ENEMIES = [
  { id: 1, name: "고블린", level: 5, hp: 120, attack: 18, defense: 8, reward: 50 },
  { id: 2, name: "오크 전사", level: 12, hp: 350, attack: 42, defense: 20, reward: 150 },
  { id: 3, name: "다크 엘프", level: 20, hp: 580, attack: 75, defense: 35, reward: 300 },
  { id: 4, name: "드래곤", level: 50, hp: 5000, attack: 200, defense: 120, reward: 2000 },
];

const DIFFICULTY: Record<number, { label: string; variant: "success" | "warning" | "destructive" | "default" }> = {
  5:  { label: "쉬움", variant: "success" },
  12: { label: "보통", variant: "default" },
  20: { label: "어려움", variant: "warning" },
  50: { label: "매우 어려움", variant: "destructive" },
};

export default function BattleTab() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-800">전투 목록</h2>
        <p className="text-sm text-slate-500">적을 선택해 전투를 시작하세요.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {MOCK_ENEMIES.map((enemy) => {
          const diff = DIFFICULTY[enemy.level];
          return (
            <div
              key={enemy.id}
              className="border border-slate-200 rounded-xl p-5 bg-white space-y-4 hover:border-indigo-300 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-800">{enemy.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Lv. {enemy.level}</p>
                </div>
                <Badge variant={diff.variant}>{diff.label}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 rounded-lg py-2">
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">HP</p>
                  <p className="text-sm font-bold text-slate-700">{enemy.hp.toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 rounded-lg py-2">
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide flex items-center justify-center gap-1"><Zap size={10} />공격</p>
                  <p className="text-sm font-bold text-red-500">{enemy.attack}</p>
                </div>
                <div className="bg-slate-50 rounded-lg py-2">
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide flex items-center justify-center gap-1"><Shield size={10} />방어</p>
                  <p className="text-sm font-bold text-indigo-500">{enemy.defense}</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-yellow-600 font-semibold">보상 {enemy.reward.toLocaleString()} G</span>
                <button className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition">
                  <Swords size={13} />
                  전투 시작
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
