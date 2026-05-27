"use client";

import { useState } from "react";
import { Swords, Sparkles, BarChart3, Users, Trophy, Skull } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import BattleTab from "./components/BattleTab";
import SkillTab from "./components/SkillTab";
import StatTab from "./components/StatTab";
import RoleTab from "./components/RoleTab";
import GradeTab from "./components/GradeTab";
import EnemyTab from "./components/EnemyTab";

type Tab = "battle" | "skill" | "stat" | "role" | "grade" | "enemy";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "battle", label: "전투", icon: Swords },
  { id: "skill",  label: "스킬", icon: Sparkles },
  { id: "stat",   label: "스탯", icon: BarChart3 },
  { id: "role",   label: "역할", icon: Users },
  { id: "grade",  label: "등급", icon: Trophy },
  { id: "enemy",  label: "에너미", icon: Skull },
];

export default function BattlePage() {
  const [tab, setTab] = useState<Tab>("battle");

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div className="flex items-center gap-1 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant="ghost"
            onClick={() => setTab(id)}
            className={cn(
              "gap-2 rounded-none border-b-2 -mb-px h-11 px-5 font-semibold",
              tab === id
                ? "border-indigo-600 text-indigo-600 bg-transparent hover:bg-transparent hover:text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-transparent",
            )}
          >
            <Icon size={15} />
            {label}
          </Button>
        ))}
      </div>

      <div>
        {tab === "battle" && <BattleTab />}
        {tab === "skill"  && <SkillTab />}
        {tab === "stat"   && <StatTab />}
        {tab === "role"   && <RoleTab />}
        {tab === "grade"  && <GradeTab />}
        {tab === "enemy"  && <EnemyTab />}
      </div>
    </main>
  );
}
