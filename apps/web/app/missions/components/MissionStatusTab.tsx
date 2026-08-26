"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Gift,
  Pencil,
  Save,
  Target,
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchMissionProgress,
  fetchMissions,
  payMissionRewards,
  saveMissionProgress,
} from "@/lib/api";
import type { Mission, MissionProgress, MissionProgressUpdate } from "@/lib/api";
import { cn } from "@/lib/utils";
import AlertBanner from "@/components/common/AlertBanner";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import EmptyState from "@/components/common/EmptyState";

type MissionType = "일일" | "중요";

const MISSION_TYPE_VARIANT: Record<MissionType, "default" | "warning"> = {
  일일: "default",
  중요: "warning",
};

export default function MissionStatusTab() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedChapter, setSelectedChapter] = useState("");
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(null);
  const [progressEntries, setProgressEntries] = useState<MissionProgress[]>([]);
  const [progressDraft, setProgressDraft] = useState<MissionProgress[]>([]);
  const [showAchievedOnly, setShowAchievedOnly] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loadingMissions, setLoadingMissions] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [payingReward, setPayingReward] = useState(false);
  const [rewardMessage, setRewardMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const chapters = [...new Set(missions.map((m) => m.chapter))];
  const chapterMissions = missions.filter((m) => m.chapter === selectedChapter);
  const selectedMission = chapterMissions.find((m) => m.id === selectedMissionId) ?? null;
  const activeProgress = isEditing ? progressDraft : progressEntries;
  const visibleProgress = showAchievedOnly
    ? activeProgress.filter((e) => e.achieved)
    : activeProgress;
  const achievedCount = activeProgress.filter((e) => e.achieved).length;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoadingMissions(true);
        const list = await fetchMissions();
        if (cancelled) return;
        setMissions(list);
        if (list.length > 0) {
          setSelectedChapter(list[0].chapter);
          setSelectedMissionId(list[0].id);
        }
      } catch (e) {
        if (!cancelled) setErrorMessage(e instanceof Error ? e.message : "임무 데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoadingMissions(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (selectedMissionId == null) return;
    const missionId = selectedMissionId;
    let cancelled = false;
    async function loadProgress() {
      try {
        setLoadingProgress(true);
        const entries = await fetchMissionProgress(missionId);
        if (cancelled) return;
        setProgressEntries(entries);
        setProgressDraft(entries);
      } catch (e) {
        if (!cancelled) {
          setProgressEntries([]);
          setProgressDraft([]);
          setErrorMessage(e instanceof Error ? e.message : "임무 현황을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoadingProgress(false);
      }
    }
    loadProgress();
    return () => { cancelled = true; };
  }, [selectedMissionId]);

  function handleSelectChapter(value: string) {
    const next = missions.find((m) => m.chapter === value);
    setSelectedChapter(value);
    setSelectedMissionId(next?.id ?? null);
    setShowAchievedOnly(false);
    setIsEditing(false);
    setRewardMessage(null);
  }

  function handleSelectMission(id: number) {
    setSelectedMissionId(id);
    setShowAchievedOnly(false);
    setIsEditing(false);
    setRewardMessage(null);
  }

  function updateDraft(characterId: number, patch: Partial<Pick<MissionProgress, "achieved" | "memo">>) {
    setProgressDraft((prev) =>
      prev.map((e) => (e.character_id === characterId ? { ...e, ...patch } : e)),
    );
  }

  async function handleEditOrSave() {
    if (!selectedMission) return;
    if (!isEditing) {
      setProgressDraft(progressEntries);
      setIsEditing(true);
      return;
    }
    try {
      setSavingProgress(true);
      const updated = await saveMissionProgress(
        selectedMission.id,
        progressDraft.map<MissionProgressUpdate>((e) => ({
          character_id: e.character_id,
          achieved: e.achieved,
          memo: e.memo,
        })),
      );
      setProgressEntries(updated);
      setProgressDraft(updated);
      setIsEditing(false);
      setErrorMessage(null);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "임무 현황 저장에 실패했습니다.");
    } finally {
      setSavingProgress(false);
    }
  }

  async function handlePayReward() {
    if (!selectedMission) return;
    try {
      setPayingReward(true);
      setRewardMessage(null);
      const result = await payMissionRewards(selectedMission.id);
      if (result.paid_count === 0) {
        setRewardMessage("이미 모든 달성자에게 보상이 지급되었거나 달성자가 없습니다.");
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
        setRewardMessage(`${result.paid_count}명에게 임무 보상${desc}이 지급되었습니다.`);
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "임무 보상 지급에 실패했습니다.");
    } finally {
      setPayingReward(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      {errorMessage && (
        <AlertBanner>{errorMessage}</AlertBanner>
      )}
      {rewardMessage && (
        <AlertBanner tone="success">{rewardMessage}</AlertBanner>
      )}

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
      </Card>

      {loadingMissions ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          임무 데이터를 불러오는 중입니다.
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <Card>
            <CardHeader>
              <CardTitle>{selectedChapter || "임무"} 목록</CardTitle>
              <CardDescription>선택한 챕터의 임무를 클릭해 상세 현황을 확인합니다.</CardDescription>
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
                      <div className="flex flex-col gap-1">
                        <p className="font-semibold text-ivory">{mission.name}</p>
                        <p className="text-sm text-muted">{mission.description}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant={MISSION_TYPE_VARIANT[mission.mission_type as MissionType] ?? "secondary"}>
                          {mission.mission_type}
                        </Badge>
                        <Badge variant={mission.is_public ? "outline" : "secondary"}>
                          {mission.is_public ? "공개" : "비공개"}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm text-muted">
                      <Gift size={14} />
                      {mission.reward}
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
                <CardDescription>캐릭터별 달성 여부와 메모를 수정할 수 있습니다.</CardDescription>
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
                  <Button
                    variant={isEditing ? "default" : "outline"}
                    onClick={handleEditOrSave}
                    disabled={!selectedMission || loadingProgress || savingProgress}
                  >
                    {isEditing ? <Save size={15} /> : <Pencil size={15} />}
                    {savingProgress ? "저장 중..." : isEditing ? "저장" : "편집"}
                  </Button>
                </div>
              </div>

              {loadingProgress ? (
                <EmptyState className="rounded-2xl">
                  임무 현황을 불러오는 중입니다.
                </EmptyState>
              ) : visibleProgress.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {visibleProgress.map((entry) => (
                    <div key={entry.character_id} className="flex flex-col items-center gap-2 rounded-2xl border border-line px-3 py-4">
                      <div className="relative">
                        <CharacterAvatar
                          src={entry.character_image_url}
                          alt={entry.character_name}
                          className={cn(
                            "size-16 rounded-xl transition-all",
                            !entry.achieved && "grayscale opacity-60",
                          )}
                          iconSize={24}
                        />
                        <div className="absolute -right-1.5 -top-1.5 rounded-full bg-surface p-0.5 shadow-sm">
                          <Checkbox
                            checked={entry.achieved}
                            disabled={!isEditing}
                            onCheckedChange={(checked) =>
                              updateDraft(entry.character_id, { achieved: checked === true })
                            }
                          />
                        </div>
                      </div>
                      <p className="w-full truncate text-center text-sm font-semibold text-ivory">
                        {entry.character_name}
                      </p>
                      {isEditing ? (
                        <Input
                          value={entry.memo}
                          onChange={(e) => updateDraft(entry.character_id, { memo: e.target.value })}
                          placeholder="메모"
                          className="h-7 text-xs"
                        />
                      ) : entry.memo ? (
                        <p className="w-full truncate text-center text-xs text-muted">{entry.memo}</p>
                      ) : null}
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
