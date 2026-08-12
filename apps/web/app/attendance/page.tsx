"use client";

import { useRequireAdmin } from "@/lib/auth";
import PageContainer from "@/components/common/PageContainer";
import AttendancePanel from "./components/AttendancePanel";

export default function AttendancePage() {
  const member = useRequireAdmin();
  if (!member) return null;

  return (
    <PageContainer max="5xl" className="space-y-8">
      <section className="flex flex-col gap-3">
        <p className="text-sm font-semibold tracking-[0.18em] text-amber-600 uppercase">
          Attendance Book
        </p>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">출석부</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">날짜별 출석 체크와 보상 지급을 관리할 수 있습니다.</p>
        </div>
      </section>
      <AttendancePanel />
    </PageContainer>
  );
}
