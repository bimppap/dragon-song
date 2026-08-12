"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Swords, Sparkles, Skull } from "lucide-react";
import PageContainer from "@/components/common/PageContainer";
import TabBar from "@/components/common/TabBar";
import { useRequireMember } from "@/lib/auth";
import type { Member } from "@/lib/api";
import BattleTab from "./components/BattleTab";
import SkillTab from "./components/SkillTab";
import EnemyTab from "./components/EnemyTab";

type Tab = "battle" | "skill" | "enemy";

const TABS: { id: Tab; label: string; icon: React.ElementType; adminOnly: boolean }[] = [
  { id: "battle", label: "전투", icon: Swords, adminOnly: true },
  { id: "skill", label: "기술", icon: Sparkles, adminOnly: false },
  { id: "enemy", label: "에너미", icon: Skull, adminOnly: true },
];

function BattleConsole({ member }: { member: Member }) {
  const isAdmin = member.role === "ADMIN";
  const visibleTabs = TABS.filter((tab) => isAdmin || !tab.adminOnly);

  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") as Tab | null;
  const initialTab =
    requestedTab && visibleTabs.some((tab) => tab.id === requestedTab)
      ? requestedTab
      : visibleTabs[0].id;
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <PageContainer className="space-y-8">
      <TabBar tabs={visibleTabs} active={tab} onChange={setTab} />

      <div>
        {tab === "battle" && <BattleTab />}
        {tab === "skill" && <SkillTab member={member} />}
        {tab === "enemy" && <EnemyTab />}
      </div>
    </PageContainer>
  );
}

export default function BattlePage() {
  const member = useRequireMember();

  if (!member) return null;

  return (
    <Suspense>
      <BattleConsole member={member} />
    </Suspense>
  );
}
