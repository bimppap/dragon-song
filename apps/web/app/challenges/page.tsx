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
  fetchChallenges,
  saveChallengeProgress,
} from "@/lib/api";
import type {
  Challenge,
  ChallengeCreate,
  ChallengeProgress,
  ChallengeProgressUpdate,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type PageTab = "manage" | "status";
type ChallengeVisibility = "공개" | "비공개";

type ChallengeFormState = {
  chapter: string;
  name: string;
  description: string;
  reward: string;
  visibility: ChallengeVisibility;
};

const PAGE_TABS: { id: PageTab; label: string; icon: React.ElementType }[] = [
  { id: "manage", label: "도전과제 관리", icon: PlusSquare },
  { id: "status", label: "현황", icon: ClipboardList },
];

const DEFAULT_FORM: ChallengeFormState = {
  chapter: "",
  name: "",
  description: "",
  reward: "",
  visibility: "공개",
};

function toVisibilityText(isPublic: boolean): ChallengeVisibility {
  return isPublic ? "공개" : "비공개";
}

function toChallengePayload(form: ChallengeFormState): ChallengeCreate {
  return {
    chapter: form.chapter.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    reward: form.reward.trim(),
    is_public: form.visibility === "공개",
  };
}

export default function ChallengesPage() {
  const [tab, setTab] = useState<PageTab>("manage");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
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

    async function loadChallenges() {
      try {
        setLoadingChallenges(true);
        const challengeList = await fetchChallenges();

        if (cancelled) return;

        setChallenges(challengeList);
        if (challengeList.length > 0) {
          setSelectedChapter(challengeList[0].chapter);
          setSelectedChallengeId(challengeList[0].id);
          setForm((prev) => ({
            ...prev,
            chapter: prev.chapter || challengeList[0].chapter,
          }));
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

    loadChallenges();

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

  function handleSelectChapter(value: string) {
    const nextChallenge = challenges.find((challenge) => challenge.chapter === value);
    setSelectedChapter(value);
    setSelectedChallengeId(nextChallenge?.id ?? null);
    setShowAchievedOnly(false);
    setIsEditingProgress(false);
  }

  function handleSelectChallenge(challengeId: number) {
    setSelectedChallengeId(challengeId);
    setShowAchievedOnly(false);
    setIsEditingProgress(false);
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
                  <Input
                    value={form.chapter}
                    onChange={(event) => handleFormChange("chapter", event.target.value)}
                    placeholder="예: 2장"
                    required
                  />
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
                  <label className="text-sm font-semibold text-slate-700">보상</label>
                  <Input
                    value={form.reward}
                    onChange={(event) => handleFormChange("reward", event.target.value)}
                    placeholder="예: 골드 3,000G"
                    required
                  />
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
                <Button disabled={!selectedChallenge}>
                  <Gift size={15} />
                  보상 지급
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
