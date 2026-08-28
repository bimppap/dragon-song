"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  ClipboardList,
  Gift,
  Image as ImageIcon,
  Pencil,
  PlusSquare,
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
  updateChallenge,
  uploadChallengeImage,
} from "@/lib/api";
import type {
  Challenge,
  Chapter,
  ChallengeCreate,
  ChallengeProgress,
  RewardGrant,
  Item,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRequireMember } from "@/lib/auth";
import PageContainer from "@/components/common/PageContainer";
import TabBar from "@/components/common/TabBar";
import Modal from "@/components/common/Modal";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import EmptyState from "@/components/common/EmptyState";
import RewardComposer, { type RewardFormEntry } from "@/components/common/RewardComposer";
import RewardSummary from "@/components/common/RewardSummary";
import { useToast } from "@/components/common/ToastProvider";

const ALL_CHAPTERS = "__all__";

function statusCardNameFontSize(name: string): number {
  return Math.min(14, 132 / Math.max(1, Array.from(name).length));
}

function RunnerChallengeList() {
  const { toast } = useToast();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchChallenges()
      .then((list) => { if (!cancelled) setChallenges(list); })
      .catch((error) => {
        if (cancelled) return;
        toast(error instanceof Error ? error.message : "도전과제 조회 실패", "error");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [toast]);

  const chapters = [...new Set(challenges.map((c) => c.chapter))];

  return (
    <PageContainer max="4xl" className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ivory">
          <Trophy size={24} className="text-gold" />
          도전과제
        </h1>
        <p className="text-sm text-muted">현재 공개된 도전과제 목록입니다.</p>
      </section>

      {loading ? (
        <EmptyState>도전과제 목록을 불러오는 중입니다.</EmptyState>
      ) : challenges.length === 0 ? (
        <EmptyState>
          공개된 도전과제가 없습니다.
        </EmptyState>
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
                  <div key={challenge.id} className="rounded-2xl border border-line px-4 py-4">
                    <div className="flex flex-col gap-1">
                      <p className="font-semibold text-ivory">{challenge.name}</p>
                      <p className="text-sm text-muted">{challenge.description}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm text-muted">
                      <Gift size={14} />
                      {challenge.reward}
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        ))
      )}
    </PageContainer>
  );
}

type PageTab = "manage" | "status";
type ChallengeVisibility = "공개" | "비공개";

type ChallengeFormState = {
  chapter: string;
  name: string;
  description: string;
  reward_entries: RewardFormEntry[];
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
  reward_entries: [],
  visibility: "공개",
};

function toVisibilityText(isPublic: boolean): ChallengeVisibility {
  return isPublic ? "공개" : "비공개";
}

function toRewardEntries(rewardItems: Challenge["reward_items"]): RewardFormEntry[] {
  return rewardItems.map((grant, index) => {
    const id = `edit-${index}-${Math.random().toString(36).slice(2)}`;
    return grant.type === "item"
      ? { id, type: "item", item_id: String(grant.item_id), quantity: String(grant.quantity) }
      : { id, type: "stat", stat: grant.stat, amount: String(grant.amount) };
  });
}

function toChallengeFormState(challenge: Challenge): ChallengeFormState {
  return {
    chapter: challenge.chapter,
    name: challenge.name,
    description: challenge.description,
    reward_entries: toRewardEntries(challenge.reward_items),
    visibility: challenge.is_public ? "공개" : "비공개",
  };
}

function toChallengePayload(form: ChallengeFormState): ChallengeCreate {
  const rewardItems = form.reward_entries.flatMap<RewardGrant>((entry) => {
    if (entry.type === "item") {
      const itemId = parseInt(entry.item_id, 10) || 0;
      return itemId > 0 ? [{ type: "item" as const, item_id: itemId, quantity: Math.max(1, parseInt(entry.quantity, 10) || 1) }] : [];
    }
    const amount = Number(entry.amount);
    return amount > 0 ? [{ type: "stat" as const, stat: entry.stat, amount }] : [];
  });

  return {
    chapter: form.chapter.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    reward: "",
    reward_gold: 0,
    reward_experience: 0,
    reward_ap: 0,
    reward_hp: 0,
    reward_attack: 0,
    reward_defense: 0,
    reward_items: rewardItems,
    is_public: form.visibility === "공개",
  };
}

