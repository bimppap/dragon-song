"use client";

import AttendancePanel from "./components/AttendancePanel";

export default function AttendancePage() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <section className="flex flex-col gap-3">
        <p className="text-sm font-semibold tracking-[0.18em] text-amber-600 uppercase">
          Attendance Book
        </p>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">출석부</h1>
          <p className="text-sm text-slate-500">날짜별 출석 체크와 보상 지급을 관리할 수 있습니다.</p>
        </div>
      </section>
      <AttendancePanel />
    </main>
  );
}
