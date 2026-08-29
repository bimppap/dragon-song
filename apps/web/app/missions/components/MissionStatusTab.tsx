"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Check,
  Gift,
  Image as ImageIcon,
  Pencil,
  Target,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchItems,
  fetchMissionProgress,
  fetchMissions,
  payMissionRewards,
  saveMissionProgress,
} from "@/lib/api";
import type { Item, Mission, MissionProgress } from "@/lib/api";
import { cn } from "@/lib/utils";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import EmptyState from "@/components/common/EmptyState";
import RewardSummary from "@/components/common/RewardSummary";
import { useToast } from "@/components/common/ToastProvider";
import { useEditableProgressList } from "@/lib/useEditableProgressList";

type MissionType = "일일" | "중요";

const MISSION_TYPE_VARIANT: Record<MissionType, "default" | "warning"> = {
  일일: "default",
  중요: "warning",
};

function statusCardNameFontSize(name: string): number {
  return Math.min(14, 132 / Math.max(1, Array.from(name).length));
}

export default function MissionStatusTab() {
  const { toast } = useToast();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedChapter, setSelectedChapter] = useState("");
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(null);
  const [showAchievedOnly, setShowAchievedOnly] = useState(false);
  const [loadingMissions, setLoadingMissions] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [payingReward, setPayingReward] = useState(false);

  const chapters = [...new Set(missions.map((m) => m.chapter))];
  const chapterMissions = missions.filter((m) => m.chapter === selectedChapter);
  const selectedMission = chapterMissions.find((m) => m.id === selectedMissionId) ?? null;

  const progress = useEditableProgressList<MissionProgress>({
    onSave: (entries) =>
      saveMissionProgress(
        selectedMission!.id,
        entries.map((e) => ({ character_id: e.character_id, achieved: e.achieved, memo: e.memo })),
      ),
    successMessage: "임무 현황을 저장했습니다.",
    errorMessage: "임무 현황 저장에 실패했습니다.",
    toast,
  });
  const activeProgress = progress.entries;
  const visibleProgress = showAchievedOnly
    ? activeProgress.filter((e) => e.achieved)
    : activeProgress;
  const achievedCount = activeProgress.filter((e) => e.achieved).length;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoadingMissions(true);
        const [list, itemList] = await Promise.all([fetchMissions(), fetchItems()]);
        if (cancelled) return;
        setMissions(list);
        setItems(itemList);
        if (list.length > 0) {
          setSelectedChapter(list[0].chapter);
          setSelectedMissionId(list[0].id);
        }
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : "임무 데이터를 불러오지 못했습니다.", "error");
      } finally {
        if (!cancelled) setLoadingMissions(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [toast]);

  useEffect(() => {
    if (selectedMissionId == null) return;
    const missionId = selectedMissionId;
    let cancelled = false;
    async function loadProgress() {
      try {
        setLoadingProgress(true);
        progress.resetEditing();
        const entries = await fetchMissionProgress(missionId);
        if (cancelled) return;
        progress.setEntries(entries);
      } catch (e) {
        if (!cancelled) {
          progress.setEntries([]);
          toast(e instanceof Error ? e.message : "임무 현황을 불러오지 못했습니다.", "error");
        }
      } finally {
        if (!cancelled) setLoadingProgress(false);
      }
    }
    loadProgress();
    return () => { cancelled = true; };
    // progress 객체 전체는 매 렌더마다 새로 만들어져 의존성에 넣으면 매번 재실행되므로
    // 실제로 쓰는 안정적인 멤버(resetEditing/setEntries)만 넣는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMissionId, toast, progress.resetEditing, progress.setEntries]);

  function handleSelectChapter(value: string) {
    const next = missions.find((m) => m.chapter === value);
    setSelectedChapter(value);
    setSelectedMissionId(next?.id ?? null);
    setShowAchievedOnly(false);
  }

  function handleSelectMission(id: number) {
    setSelectedMissionId(id);
    setShowAchievedOnly(false);
  }

  async function handlePayReward() {
    if (!selectedMission) return;
    try {
      setPayingReward(true);
      const result = await payMissionRewards(selectedMission.id);
      const newlyPaidIds = new Set(result.rewards.map((reward) => reward.character_id));
      progress.markRewardPaid(newlyPaidIds);
      if (result.paid_count === 0) {
        toast("이미 모든 달성자에게 보상이 지급되었거나 달성자가 없습니다.", "info");
      } else {
        const m = selectedMission;
        const parts: string[] = [];
        if (m.reward_gold > 0) parts.push(`골드 ${m.reward_gold.toLocaleString()}G`);
        if (m.reward_experience > 0) parts.push(`경험치 ${m.reward_experience.toLocaleString()}`);
        if (m.reward_ap > 0) parts.push(`AP ${m.reward_ap}`);
        if (m.reward_hp > 0) parts.push(`HP +${m.reward_hp}`);
        if (m.reward_attack > 0) parts.push(`공격력 +${m.reward_attack}`);
        if (m.reward_defense > 0) parts.push(`방어력 +${m.reward_defense}`);
        if (m.reward_items?.length > 0) parts.push(`구성 보상 ${m.reward_items.length}종`);
        const desc = parts.length > 0 ? `(${parts.join(", ")})` : "";
        toast(`${result.paid_count}명에게 임무 보상${desc}이 지급되었습니다.`, "success");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "임무 보상 지급에 실패했습니다.", "error");
    } finally {
      setPayingReward(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      {loadingMissions ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          임무 데이터를 불러오는 중입니다.
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-1.5">
                <CardTitle>챕터별 현황</CardTitle>
                <CardDescription>
                  챕터를 선택한 뒤 임무를 클릭하면 캐릭터별 달성 상태를 볼 수 있습니다.
                </CardDescription>
              </div>
              {chapters.length > 0 ? (
                <div className="w-full md:w-56">
                  <Select value={selectedChapter} onValueChange={handleSelectChapter}>
                    <SelectTrigger>
                      <SelectValue placeholder="챕터 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {chapters.map((chapter) => (
                          <SelectItem key={chapter} value={chapter}>{chapter}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="rounded-lg border border-line bg-inset px-4 py-2 text-sm text-muted">
                  챕터 없음
                </div>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {chapterMissions.length > 0 ? (
                chapterMissions.map((mission) => (
                  <button
                    key={mission.id}
                    type="button"
                    onClick={() => handleSelectMission(mission.id)}
                    className={cn(
                      "rounded-2xl border px-4 py-4 text-left transition-colors",
                      selectedMission?.id === mission.id
                        ? "border-gold bg-gold/10"
                        : "border-line hover:border-line hover:bg-inset",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={cn(
                            "relative flex size-10 shrink-0 items-center justify-center overflow-hidden",
                            !mission.image_url && "border border-line bg-inset",
                          )}
                        >
                          {mission.image_url ? (
                            <Image src={mission.image_url} alt={mission.name} fill sizes="40px" className="object-cover" />
                          ) : (
                            <ImageIcon size={16} className="text-muted" />
                          )}
                        </div>
                        <div className="flex min-w-0 flex-col gap-1">
                          <p className="font-semibold text-ivory">{mission.name}</p>
                          <p className="text-sm text-muted">{mission.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant={MISSION_TYPE_VARIANT[mission.mission_type as MissionType] ?? "secondary"}>
                          {mission.mission_type}
                        </Badge>
                        <Badge variant={mission.is_public ? "outline" : "secondary"}>
                          {mission.is_public ? "공개" : "비공개"}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Gift size={14} className="shrink-0 text-muted" />
                      <RewardSummary entries={mission.reward_items} items={items} />
                    </div>
                  </button>
                ))
              ) : (
                <EmptyState className="rounded-2xl">
                  선택한 챕터에 등록된 임무가 없습니다.
                </EmptyState>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex flex-col gap-1.5">
                <CardTitle>{selectedMission?.name ?? "임무를 선택하세요"}</CardTitle>
                {progress.isEditing && (
                  <span className="text-xs font-semibold text-gold">편집 중 · 저장을 눌러야 반영됩니다</span>
                )}
              </div>
              <Button disabled={!selectedMission || payingReward} onClick={handlePayReward}>
                <Gift size={15} />
                {payingReward ? "지급 중..." : "보상 지급"}
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 rounded-2xl bg-inset px-4 py-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Target size={15} className="text-gold" />
                  완료 {achievedCount} / {activeProgress.length}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-sm text-ivory/85">
                    <Checkbox
                      checked={showAchievedOnly}
                      onCheckedChange={(checked) => setShowAchievedOnly(checked === true)}
                    />
                    달성 캐릭터만 보기
                  </label>
                  {progress.isEditing ? (
                    <>
                      <Button size="sm" variant="ghost" disabled={progress.saving} onClick={progress.cancelEdit}>
                        <X size={15} />
                        취소
                      </Button>
                      <Button size="sm" disabled={progress.saving} onClick={() => void progress.save()}>
                        <Check size={15} />
                        {progress.saving ? "저장 중..." : "저장"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!selectedMission || loadingProgress}
                      onClick={progress.startEdit}
                    >
                      <Pencil size={15} />
                      편집
                    </Button>
                  )}
                  {progress.saving ? <span className="text-xs text-muted">저장 중...</span> : null}
                </div>
              </div>

              {loadingProgress ? (
                <EmptyState className="rounded-2xl">
                  임무 현황을 불러오는 중입니다.
                </EmptyState>
              ) : visibleProgress.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {visibleProgress.map((entry) => (
                    <div key={entry.character_id} className="flex flex-col items-center gap-2 overflow-hidden rounded-2xl border border-line bg-surface pb-3">
                      <div className="relative w-full">
                        <CharacterAvatar
                          src={entry.character_image_url}
                          alt={entry.character_name}
                          className={cn(
                            "aspect-square w-full rounded-none transition-all",
                            !entry.achieved && "grayscale opacity-60",
                          )}
                          iconSize={28}
                        />
                        <div className="absolute right-2 top-2">
                          <Checkbox
                            checked={entry.achieved}
                            disabled={!progress.isEditing || progress.saving || entry.reward_paid}
                            className="size-5 border-2 bg-surface shadow-md"
                            onCheckedChange={(checked) =>
                              progress.toggle(entry.character_id, checked === true)
                            }
                          />
                        </div>
                        {entry.reward_paid ? (
                          <span className="absolute bottom-2 right-2 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white shadow-md">
                            완
                          </span>
                        ) : null}
                      </div>
                      <p
                        className="flex h-5 w-full items-center justify-center whitespace-nowrap px-1 text-center font-semibold leading-none text-ivory"
                        style={{ fontSize: `${statusCardNameFontSize(entry.character_name)}px` }}
                      >
                        {entry.character_name}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState className="rounded-2xl">
                  {selectedMission ? "조건에 맞는 캐릭터가 없습니다." : "임무를 선택하면 캐릭터 현황이 표시됩니다."}
                </EmptyState>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
