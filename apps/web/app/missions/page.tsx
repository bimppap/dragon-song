"use client";

import { useState } from "react";
import { ClipboardList, PlusSquare, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import MissionManageTab from "./components/MissionManageTab";
import MissionStatusTab from "./components/MissionStatusTab";

type PageTab = "manage" | "status";

const PAGE_TABS: { id: PageTab; label: string; icon: React.ElementType }[] = [
  { id: "status", label: "현황", icon: ClipboardList },
  { id: "manage", label: "임무 관리", icon: PlusSquare },
];

export default function MissionsPage() {
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
