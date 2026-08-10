"use client";

import { useEffect, useState } from "react";
import {
  ClipboardList,
  Eye,
  EyeOff,
  Gift,
  Pencil,
  PlusSquare,
  Save,
  Target,
  Trophy,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createChallenge,
  fetchChallengeProgress,
  fetchChapters,
  fetchChallenges,
  fetchItems,
  payChallengeRewards,
  saveChallengeProgress,
} from "@/lib/api";
import type {
  Challenge,
  Chapter,
  ChallengeCreate,
  ChallengeProgress,
  ChallengeProgressUpdate,
  ChallengeRewardItemGrant,
  Item,
} from "@/lib/api";
import { cn, parsePositiveInt } from "@/lib/utils";
import { useRequireMember } from "@/lib/auth";

function RunnerChallengeList() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchChallenges()
      .then((list) => { if (!cancelled) setChallenges(list); })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "도전과제 조회 실패");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const chapters = [...new Set(challenges.map((c) => c.chapter))];

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Trophy size={24} className="text-indigo-600" />
          도전과제
        </h1>
        <p className="text-sm text-slate-500">현재 공개된 도전과제 목록입니다.</p>
      </section>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
          도전과제 목록을 불러오는 중입니다.
        </div>
      ) : challenges.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
          공개된 도전과제가 없습니다.
        </div>
      ) : (
        chapters.map((chapter) => (
          <Card key={chapter}>
            <CardHeader>
              <CardTitle>{chapter}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {challenges
                .filter((c) => c.chapter === chapter)
                .map((challenge) => (
                  <div key={challenge.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                    <div className="flex flex-col gap-1">
                      <p className="font-semibold text-slate-900">{challenge.name}</p>
                      <p className="text-sm text-slate-500">{challenge.description}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                      <Gift size={14} />
                      {challenge.reward}
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

type PageTab = "manage" | "status";
type ChallengeVisibility = "공개" | "비공개";

type RewardItemFormEntry = { item_id: string; quantity: string };

type ChallengeFormState = {
  chapter: string;
  name: string;
  description: string;
  reward: string;
  reward_gold: string;
  reward_experience: string;
  reward_ap: string;
  reward_hp: string;
  reward_attack: string;
  reward_defense: string;
  reward_items: RewardItemFormEntry[];
  visibility: ChallengeVisibility;
};

const PAGE_TABS: { id: PageTab; label: string; icon: React.ElementType }[] = [
  { id: "status", label: "현황", icon: ClipboardList },
  { id: "manage", label: "도전과제 관리", icon: PlusSquare },
];

const DEFAULT_FORM: ChallengeFormState = {
  chapter: "",
  name: "",
  description: "",
  reward: "",
  reward_gold: "0",
  reward_experience: "0",
  reward_ap: "0",
  reward_hp: "0",
  reward_attack: "0",
  reward_defense: "0",
  reward_items: [],
  visibility: "공개",
};

function toVisibilityText(isPublic: boolean): ChallengeVisibility {
  return isPublic ? "공개" : "비공개";
}

function toChallengePayload(form: ChallengeFormState): ChallengeCreate {
  const rewardItems: ChallengeRewardItemGrant[] = form.reward_items
    .map((entry) => ({
      item_id: parseInt(entry.item_id, 10) || 0,
      quantity: Math.max(1, parseInt(entry.quantity, 10) || 1),
    }))
    .filter((entry) => entry.item_id > 0);

  return {
    chapter: form.chapter.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    reward: form.reward.trim(),
    reward_gold: parsePositiveInt(form.reward_gold),
    reward_experience: parsePositiveInt(form.reward_experience),
    reward_ap: parsePositiveInt(form.reward_ap),
    reward_hp: parsePositiveInt(form.reward_hp),
    reward_attack: parsePositiveInt(form.reward_attack),
    reward_defense: parsePositiveInt(form.reward_defense),
    reward_items: rewardItems,
    is_public: form.visibility === "공개",
  };
}

function AdminChallengesPage() {
  const [tab, setTab] = useState<PageTab>("manage");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [chapterList, setChapterList] = useState<Chapter[]>([]);
  const [form, setForm] = useState<ChallengeFormState>(DEFAULT_FORM);
  const [selectedChapter, setSelectedChapter] = useState("");
  const [selectedChallengeId, setSelectedChallengeId] = useState<number | null>(null);
  const [progressEntries, setProgressEntries] = useState<ChallengeProgress[]>([]);
  const [progressDraft, setProgressDraft] = useState<ChallengeProgress[]>([]);
  const [showAchievedOnly, setShowAchievedOnly] = useState(false);
  const [isEditingProgress, setIsEditingProgress] = useState(false);
  const [loadingChallenges, setLoadingChallenges] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [submittingChallenge, setSubmittingChallenge] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [payingReward, setPayingReward] = useState(false);
  const [rewardMessage, setRewardMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const chapters = [...new Set(challenges.map((challenge) => challenge.chapter))];
  const chapterChallenges = challenges.filter(
    (challenge) => challenge.chapter === selectedChapter,
  );
  const selectedChallenge =
    chapterChallenges.find((challenge) => challenge.id === selectedChallengeId) ?? null;
  const activeProgress = isEditingProgress ? progressDraft : progressEntries;
  const visibleProgress = showAchievedOnly
    ? activeProgress.filter((entry) => entry.achieved)
    : activeProgress;
  const achievedCount = activeProgress.filter((entry) => entry.achieved).length;

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        setLoadingChallenges(true);
        const [challengeList, itemList, chapList] = await Promise.all([fetchChallenges(), fetchItems(), fetchChapters()]);

        if (cancelled) return;

        setChallenges(challengeList);
        setItems(itemList);
        setChapterList(chapList);
        if (challengeList.length > 0) {
          setSelectedChapter(challengeList[0].chapter);
          setSelectedChallengeId(challengeList[0].id);
        }
        if (chapList.length > 0) {
          setForm((prev) => ({ ...prev, chapter: prev.chapter || chapList[0].name }));
        }
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setErrorMessage(
          error instanceof Error ? error.message : "도전과제 데이터를 불러오지 못했습니다.",
        );
      } finally {
        if (!cancelled) {
          setLoadingChallenges(false);
        }
      }
    }

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const challengeId = selectedChallengeId;
    if (challengeId == null) {
      return;
    }

    let cancelled = false;

    async function loadProgress(currentChallengeId: number) {
      try {
        setLoadingProgress(true);
        const entries = await fetchChallengeProgress(currentChallengeId);

        if (cancelled) return;

        setProgressEntries(entries);
        setProgressDraft(entries);
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setProgressEntries([]);
        setProgressDraft([]);
        setErrorMessage(
          error instanceof Error ? error.message : "도전과제 현황을 불러오지 못했습니다.",
        );
      } finally {
        if (!cancelled) {
          setLoadingProgress(false);
        }
      }
    }

    loadProgress(challengeId);

    return () => {
      cancelled = true;
    };
  }, [selectedChallengeId]);

  function handleFormChange<K extends keyof ChallengeFormState>(
    key: K,
    value: ChallengeFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAddChallenge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = toChallengePayload(form);
    if (!payload.chapter || !payload.name || !payload.description || !payload.reward) return;

    try {
      setSubmittingChallenge(true);
      const createdChallenge = await createChallenge(payload);

      setChallenges((prev) => [...prev, createdChallenge]);
      setSelectedChapter(createdChallenge.chapter);
      setSelectedChallengeId(createdChallenge.id);
      setForm({
        chapter: createdChallenge.chapter,
        name: "",
        description: "",
        reward: "",
        reward_gold: "0",
        reward_experience: "0",
        reward_ap: "0",
        reward_hp: "0",
        reward_attack: "0",
        reward_defense: "0",
        reward_items: [],
        visibility: "공개",
      });
      setErrorMessage(null);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : "도전과제 생성에 실패했습니다.",
      );
    } finally {
      setSubmittingChallenge(false);
    }
  }

  async function handlePayChallengeReward() {
    if (!selectedChallenge) return;
    try {
      setPayingReward(true);
      setRewardMessage(null);
      const result = await payChallengeRewards(selectedChallenge.id);
      if (result.paid_count === 0) {
        setRewardMessage("이미 모든 달성자에게 보상이 지급되었거나 달성자가 없습니다.");
      } else {
        const c = selectedChallenge;
        const parts: string[] = [];
        if (c.reward_gold > 0) parts.push(`골드 ${c.reward_gold.toLocaleString()}G`);
        if (c.reward_experience > 0) parts.push(`경험치 ${c.reward_experience.toLocaleString()}`);
        if (c.reward_ap > 0) parts.push(`AP ${c.reward_ap}`);
        if (c.reward_hp > 0) parts.push(`HP +${c.reward_hp}`);
        if (c.reward_attack > 0) parts.push(`공격력 +${c.reward_attack}`);
        if (c.reward_defense > 0) parts.push(`방어력 +${c.reward_defense}`);
        if (c.reward_items?.length > 0) parts.push(`아이템 ${c.reward_items.length}종`);
        const rewardDesc = parts.length > 0 ? `(${parts.join(", ")})` : "";
        setRewardMessage(`${result.paid_count}명에게 도전과제 보상${rewardDesc}이 지급되었습니다.`);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "도전과제 보상 지급에 실패했습니다.");
    } finally {
      setPayingReward(false);
    }
  }

  function handleAddRewardItem() {
    setForm((prev) => ({
      ...prev,
      reward_items: [...prev.reward_items, { item_id: "", quantity: "1" }],
    }));
  }

  function handleUpdateRewardItem(index: number, key: keyof RewardItemFormEntry, value: string) {
    setForm((prev) => ({
      ...prev,
      reward_items: prev.reward_items.map((entry, i) =>
        i === index ? { ...entry, [key]: value } : entry,
      ),
    }));
  }

  function handleRemoveRewardItem(index: number) {
    setForm((prev) => ({
      ...prev,
      reward_items: prev.reward_items.filter((_, i) => i !== index),
    }));
  }

  function handleSelectChapter(value: string) {
    const nextChallenge = challenges.find((challenge) => challenge.chapter === value);
    setSelectedChapter(value);
    setSelectedChallengeId(nextChallenge?.id ?? null);
    setShowAchievedOnly(false);
    setIsEditingProgress(false);
    setRewardMessage(null);
  }

  function handleSelectChallenge(challengeId: number) {
    setSelectedChallengeId(challengeId);
    setShowAchievedOnly(false);
    setIsEditingProgress(false);
    setRewardMessage(null);
  }

  function updateProgressDraft(
    characterId: number,
    patch: Partial<Pick<ChallengeProgress, "achieved" | "memo">>,
  ) {
    setProgressDraft((prev) =>
      prev.map((entry) =>
        entry.character_id === characterId ? { ...entry, ...patch } : entry,
      ),
    );
  }

  async function handleEditOrSaveProgress() {
    if (!selectedChallenge) return;

    if (!isEditingProgress) {
      setProgressDraft(progressEntries);
      setIsEditingProgress(true);
      return;
    }

    try {
      setSavingProgress(true);
      const updatedEntries = await saveChallengeProgress(
        selectedChallenge.id,
        progressDraft.map<ChallengeProgressUpdate>((entry) => ({
          character_id: entry.character_id,
          achieved: entry.achieved,
          memo: entry.memo,
        })),
      );

      setProgressEntries(updatedEntries);
      setProgressDraft(updatedEntries);
      setIsEditingProgress(false);
      setErrorMessage(null);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : "도전과제 현황 저장에 실패했습니다.",
      );
    } finally {
      setSavingProgress(false);
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <p className="text-sm font-semibold tracking-[0.18em] text-indigo-600 uppercase">
          Challenge Desk
        </p>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            도전과제
          </h1>
          <p className="text-sm text-slate-500">
            도전과제 등록, 챕터별 진행 현황, 캐릭터별 달성 메모를 백엔드 데이터와 연결해 관리할 수
            있습니다.
          </p>
        </div>
      </section>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMessage}
        </div>
      )}
      {rewardMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {rewardMessage}
        </div>
      )}

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

      {tab === "manage" ? (
        <section className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <Card>
            <CardHeader>
              <CardTitle>도전과제 리스트</CardTitle>
              <CardDescription>
                챕터, 이름, 내용, 보상, 공개 상태를 한 번에 확인할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Trophy size={16} className="text-indigo-500" />
                  등록된 도전과제 {challenges.length}개
                </div>
                <Badge variant="secondary">관리 탭</Badge>
              </div>

              {loadingChallenges ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                  도전과제 목록을 불러오는 중입니다.
                </div>
              ) : challenges.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">챕터</th>
                        <th className="px-4 py-3 text-left font-semibold">이름</th>
                        <th className="px-4 py-3 text-left font-semibold">내용</th>
                        <th className="px-4 py-3 text-left font-semibold">보상</th>
                        <th className="px-4 py-3 text-left font-semibold">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {challenges.map((challenge) => (
                        <tr
                          key={challenge.id}
                          className="border-t border-slate-200 align-top"
                        >
                          <td className="px-4 py-4 font-medium text-slate-700">
                            {challenge.chapter}
                          </td>
                          <td className="px-4 py-4 text-slate-900">{challenge.name}</td>
                          <td className="px-4 py-4 text-slate-500">
                            {challenge.description}
                          </td>
                          <td className="px-4 py-4 text-slate-700">{challenge.reward}</td>
                          <td className="px-4 py-4">
                            <Badge
                              variant={
                                challenge.is_public ? "success" : "secondary"
                              }
                            >
                              {toVisibilityText(challenge.is_public)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                  등록된 도전과제가 없습니다. 우측 폼에서 첫 도전과제를 추가해 주세요.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>과제 추가</CardTitle>
              <CardDescription>
                새 도전과제를 등록하면 현황 탭에서 즉시 조회할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-4" onSubmit={handleAddChallenge}>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-700">챕터</label>
                  <Select
                    value={form.chapter}
                    onValueChange={(value) => handleFormChange("chapter", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="챕터 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {chapterList.map((c) => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-700">이름</label>
                  <Input
                    value={form.name}
                    onChange={(event) => handleFormChange("name", event.target.value)}
                    placeholder="도전과제 이름"
                    required
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-700">내용</label>
                  <Textarea
                    value={form.description}
                    onChange={(event) =>
                      handleFormChange("description", event.target.value)
                    }
                    placeholder="달성 조건과 설명을 입력하세요."
                    className="min-h-28"
                    required
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-700">보상 설명</label>
                  <Input
                    value={form.reward}
                    onChange={(event) => handleFormChange("reward", event.target.value)}
                    placeholder="예: 골드 3,000G"
                    required
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 flex flex-col gap-3">
                  <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">보상 구성</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-600">골드 (G)</label>
                      <Input
                        type="number"
                        min={0}
                        value={form.reward_gold}
                        onChange={(e) => handleFormChange("reward_gold", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-600">경험치</label>
                      <Input
                        type="number"
                        min={0}
                        value={form.reward_experience}
                        onChange={(e) => handleFormChange("reward_experience", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-600">AP</label>
                      <Input
                        type="number"
                        min={0}
                        value={form.reward_ap}
                        onChange={(e) => handleFormChange("reward_ap", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-600">HP 증가</label>
                      <Input
                        type="number"
                        min={0}
                        value={form.reward_hp}
                        onChange={(e) => handleFormChange("reward_hp", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-600">공격력 증가</label>
                      <Input
                        type="number"
                        min={0}
                        value={form.reward_attack}
                        onChange={(e) => handleFormChange("reward_attack", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-600">방어력 증가</label>
                      <Input
                        type="number"
                        min={0}
                        value={form.reward_defense}
                        onChange={(e) => handleFormChange("reward_defense", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-600">지급 아이템</label>
                      <Button type="button" variant="outline" onClick={handleAddRewardItem} className="h-7 px-3 text-xs">
                        + 추가
                      </Button>
                    </div>
                    {form.reward_items.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {form.reward_items.map((entry, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Select
                              value={entry.item_id}
                              onValueChange={(value) => handleUpdateRewardItem(index, "item_id", value)}
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="아이템 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {items.map((item) => (
                                    <SelectItem key={item.id} value={String(item.id)}>
                                      {item.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              min={1}
                              value={entry.quantity}
                              onChange={(e) => handleUpdateRewardItem(index, "quantity", e.target.value)}
                              placeholder="수량"
                              className="w-20"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => handleRemoveRewardItem(index)}
                              className="h-8 px-2 text-slate-400 hover:text-red-500"
                            >
                              ✕
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">아이템 없음</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-700">상태</label>
                  <Select
                    value={form.visibility}
                    onValueChange={(value: ChallengeVisibility) =>
                      handleFormChange("visibility", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="상태 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="공개">공개</SelectItem>
                        <SelectItem value="비공개">비공개</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" className="w-full" disabled={submittingChallenge}>
                  <PlusSquare size={15} />
                  {submittingChallenge ? "추가 중..." : "도전과제 추가"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      ) : (
        <section className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-1.5">
                <CardTitle>챕터별 현황</CardTitle>
                <CardDescription>
                  챕터를 선택한 뒤 해당 챕터의 도전과제를 클릭하면 캐릭터별 달성 상태를 볼 수 있습니다.
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
                          <SelectItem key={chapter} value={chapter}>
                            {chapter}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-500">
                  챕터 없음
                </div>
              )}
            </CardHeader>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
            <Card>
              <CardHeader>
                <CardTitle>{selectedChapter || "도전과제"} 목록</CardTitle>
                <CardDescription>
                  선택한 챕터에 속한 과제를 클릭해 상세 현황을 확인합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {chapterChallenges.length > 0 ? (
                  chapterChallenges.map((challenge) => (
                    <button
                      key={challenge.id}
                      type="button"
                      onClick={() => handleSelectChallenge(challenge.id)}
                      className={cn(
                        "rounded-2xl border px-4 py-4 text-left transition-colors",
                        selectedChallenge?.id === challenge.id
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-1">
                          <p className="font-semibold text-slate-900">{challenge.name}</p>
                          <p className="text-sm text-slate-500">{challenge.description}</p>
                        </div>
                        <Badge
                          variant={challenge.is_public ? "outline" : "secondary"}
                        >
                          {toVisibilityText(challenge.is_public)}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                        <Gift size={14} />
                        {challenge.reward}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                    선택한 챕터에 등록된 도전과제가 없습니다.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-1.5">
                  <CardTitle>
                    {selectedChallenge?.name ?? "도전과제를 선택하세요"}
                  </CardTitle>
                  <CardDescription>
                    캐릭터 이름, 달성 여부, 메모를 수정할 수 있는 리스트입니다.
                  </CardDescription>
                </div>
                <Button
                  disabled={!selectedChallenge || payingReward}
                  onClick={handlePayChallengeReward}
                >
                  <Gift size={15} />
                  {payingReward ? "지급 중..." : "보상 지급"}
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Target size={15} className="text-indigo-500" />
                    완료 {achievedCount} / {activeProgress.length}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                      <Checkbox
                        checked={showAchievedOnly}
                        onCheckedChange={(checked) =>
                          setShowAchievedOnly(checked === true)
                        }
                      />
                      달성 캐릭터만 보기
                    </label>
                    <Button
                      variant={isEditingProgress ? "default" : "outline"}
                      onClick={handleEditOrSaveProgress}
                      disabled={!selectedChallenge || loadingProgress || savingProgress}
                    >
                      {isEditingProgress ? <Save size={15} /> : <Pencil size={15} />}
                      {savingProgress
                        ? "저장 중..."
                        : isEditingProgress
                          ? "저장"
                          : "편집"}
                    </Button>
                  </div>
                </div>

                {loadingProgress ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                    도전과제 현황을 불러오는 중입니다.
                  </div>
                ) : visibleProgress.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {visibleProgress.map((entry) => (
                      <div
                        key={entry.character_id}
                        className="rounded-2xl border border-slate-200 px-4 py-4"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex flex-col gap-1">
                            <p className="text-base font-semibold text-slate-900">
                              {entry.character_name}
                            </p>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={entry.achieved ? "success" : "secondary"}
                              >
                                {entry.achieved ? "달성" : "미달성"}
                              </Badge>
                              <span className="flex items-center gap-1 text-xs text-slate-400">
                                {entry.achieved ? <Eye size={13} /> : <EyeOff size={13} />}
                                {entry.achieved ? "보상 대상" : "진행 필요"}
                              </span>
                            </div>
                          </div>

                          {isEditingProgress ? (
                            <div className="flex w-full flex-col gap-3 lg:max-w-md">
                              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                <Checkbox
                                  checked={entry.achieved}
                                  onCheckedChange={(checked) =>
                                    updateProgressDraft(entry.character_id, {
                                      achieved: checked === true,
                                    })
                                  }
                                />
                                달성 여부
                              </label>
                              <Input
                                value={entry.memo}
                                onChange={(event) =>
                                  updateProgressDraft(entry.character_id, {
                                    memo: event.target.value,
                                  })
                                }
                                placeholder="메모를 입력하세요."
                              />
                            </div>
                          ) : (
                            <div className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 lg:max-w-md">
                              {entry.memo || "메모 없음"}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                    {selectedChallenge
                      ? "조건에 맞는 캐릭터가 없습니다."
                      : "도전과제를 선택하면 캐릭터 현황이 표시됩니다."}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </main>
  );
}

export default function ChallengesPage() {
  const member = useRequireMember();

  if (!member) return null;

  return member.role === "ADMIN" ? <AdminChallengesPage /> : <RunnerChallengeList />;
}
