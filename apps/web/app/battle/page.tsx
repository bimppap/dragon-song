"use client";

import { Swords } from "lucide-react";
import PageContainer from "@/components/common/PageContainer";
import { isAdminRole, useRequireMember } from "@/lib/auth";
import BattleTab from "./components/BattleTab";
import RunnerBattleOverview from "./components/RunnerBattleOverview";

export default function BattlePage() {
  const member = useRequireMember();

  if (!member) return null;

  return (
    <PageContainer className="space-y-8">
      <section className="flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
          Battle
        </p>
        <div className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ivory sm:text-3xl">
            <Swords size={28} className="text-ivory/85" />
            전투
          </h1>
          <p className="text-sm text-muted">
            {isAdminRole(member.role)
              ? "실전 전투를 준비하거나 진행 중인 전투를 이어갈 수 있습니다."
              : "현재 챕터의 전투 일정과 출현 에너미를 확인할 수 있습니다."}
          </p>
        </div>
      </section>

      {isAdminRole(member.role) ? <BattleTab /> : <RunnerBattleOverview />}
    </PageContainer>
  );
}
