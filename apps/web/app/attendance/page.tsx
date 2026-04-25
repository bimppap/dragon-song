"use client";

import { useState } from "react";
import { CalendarCheck2, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import AttendancePanel from "./components/AttendancePanel";

type Tab = "attendance" | "missions";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "attendance", label: "출석", icon: CalendarCheck2 },
  { id: "missions", label: "임무", icon: ScrollText },
];

const MISSION_CARDS = [
  {
    title: "일일 전투 참여",
    description: "오늘 전투 콘텐츠를 1회 완료하면 보상을 획득합니다.",
    reward: "전투 토큰 1개",
    status: "진행 중",
  },
  {
    title: "아이템 구매",
    description: "상점에서 아이템을 3회 구매하면 보상을 획득합니다.",
    reward: "골드 1,000G",
    status: "대기 중",
  },
  {
    title: "캐릭터 성장",
    description: "캐릭터를 생성하거나 기존 캐릭터 정보를 갱신하는 임무입니다.",
    reward: "성장 재료 상자",
    status: "완료 예정",
  },
];

export default function AttendancePage() {
  const [tab, setTab] = useState<Tab>("attendance");

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <section className="flex flex-col gap-3">
        <p className="text-sm font-semibold tracking-[0.18em] text-amber-600 uppercase">
          Attendance Book
        </p>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            출석부
          </h1>
          <p className="text-sm text-slate-500">
            날짜별 출석 체크와 임무 마크업을 한 화면에서 관리할 수 있습니다.
          </p>
        </div>
      </section>

      <div className="flex items-center gap-1 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant="ghost"
            onClick={() => setTab(id)}
            className={cn(
              "gap-2 rounded-none border-b-2 -mb-px h-11 px-5 font-semibold",
              tab === id
                ? "border-indigo-600 bg-transparent text-indigo-600 hover:bg-transparent hover:text-indigo-600"
                : "border-transparent bg-transparent text-slate-500 hover:bg-transparent hover:text-slate-800",
            )}
          >
            <Icon size={15} />
            {label}
          </Button>
        ))}
      </div>

      {tab === "attendance" ? (
        <AttendancePanel />
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {MISSION_CARDS.map(({ title, description, reward, status }) => (
            <Card key={title} className="h-full">
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                    Reward
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{reward}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">진행 상태</span>
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                    {status}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </main>
  );
}
