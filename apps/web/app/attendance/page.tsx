"use client";

import { CalendarCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageContainer from "@/components/common/PageContainer";
import { isAdminRole, useRequireMember } from "@/lib/auth";
import { useRouter } from "next/navigation";
import AttendanceView from "./components/AttendanceView";

export default function AttendancePage() {
  const member = useRequireMember();
  const router = useRouter();

  if (!member) return null;

  return (
    <PageContainer max="4xl" className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ivory">
            <CalendarCheck size={24} className="text-gold" />
            출석부
          </h1>
          <p className="text-sm text-muted">
            날짜를 선택해 그날 출석한 캐릭터를 확인할 수 있습니다.
          </p>
        </div>
        {isAdminRole(member.role) && (
          <Button onClick={() => router.push("/attendance/register")} className="gap-2">
            <UserPlus size={15} />
            출석 등록
          </Button>
        )}
      </section>

      <AttendanceView />
    </PageContainer>
  );
}
