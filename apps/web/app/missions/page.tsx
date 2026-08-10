"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Gift, PlusSquare, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useRequireMember } from "@/lib/auth";
import { fetchMissions } from "@/lib/api";
import type { Mission } from "@/lib/api";
import MissionManageTab from "./components/MissionManageTab";
import MissionStatusTab from "./components/MissionStatusTab";

type PageTab = "manage" | "status";

const PAGE_TABS: { id: PageTab; label: string; icon: React.ElementType }[] = [
  { id: "status", label: "현황", icon: ClipboardList },
  { id: "manage", label: "임무 관리", icon: PlusSquare },
];

const MISSION_TYPE_VARIANT: Record<string, "default" | "warning"> = {
  일일: "default",
  중요: "warning",
};

function RunnerMissionList() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMissions()
      .then((list) => { if (!cancelled) setMissions(list); })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "임무 조회 실패");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const chapters = [...new Set(missions.map((m) => m.chapter))];

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <ScrollText size={24} className="text-indigo-600" />
          임무
        </h1>
        <p className="text-sm text-slate-500">현재 공개된 임무 목록입니다.</p>
      </section>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
          임무 목록을 불러오는 중입니다.
        </div>
      ) : missions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
          공개된 임무가 없습니다.
        </div>
      ) : (
        chapters.map((chapter) => (
          <Card key={chapter}>
            <CardHeader>
              <CardTitle>{chapter}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {missions
                .filter((m) => m.chapter === chapter)
                .map((mission) => (
                  <div key={mission.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <p className="font-semibold text-slate-900">{mission.name}</p>
                        <p className="text-sm text-slate-500">{mission.description}</p>
                      </div>
                      <Badge variant={MISSION_TYPE_VARIANT[mission.mission_type] ?? "default"}>
                        {mission.mission_type}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                      <Gift size={14} />
                      {mission.reward}
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        ))
      )}
    </main>
  );
}

function AdminMissionsPage() {
  const [tab, setTab] = useState<PageTab>("manage");

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <p className="text-sm font-semibold tracking-[0.18em] text-indigo-600 uppercase">
          Mission Board
        </p>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ScrollText size={28} className="text-indigo-600" />
            임무
          </h1>
          <p className="text-sm text-slate-500">
            일일·중요 임무를 등록하고 챕터별 달성 현황과 보상 지급을 관리할 수 있습니다.
          </p>
        </div>
      </section>

      <div className="flex items-center gap-1 border-b border-slate-200">
        {PAGE_TABS.map(({ id, label, icon: Icon }) => (
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

      {tab === "manage" ? <MissionManageTab /> : <MissionStatusTab />}
    </main>
  );
}

export default function MissionsPage() {
  const member = useRequireMember();

  if (!member) return null;

  return member.role === "ADMIN" ? <AdminMissionsPage /> : <RunnerMissionList />;
}
