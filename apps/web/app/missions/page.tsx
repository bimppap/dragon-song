"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ClipboardList, Image as ImageIcon, PlusSquare, ScrollText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRequireMember } from "@/lib/auth";
import { fetchChapters, fetchItems, fetchMissions, fetchMyCharacter } from "@/lib/api";
import type { Chapter, Item, Mission } from "@/lib/api";
import MissionManageTab from "./components/MissionManageTab";
import MissionStatusTab from "./components/MissionStatusTab";
import EmptyState from "@/components/common/EmptyState";
import RewardSummary from "@/components/common/RewardSummary";
import { useToast } from "@/components/common/ToastProvider";
import PageContainer from "@/components/common/PageContainer";
import TabBar from "@/components/common/TabBar";
import { cn } from "@/lib/utils";
import { orderChapterNamesLatestFirst } from "@/lib/chapterOrder";

type PageTab = "manage" | "status";

const PAGE_TABS: { id: PageTab; label: string; icon: React.ElementType }[] = [
  { id: "status", label: "현황", icon: ClipboardList },
  { id: "manage", label: "임무 관리", icon: PlusSquare },
];

function RunnerMissionList() {
  const member = useRequireMember();
  const { toast } = useToast();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [chapterList, setChapterList] = useState<Chapter[]>([]);
  const [achievedMissionIds, setAchievedMissionIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchMissions(),
      fetchItems(),
      fetchChapters(),
      member?.character_id != null ? fetchMyCharacter() : Promise.resolve(null),
    ])
      .then(([list, itemList, chapters, myCharacter]) => {
        if (cancelled) return;
        setMissions(list);
        setItems(itemList);
        setChapterList(chapters);
        setAchievedMissionIds(new Set(myCharacter?.achieved_missions.map((m) => m.mission_id) ?? []));
      })
      .catch((error) => {
        if (cancelled) return;
        toast(error instanceof Error ? error.message : "임무 조회 실패", "error");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [toast, member?.character_id]);

  const chapters = useMemo(
    () => orderChapterNamesLatestFirst(missions.map((mission) => mission.chapter), chapterList),
    [missions, chapterList],
  );

  return (
    <PageContainer max="4xl" className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ivory">
          <ScrollText size={24} className="text-gold" />
          임무
        </h1>
        <p className="text-sm text-muted">현재 공개된 임무 목록입니다.</p>
      </section>

      {loading ? (
        <EmptyState>
          임무 목록을 불러오는 중입니다.
        </EmptyState>
      ) : missions.length === 0 ? (
        <EmptyState>
          공개된 임무가 없습니다.
        </EmptyState>
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
                  <div key={mission.id} className="relative rounded-2xl border border-line px-4 py-4">
                    <div className="flex min-w-0 items-start gap-3 pr-36">
                      <div
                        className={cn(
                          "relative flex size-10 shrink-0 items-center justify-center overflow-hidden",
                          !mission.image_url && "border border-line bg-inset",
                        )}
                      >
                        {mission.image_url ? (
                          <Image src={mission.image_url} alt={mission.name} fill sizes="40px" unoptimized className="object-cover" />
                        ) : (
                          <ImageIcon size={16} className="text-muted" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="font-semibold text-ivory">{mission.name}</p>
                        <p className="text-sm text-muted">{mission.description}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <RewardSummary entries={mission.reward_items} items={items} />
                    </div>
                    {achievedMissionIds.has(mission.id) && (
                      <Image
                        src="/mission/mission_complete.png"
                        alt="달성 완료"
                        width={128}
                        height={128}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 [image-rendering:pixelated]"
                      />
                    )}
                  </div>
                ))}
            </CardContent>
          </Card>
        ))
      )}
    </PageContainer>
  );
}

/** /admin 페이지에 임베드되는 임무 관리 콘솔(페이지 컨테이너 없음). */
export function MissionAdmin() {
  const [tab, setTab] = useState<PageTab>("status");

  return (
    <div className="flex flex-col gap-6">
      <TabBar tabs={PAGE_TABS} active={tab} onChange={setTab} />
      {tab === "manage" ? <MissionManageTab /> : <MissionStatusTab />}
    </div>
  );
}

export default function MissionsPage() {
  const member = useRequireMember();

  if (!member) return null;

  return <RunnerMissionList />;
}
