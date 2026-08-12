"use client";

import { useState } from "react";
import {
  BookMarked,
  CalendarCheck,
  ScrollText,
  Settings,
  Skull,
  Sparkles,
  Store,
  Trophy,
} from "lucide-react";
import PageContainer from "@/components/common/PageContainer";
import TabBar from "@/components/common/TabBar";
import { useRequireAdmin } from "@/lib/auth";
import ChapterTab from "./components/ChapterTab";
import ItemAdmin from "./components/ItemAdmin";
import AttendancePanel from "@/app/attendance/components/AttendancePanel";
import EnemyTab from "@/app/battle/components/EnemyTab";
import AdminSkillEditor from "@/app/battle/components/AdminSkillEditor";
import { ChallengeAdmin } from "@/app/challenges/page";
import { MissionAdmin } from "@/app/missions/page";

type PageTab = "chapter" | "attendance" | "item" | "challenge" | "mission" | "enemy" | "skill";

const PAGE_TABS: { id: PageTab; label: string; icon: React.ElementType }[] = [
  { id: "chapter", label: "챕터", icon: BookMarked },
  { id: "attendance", label: "출석부", icon: CalendarCheck },
  { id: "item", label: "아이템", icon: Store },
  { id: "challenge", label: "도전과제", icon: Trophy },
  { id: "mission", label: "임무", icon: ScrollText },
  { id: "enemy", label: "에너미", icon: Skull },
  { id: "skill", label: "기술트리", icon: Sparkles },
];

export default function AdminPage() {
  const member = useRequireAdmin();
  const [tab, setTab] = useState<PageTab>("chapter");

  if (!member) return null;

  return (
    <PageContainer className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
          Admin
        </p>
        <div className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ivory sm:text-3xl">
            <Settings size={28} className="text-ivory/85" />
            관리
          </h1>
          <p className="text-sm text-muted">
            게임 운영에 필요한 관리 기능을 탭별로 확인·편집할 수 있습니다.
          </p>
        </div>
      </section>

      <TabBar tabs={PAGE_TABS} active={tab} onChange={setTab} />

      <div>
        {tab === "chapter" && <ChapterTab />}
        {tab === "attendance" && <AttendancePanel />}
        {tab === "item" && <ItemAdmin />}
        {tab === "challenge" && <ChallengeAdmin />}
        {tab === "mission" && <MissionAdmin />}
        {tab === "enemy" && <EnemyTab />}
        {tab === "skill" && <AdminSkillEditor />}
      </div>
    </PageContainer>
  );
}
