"use client";

import { CalendarCheck } from "lucide-react";
import PageContainer from "@/components/common/PageContainer";
import { useRequireMember } from "@/lib/auth";
import AttendanceView from "./components/AttendanceView";

export default function AttendancePage() {
  const member = useRequireMember();

  if (!member) return null;

  return (
    <PageContainer max="4xl" className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ivory">
          <CalendarCheck size={24} className="text-gold" />
          출석부
        </h1>
        <p className="text-sm text-muted">
          날짜를 선택해 그날 출석한 캐릭터를 확인할 수 있습니다. 출석 등록은 관리자만 할 수 있습니다.
        </p>
      </section>

      <AttendanceView />
    </PageContainer>
  );
}
