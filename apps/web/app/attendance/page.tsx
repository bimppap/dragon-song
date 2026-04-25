"use client";

import { useState } from "react";
import { CalendarCheck2, ScrollText, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tab = "attendance" | "missions";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "attendance", label: "출석", icon: CalendarCheck2 },
  { id: "missions", label: "임무", icon: ScrollText },
];

const ATTENDANCE_DAYS = [
  { day: "1일차", reward: "골드 500G", done: true },
  { day: "2일차", reward: "회복 물약", done: true },
  { day: "3일차", reward: "강화석 3개", done: false },
  { day: "4일차", reward: "소환권", done: false },
  { day: "5일차", reward: "희귀 장비 상자", done: false },
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
    <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <section className="flex flex-col gap-3">
        <p className="text-sm font-semibold tracking-[0.18em] text-amber-600 uppercase">
          Attendance Book
        </p>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            출석부
          </h1>
          <p className="text-sm text-slate-500">
            출석 현황과 임무 보상을 한 화면에서 확인할 수 있도록 탭 구조만 먼저 구성했습니다.
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
                ? "border-indigo-600 text-indigo-600 bg-transparent hover:bg-transparent hover:text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-transparent",
            )}
          >
            <Icon size={15} />
            {label}
          </Button>
        ))}
      </div>

      {tab === "attendance" ? (
        <section className="grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>출석 진행 현황</CardTitle>
              <CardDescription>
                일차별 보상이 어떤 순서로 지급되는지 보여주는 자리입니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {ATTENDANCE_DAYS.map(({ day, reward, done }) => (
                <div
                  key={day}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-4 py-3",
                    done
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200 bg-slate-50",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-full",
                        done
                          ? "bg-emerald-500 text-white"
                          : "bg-white text-slate-400 border border-slate-200",
                      )}
                    >
                      <CheckCircle2 size={16} />
                    </span>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-800">{day}</p>
                      <p className="text-sm text-slate-500">{reward}</p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      done
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-600",
                    )}
                  >
                    {done ? "수령 완료" : "대기"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-linear-to-br from-amber-50 via-white to-indigo-50">
            <CardHeader>
              <CardTitle>출석 보너스</CardTitle>
              <CardDescription>
                누적 출석에 따라 추가 보상이 노출될 영역입니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-amber-100">
                <div className="flex items-center gap-2 text-amber-600">
                  <Sparkles size={16} />
                  <span className="text-sm font-semibold">주간 누적 보상</span>
                </div>
                <p className="mt-3 text-2xl font-bold text-slate-900">3 / 7일</p>
                <p className="mt-2 text-sm text-slate-500">
                  7일 출석을 완료하면 특별 코스튬 조각을 지급하는 구조로 확장할 수 있습니다.
                </p>
              </div>
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-5 text-sm text-slate-500">
                서버 연동 전까지는 마크업만 배치되어 있습니다.
              </div>
            </CardContent>
          </Card>
        </section>
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
