"use client";

import { Sparkles } from "lucide-react";
import PageContainer from "@/components/common/PageContainer";
import { useRequireMember } from "@/lib/auth";
import SkillTab from "@/app/battle/components/SkillTab";

export default function SkillPage() {
  const member = useRequireMember();

  if (!member) return null;

  return (
    <PageContainer className="space-y-8">
      <section className="flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
          Skill
        </p>
        <div className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ivory sm:text-3xl">
            <Sparkles size={28} className="text-ivory/85" />
            기술
          </h1>
          <p className="text-sm text-muted">
            습득한 기술을 확인하고 AP로 다음 단계를 강화할 수 있습니다.
          </p>
        </div>
      </section>

      <SkillTab member={member} />
    </PageContainer>
  );
}
