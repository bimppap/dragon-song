"use client";

import { CalendarCheck } from "lucide-react";
import PageContainer from "@/components/common/PageContainer";
import { useRequireMember } from "@/lib/auth";
import AttendanceBook from "./components/AttendanceBook";

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
          하루에 한 번 출석하고 오늘의 한마디를 남겨 보세요. 출석하면 골드 1G와 CP 1이 지급됩니다.
        </p>
      </section>

      <AttendanceBook member={member} />
    </PageContainer>
  );
}
