"use client";

import { CalendarCheck } from "lucide-react";
import PageContainer from "@/components/common/PageContainer";
import { useRequireAdmin } from "@/lib/auth";
import AttendanceAdminTab from "../components/AttendanceAdminTab";

export default function AttendanceRegisterPage() {
  const member = useRequireAdmin();

  if (!member) return null;

  return (
    <PageContainer max="4xl" className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ivory">
          <CalendarCheck size={24} className="text-gold" />
          출석 등록
        </h1>
        <p className="text-sm text-muted">
          캐릭터와 날짜를 선택해 출석을 기록하고, 출석 보상을 지급할 수 있습니다.
        </p>
      </section>

      <AttendanceAdminTab />
    </PageContainer>
  );
}