export function ChallengeAdmin() {
  const { toast } = useToast();
  const [tab, setTab] = useState<PageTab>("status");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [chapterList, setChapterList] = useState<Chapter[]>([]);
  const [manageChapterFilter, setManageChapterFilter] = useState(ALL_CHAPTERS);
  const [form, setForm] = useState<ChallengeFormState>(DEFAULT_FORM);
  const [editingChallengeId, setEditingChallengeId] = useState<number | null>(null);
  const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState("");
  const [selectedChallengeId, setSelectedChallengeId] = useState<number | null>(null);
  const [progressEntries, setProgressEntries] = useState<ChallengeProgress[]>([]);
  const [showAchievedOnly, setShowAchievedOnly] = useState(false);
  const [loadingChallenges, setLoadingChallenges] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [submittingChallenge, setSubmittingChallenge] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [payingReward, setPayingReward] = useState(false);

  const chapters = [...new Set(challenges.map((challenge) => challenge.chapter))];
  const chapterChallenges = challenges.filter(
    (challenge) => challenge.chapter === selectedChapter,
  );
  const visibleChallenges = manageChapterFilter === ALL_CHAPTERS
    ? challenges
    : challenges.filter((challenge) => challenge.chapter === manageChapterFilter);
  const selectedChallenge =
    chapterChallenges.find((challenge) => challenge.id === selectedChallengeId) ?? null;
  const activeProgress = progressEntries;
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
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        toast(
          error instanceof Error ? error.message : "도전과제 데이터를 불러오지 못했습니다.",
          "error",
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
  }, [toast]);

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
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setProgressEntries([]);
        toast(
          error instanceof Error ? error.message : "도전과제 현황을 불러오지 못했습니다.",
          "error",
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
  }, [selectedChallengeId, toast]);

  function handleFormChange<K extends keyof ChallengeFormState>(
    key: K,
    value: ChallengeFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAddChallenge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = toChallengePayload(form);
    if (!payload.chapter || !payload.name || !payload.description) return;

    try {
      setSubmittingChallenge(true);
      let saved: Challenge;
      if (editingChallengeId != null) {
        saved = await updateChallenge(editingChallengeId, payload);
        setEditingChallengeId(null);
      } else {
        saved = await createChallenge(payload);
        setSelectedChapter(saved.chapter);
        setSelectedChallengeId(saved.id);
      }
      if (imageFile) {
        saved = await uploadChallengeImage(saved.id, imageFile);
      }
      setChallenges((prev) => (
        prev.some((c) => c.id === saved.id)
          ? prev.map((c) => (c.id === saved.id ? saved : c))
          : [...prev, saved]
      ));
      setForm({ ...DEFAULT_FORM, chapter: payload.chapter });
      setModalOpen(false);
    } catch (error) {
      console.error(error);
      toast(
        error instanceof Error ? error.message : "도전과제 저장에 실패했습니다.",
        "error",
      );
    } finally {
      setSubmittingChallenge(false);
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : (editingChallenge?.image_url ?? null));
  }

  function openAddChallengeModal() {
    setEditingChallengeId(null);
    setEditingChallenge(null);
    setForm(DEFAULT_FORM);
    setImageFile(null);
    setImagePreview(null);
    setModalOpen(true);
  }

  function handleEditChallengeClick(challenge: Challenge) {
    setEditingChallengeId(challenge.id);
    setEditingChallenge(challenge);
    setForm(toChallengeFormState(challenge));
    setImageFile(null);
    setImagePreview(challenge.image_url);
    setModalOpen(true);
  }

  async function handlePayChallengeReward() {
    if (!selectedChallenge) return;
    try {
      setPayingReward(true);
      const result = await payChallengeRewards(selectedChallenge.id);
      const newlyPaidIds = new Set(result.rewards.map((reward) => reward.character_id));
      if (newlyPaidIds.size > 0) {
        setProgressEntries((prev) => prev.map((entry) => (
          newlyPaidIds.has(entry.character_id) ? { ...entry, reward_paid: true } : entry
        )));
      }
      if (result.paid_count === 0) {
        toast("이미 모든 달성자에게 보상이 지급되었거나 달성자가 없습니다.", "info");
      } else {
        const c = selectedChallenge;
        const parts: string[] = [];
        if (c.reward_gold > 0) parts.push(`골드 ${c.reward_gold.toLocaleString()}G`);
        if (c.reward_experience > 0) parts.push(`경험치 ${c.reward_experience.toLocaleString()}`);
        if (c.reward_ap > 0) parts.push(`AP ${c.reward_ap}`);
        if (c.reward_hp > 0) parts.push(`HP +${c.reward_hp}`);
        if (c.reward_attack > 0) parts.push(`공격력 +${c.reward_attack}`);
        if (c.reward_defense > 0) parts.push(`방어력 +${c.reward_defense}`);
        if (c.reward_items?.length > 0) parts.push(`구성 보상 ${c.reward_items.length}종`);
        const rewardDesc = parts.length > 0 ? `(${parts.join(", ")})` : "";
        toast(`${result.paid_count}명에게 도전과제 보상${rewardDesc}이 지급되었습니다.`, "success");
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "도전과제 보상 지급에 실패했습니다.", "error");
    } finally {
      setPayingReward(false);
    }
  }

  function handleSelectChapter(value: string) {
    const nextChallenge = challenges.find((challenge) => challenge.chapter === value);
    setSelectedChapter(value);
    setSelectedChallengeId(nextChallenge?.id ?? null);
    setShowAchievedOnly(false);
  }

  function handleSelectChallenge(challengeId: number) {
    setSelectedChallengeId(challengeId);
    setShowAchievedOnly(false);
  }

  async function handleProgressToggle(characterId: number, achieved: boolean) {
    if (!selectedChallenge) return;
    const targetEntry = progressEntries.find((entry) => entry.character_id === characterId);
    if (targetEntry?.reward_paid && !achieved) return;
    const previousEntries = progressEntries;
    const nextEntries = progressEntries.map((entry) => (
      entry.character_id === characterId ? { ...entry, achieved } : entry
    ));
    setProgressEntries(nextEntries);
    try {
      setSavingProgress(true);
      const updatedEntries = await saveChallengeProgress(
        selectedChallenge.id,
        nextEntries.map((entry) => ({
          character_id: entry.character_id,
          achieved: entry.achieved,
          memo: entry.memo,
        })),
      );

      setProgressEntries(updatedEntries);
    } catch (error) {
      setProgressEntries(previousEntries);
      console.error(error);
      toast(
        error instanceof Error ? error.message : "도전과제 현황 저장에 실패했습니다.",
        "error",
      );
    } finally {
      setSavingProgress(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <TabBar tabs={PAGE_TABS} active={tab} onChange={setTab} />

      {tab === "manage" ? (
        <section className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>도전과제 리스트</CardTitle>
                <CardDescription>
                  이름, 내용, 보상 구성, 공개 상태를 한 번에 확인할 수 있습니다.
                </CardDescription>
              </div>
              <Button type="button" onClick={openAddChallengeModal} className="gap-2">
                <PlusSquare size={15} />
                도전과제 추가
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-inset px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Trophy size={16} className="text-gold" />
                  등록된 도전과제 {visibleChallenges.length}개
                </div>
                <div className="flex items-center gap-2">
                  <Select value={manageChapterFilter} onValueChange={setManageChapterFilter}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="챕터 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={ALL_CHAPTERS}>전체 챕터</SelectItem>
                        {chapterList.map((c) => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Badge variant="secondary">관리 탭</Badge>
                </div>
              </div>

              {loadingChallenges ? (
                <EmptyState>
                  도전과제 목록을 불러오는 중입니다.
                </EmptyState>
              ) : visibleChallenges.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className="min-w-full text-sm">
                    <thead className="bg-inset text-muted">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold" />
                        <th className="px-4 py-3 text-left font-semibold">이름</th>
                        <th className="px-4 py-3 text-left font-semibold">내용</th>
                        <th className="px-4 py-3 text-left font-semibold">보상 구성</th>
                        <th className="px-4 py-3 text-left font-semibold">상태</th>
                        <th className="px-4 py-3 text-left font-semibold" />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleChallenges.map((challenge) => (
                        <tr
                          key={challenge.id}
                          className="border-t border-line align-top"
                        >
                          <td className="px-4 py-4">
                            <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden border border-line bg-inset">
                              {challenge.image_url ? (
                                <Image src={challenge.image_url} alt={challenge.name} fill sizes="40px" className="object-cover" />
                              ) : (
                                <ImageIcon size={16} className="text-muted" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-ivory">{challenge.name}</td>
                          <td className="px-4 py-4 text-muted">
                            {challenge.description}
                          </td>
                          <td className="px-4 py-4"><RewardSummary entries={challenge.reward_items} items={items} /></td>
                          <td className="px-4 py-4">
                            <Badge
                              variant={
                                challenge.is_public ? "success" : "secondary"
                              }
                            >
                              {toVisibilityText(challenge.is_public)}
                            </Badge>
                          </td>
                          <td className="px-4 py-4">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditChallengeClick(challenge)}
                            >
                              <Pencil size={13} />
                              수정
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState>
                  등록된 도전과제가 없습니다. &quot;도전과제 추가&quot; 버튼으로 첫 도전과제를 추가해 주세요.
                </EmptyState>
              )}
            </CardContent>
          </Card>

          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title={editingChallengeId != null ? "과제 수정" : "과제 추가"}
          >
              <form className="flex flex-col gap-4" onSubmit={handleAddChallenge}>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-ivory">챕터</label>
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
                  <label className="text-sm font-semibold text-ivory">이름</label>
                  <Input
                    value={form.name}
                    onChange={(event) => handleFormChange("name", event.target.value)}
                    placeholder="도전과제 이름"
                    required
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-ivory">내용</label>
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
                  <label className="text-sm font-semibold text-ivory">이미지</label>
                  <div className="flex items-center gap-4">
                    <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-inset">
                      {imagePreview ? (
                        <Image src={imagePreview} alt="도전과제 이미지 미리보기" fill unoptimized className="object-cover object-top" />
                      ) : (
                        <ImageIcon size={22} className="text-muted" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="block text-sm text-ivory/85 file:mr-3 file:rounded-lg file:border-0 file:bg-gold/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gold hover:file:bg-gold/15"
                      />
                      <p className="text-xs text-muted">업로드 시 자동으로 WebP로 변환되며, 5MB를 넘으면 실패합니다.</p>
                    </div>
                  </div>
                </div>

                <RewardComposer
                  entries={form.reward_entries}
                  items={items}
                  onChange={(entries) => handleFormChange("reward_entries", entries)}
                />

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-ivory">상태</label>
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
                  {submittingChallenge ? "저장 중..." : editingChallengeId != null ? "도전과제 수정 저장" : "도전과제 추가"}
                </Button>
              </form>
          </Modal>
        </section>
      ) : (
        <section className="flex flex-col gap-6">
          <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
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
                  <div className="rounded-lg border border-line bg-inset px-4 py-2 text-sm text-muted">
                    챕터 없음
                  </div>
                )}
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
                          ? "border-gold bg-gold/10"
                          : "border-line hover:border-line hover:bg-inset",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden border border-line bg-inset">
                            {challenge.image_url ? (
                              <Image src={challenge.image_url} alt={challenge.name} fill sizes="40px" className="object-cover" />
                            ) : (
                              <ImageIcon size={16} className="text-muted" />
                            )}
                          </div>
                          <div className="flex min-w-0 flex-col gap-1">
                            <p className="font-semibold text-ivory">{challenge.name}</p>
                            <p className="text-sm text-muted">{challenge.description}</p>
                          </div>
                        </div>
                        <Badge
                          variant={challenge.is_public ? "outline" : "secondary"}
                        >
                          {toVisibilityText(challenge.is_public)}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Gift size={14} className="shrink-0 text-muted" />
                        <RewardSummary entries={challenge.reward_items} items={items} />
                      </div>
                    </button>
                  ))
                ) : (
                  <EmptyState className="rounded-2xl">
                    선택한 챕터에 등록된 도전과제가 없습니다.
                  </EmptyState>
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
                <div className="flex flex-col gap-3 rounded-2xl bg-inset px-4 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Target size={15} className="text-gold" />
                    완료 {achievedCount} / {activeProgress.length}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-sm text-ivory/85">
                      <Checkbox
                        checked={showAchievedOnly}
                        onCheckedChange={(checked) =>
                          setShowAchievedOnly(checked === true)
                        }
                      />
                      달성 캐릭터만 보기
                    </label>
                    {savingProgress ? <span className="text-xs text-muted">저장 중...</span> : null}
                  </div>
                </div>

                {loadingProgress ? (
                  <EmptyState className="rounded-2xl">
                    도전과제 현황을 불러오는 중입니다.
                  </EmptyState>
                ) : visibleProgress.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {visibleProgress.map((entry) => (
                      <div
                        key={entry.character_id}
                        className="flex flex-col items-center gap-2 overflow-hidden rounded-2xl border border-line bg-surface pb-3"
                      >
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
                              disabled={savingProgress || entry.reward_paid}
                              className="size-5 border-2 bg-surface shadow-md"
                              onCheckedChange={(checked) =>
                                void handleProgressToggle(entry.character_id, checked === true)
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
                    {selectedChallenge
                      ? "조건에 맞는 캐릭터가 없습니다."
                      : "도전과제를 선택하면 캐릭터 현황이 표시됩니다."}
                  </EmptyState>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}

export default function ChallengesPage() {
  const member = useRequireMember();

  if (!member) return null;

  return <RunnerChallengeList />;
}
