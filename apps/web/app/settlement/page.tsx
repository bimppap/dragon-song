"use client";

import { useState } from "react";
import { Coins, Settings, Wallet } from "lucide-react";
import PageContainer from "@/components/common/PageContainer";
import TabBar from "@/components/common/TabBar";
import { useRequireMember } from "@/lib/auth";
import AdminSettlement from "./components/AdminSettlement";
import RunnerSettlement from "./components/RunnerSettlement";

type StaffTab = "mine" | "manage";

const STAFF_TABS: { id: StaffTab; label: string; icon: React.ElementType }[] = [
  { id: "mine", label: "나의 정산", icon: Wallet },
  { id: "manage", label: "관리", icon: Settings },
];

export default function SettlementPage() {
  const member = useRequireMember();
  const [staffTab, setStaffTab] = useState<StaffTab>("mine");

  if (!member) return null;

  const isAdmin = member.role === "ADMIN";
  const isStaff = member.role === "STAFF";

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
            : isStaff
              ? "나의 정산 요청을 보내거나, 러너들의 정산 요청을 확인하고 골드·CP를 지급합니다."
              : "게시글 & 댓글, 교류 로그 활동을 어드민에게 정산 요청할 수 있습니다."}
        </p>
      </section>

      {isStaff ? (
        <div className="flex flex-col gap-6">
          <TabBar tabs={STAFF_TABS} active={staffTab} onChange={setStaffTab} />
          {staffTab === "mine" ? <RunnerSettlement /> : <AdminSettlement />}
        </div>
      ) : isAdmin ? (
        <AdminSettlement />
      ) : (
        <RunnerSettlement />
      )}
    </PageContainer>
  );
}
