"use client";

import { useState } from "react";
import { Settings, BookMarked } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRequireAdmin } from "@/lib/auth";
import ChapterTab from "./components/ChapterTab";

type PageTab = "chapter";

const PAGE_TABS: { id: PageTab; label: string; icon: React.ElementType }[] = [
  { id: "chapter", label: "챕터", icon: BookMarked },
];

export default function AdminPage() {
  const member = useRequireAdmin();
  const [tab, setTab] = useState<PageTab>("chapter");

  if (!member) return null;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <p className="text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">
          Admin
        </p>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Settings size={28} className="text-slate-600" />
            관리
          </h1>
          <p className="text-sm text-slate-500">
            게임 운영에 필요한 설정을 관리할 수 있습니다.
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

      {tab === "chapter" && <ChapterTab />}
    </main>
  );
}
