"use client";

import { Coins } from "lucide-react";
import PageContainer from "@/components/common/PageContainer";
import { useRequireMember } from "@/lib/auth";
import AdminSettlement from "./components/AdminSettlement";
import RunnerSettlement from "./components/RunnerSettlement";

export default function SettlementPage() {
  const member = useRequireMember();

  if (!member) return null;

  const isAdmin = member.role === "ADMIN";

  return (
    <PageContainer max="4xl" className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ivory">
          <Coins size={24} className="text-gold" />
          정산
        </h1>
        <p className="text-sm text-muted">
          {isAdmin
            ? "러너들의 정산 요청을 확인하고 골드·CP를 지급합니다."
            : "게시글 & 댓글, 로그잇기 활동을 어드민에게 정산 요청할 수 있습니다."}
        </p>
      </section>

      {isAdmin ? <AdminSettlement /> : <RunnerSettlement />}
    </PageContainer>
  );
}
