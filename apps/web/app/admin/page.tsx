"use client";

import { useState } from "react";
import { Settings, BookMarked } from "lucide-react";
import PageContainer from "@/components/common/PageContainer";
import TabBar from "@/components/common/TabBar";
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
    <PageContainer max="4xl" className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <p className="text-sm font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400 uppercase">
          Admin
        </p>
        <div className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            <Settings size={28} className="text-slate-600 dark:text-slate-300" />
            관리
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            게임 운영에 필요한 설정을 관리할 수 있습니다.
          </p>
        </div>
      </section>

      <TabBar tabs={PAGE_TABS} active={tab} onChange={setTab} />

      {tab === "chapter" && <ChapterTab />}
    </PageContainer>
  );
}
