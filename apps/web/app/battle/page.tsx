"use client";

import { useState } from "react";
import { Swords, Sparkles, Skull } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRequireAdmin } from "@/lib/auth";
import BattleTab from "./components/BattleTab";
import SkillTab from "./components/SkillTab";
import EnemyTab from "./components/EnemyTab";

type Tab = "battle" | "skill" | "enemy";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "battle", label: "전투", icon: Swords },
  { id: "skill", label: "기술", icon: Sparkles },
  { id: "enemy", label: "에너미", icon: Skull },
];

export default function BattlePage() {
  const member = useRequireAdmin();
  const [tab, setTab] = useState<Tab>("battle");

  if (!member) return null;

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
        {tab === "skill" && <SkillTab />}
        {tab === "enemy" && <EnemyTab />}
      </div>
    </main>
  );
}
