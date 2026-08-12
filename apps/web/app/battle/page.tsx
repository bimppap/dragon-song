"use client";

import { useState } from "react";
import { Swords, Sparkles } from "lucide-react";
import PageContainer from "@/components/common/PageContainer";
import TabBar from "@/components/common/TabBar";
import { useRequireMember } from "@/lib/auth";
import type { Member, MemberRole } from "@/lib/api";
import BattleTab from "./components/BattleTab";
import SkillTab from "./components/SkillTab";

type Tab = "battle" | "skill";

const TABS: { id: Tab; label: string; icon: React.ElementType; role: MemberRole }[] = [
  { id: "battle", label: "전투", icon: Swords, role: "ADMIN" },
  { id: "skill", label: "기술", icon: Sparkles, role: "RUNNER" },
];

function BattleConsole({ member }: { member: Member }) {
  const visibleTabs = TABS.filter((tab) => tab.role === member.role);
  const [tab, setTab] = useState<Tab>(visibleTabs[0]?.id ?? "battle");

  return (
    <PageContainer className="space-y-8">
      <TabBar tabs={visibleTabs} active={tab} onChange={setTab} />

      <div>
        {tab === "battle" && <BattleTab />}
        {tab === "skill" && <SkillTab member={member} />}
      </div>
    </PageContainer>
  );
}

export default function BattlePage() {
  const member = useRequireMember();

  if (!member) return null;

  return <BattleConsole member={member} />;
}
