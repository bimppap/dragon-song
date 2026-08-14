"use client";

import { Coins } from "lucide-react";
import PageContainer from "@/components/common/PageContainer";
import EmptyState from "@/components/common/EmptyState";
import { useRequireMember } from "@/lib/auth";

export default function SettlementPage() {
  const member = useRequireMember();

  if (!member) return null;

  return (
    <PageContainer max="4xl" className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ivory">
          <Coins size={24} className="text-gold" />
          정산
        </h1>
        <p className="text-sm text-muted">활동 내역을 정산하는 공간입니다.</p>
      </section>

      <EmptyState>정산 기능을 준비 중입니다.</EmptyState>
    </PageContainer>
  );
}
