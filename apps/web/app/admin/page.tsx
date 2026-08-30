"use client";

import { useState } from "react";
import {
  BookMarked,
  Gift,
  ScrollText,
  Settings,
  Skull,
  Sparkles,
  Trophy,
  UserStar,
} from "lucide-react";
import PageContainer from "@/components/common/PageContainer";
import TabBar from "@/components/common/TabBar";
import { useRequireAdmin } from "@/lib/auth";
import ChapterTab from "./components/ChapterTab";
import PermissionTab from "./components/PermissionTab";
import RewardAdminTab from "./components/RewardAdminTab";
import EnemyTab from "@/app/battle/components/EnemyTab";
import AdminSkillEditor from "@/app/battle/components/AdminSkillEditor";
import { ChallengeAdmin } from "@/app/challenges/page";
import { MissionAdmin } from "@/app/missions/page";

type PageTab = "chapter" | "reward" | "challenge" | "mission" | "enemy" | "skill" | "permission";

const PAGE_TABS: { id: PageTab; label: string; icon: React.ElementType }[] = [
  { id: "mission", label: "임무", icon: ScrollText },
  { id: "challenge", label: "도전과제", icon: Trophy },
  { id: "enemy", label: "에너미", icon: Skull },
  { id: "reward", label: "보상", icon: Gift },
  { id: "skill", label: "기술트리", icon: Sparkles },
  { id: "chapter", label: "챕터", icon: BookMarked },
  { id: "permission", label: "권한", icon: UserStar },
];

export default function AdminPage() {
  const member = useRequireAdmin();
  const [tab, setTab] = useState<PageTab>("mission");

  if (!member) return null;

  // 권한 탭은 최고 관리자(ADMIN)만 접근할 수 있다. 스텝(STAFF)에게는 노출하지 않는다.
  const visibleTabs = member.role === "ADMIN" ? PAGE_TABS : PAGE_TABS.filter((t) => t.id !== "permission");

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

      <TabBar tabs={visibleTabs} active={tab} onChange={setTab} />

      <div>
        {tab === "chapter" && <ChapterTab />}
        {tab === "reward" && <RewardAdminTab />}
        {tab === "challenge" && <ChallengeAdmin />}
        {tab === "mission" && <MissionAdmin />}
        {tab === "enemy" && <EnemyTab />}
        {tab === "skill" && <AdminSkillEditor />}
        {tab === "permission" && member.role === "ADMIN" && <PermissionTab />}
      </div>
    </PageContainer>
  );
}
