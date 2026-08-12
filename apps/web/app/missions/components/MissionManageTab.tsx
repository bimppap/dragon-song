"use client";

import { useEffect, useState } from "react";
import { PlusSquare, ScrollText } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { createMission, fetchChapters, fetchItems, fetchMissions } from "@/lib/api";
import type { Chapter, Item, Mission, MissionCreate, MissionRewardItemGrant } from "@/lib/api";
import { parsePositiveInt } from "@/lib/utils";
import AlertBanner from "@/components/common/AlertBanner";
import EmptyState from "@/components/common/EmptyState";

type MissionVisibility = "공개" | "비공개";
type MissionType = "일일" | "중요";

type RewardItemFormEntry = { item_id: string; quantity: string };

type MissionFormState = {
  chapter: string;
  mission_type: MissionType;
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
  visibility: MissionVisibility;
};

const DEFAULT_FORM: MissionFormState = {
  chapter: "",
  mission_type: "일일",
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

const MISSION_TYPE_VARIANT: Record<MissionType, "default" | "warning"> = {
  일일: "default",
  중요: "warning",
};

function toPayload(form: MissionFormState): MissionCreate {
  const rewardItems: MissionRewardItemGrant[] = form.reward_items
    .map((e) => ({ item_id: parseInt(e.item_id, 10) || 0, quantity: Math.max(1, parseInt(e.quantity, 10) || 1) }))
    .filter((e) => e.item_id > 0);
  return {
    chapter: form.chapter.trim(),
    mission_type: form.mission_type,
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

export default function MissionManageTab() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [chapterList, setChapterList] = useState<Chapter[]>([]);
  const [form, setForm] = useState<MissionFormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [missionList, itemList, chapList] = await Promise.all([fetchMissions(), fetchItems(), fetchChapters()]);
        if (cancelled) return;
        setMissions(missionList);
        setItems(itemList);
        setChapterList(chapList);
        if (chapList.length > 0) {
          setForm((prev) => ({ ...prev, chapter: prev.chapter || chapList[0].name }));
        }
      } catch (e) {
        if (!cancelled) setErrorMessage(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  function set<K extends keyof MissionFormState>(key: K, value: MissionFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleAddRewardItem() {
    setForm((prev) => ({ ...prev, reward_items: [...prev.reward_items, { item_id: "", quantity: "1" }] }));
  }

  function handleUpdateRewardItem(index: number, key: keyof RewardItemFormEntry, value: string) {
    setForm((prev) => ({
      ...prev,
      reward_items: prev.reward_items.map((e, i) => (i === index ? { ...e, [key]: value } : e)),
    }));
  }

  function handleRemoveRewardItem(index: number) {
    setForm((prev) => ({ ...prev, reward_items: prev.reward_items.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = toPayload(form);
    if (!payload.chapter || !payload.name || !payload.description || !payload.reward) return;
    try {
      setSubmitting(true);
      const created = await createMission(payload);
      setMissions((prev) => [...prev, created]);
      setForm({ ...DEFAULT_FORM, chapter: created.chapter, mission_type: form.mission_type });
      setErrorMessage(null);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "임무 생성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
      {errorMessage && (
        <AlertBanner className="xl:col-span-2">{errorMessage}</AlertBanner>
      )}

      <Card>
        <CardHeader>
          <CardTitle>임무 리스트</CardTitle>
          <CardDescription>등록된 모든 임무를 확인할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <ScrollText size={16} className="text-indigo-500" />
              등록된 임무 {missions.length}개
            </div>
            <Badge variant="secondary">관리 탭</Badge>
          </div>

          {loading ? (
            <EmptyState>
              임무 목록을 불러오는 중입니다.
            </EmptyState>
          ) : missions.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">챕터</th>
                    <th className="px-4 py-3 text-left font-semibold">유형</th>
                    <th className="px-4 py-3 text-left font-semibold">이름</th>
                    <th className="px-4 py-3 text-left font-semibold">내용</th>
                    <th className="px-4 py-3 text-left font-semibold">보상</th>
                    <th className="px-4 py-3 text-left font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {missions.map((mission) => (
                    <tr key={mission.id} className="border-t border-slate-200 align-top">
                      <td className="px-4 py-4 font-medium text-slate-700">{mission.chapter}</td>
                      <td className="px-4 py-4">
                        <Badge variant={MISSION_TYPE_VARIANT[mission.mission_type as MissionType] ?? "secondary"}>
                          {mission.mission_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-slate-900">{mission.name}</td>
                      <td className="px-4 py-4 text-slate-500">{mission.description}</td>
                      <td className="px-4 py-4 text-slate-700">{mission.reward}</td>
                      <td className="px-4 py-4">
                        <Badge variant={mission.is_public ? "success" : "secondary"}>
                          {mission.is_public ? "공개" : "비공개"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>
              등록된 임무가 없습니다. 우측 폼에서 첫 임무를 추가해 주세요.
            </EmptyState>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>임무 추가</CardTitle>
          <CardDescription>새 임무를 등록하면 현황 탭에서 즉시 조회할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700">챕터</label>
              <Select value={form.chapter} onValueChange={(v) => set("chapter", v)}>
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
              <label className="text-sm font-semibold text-slate-700">유형</label>
              <Select value={form.mission_type} onValueChange={(v: MissionType) => set("mission_type", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="일일">일일</SelectItem>
                    <SelectItem value="중요">중요</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700">이름</label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="임무 이름"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700">내용</label>
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="달성 조건과 설명을 입력하세요."
                className="min-h-24"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700">보상 설명</label>
              <Input
                value={form.reward}
                onChange={(e) => set("reward", e.target.value)}
                placeholder="예: 골드 1,000G"
                required
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 flex flex-col gap-3">
              <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">보상 구성</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "reward_gold" as const, label: "골드 (G)" },
                  { key: "reward_experience" as const, label: "경험치" },
                  { key: "reward_ap" as const, label: "AP" },
                  { key: "reward_hp" as const, label: "HP 증가" },
                  { key: "reward_attack" as const, label: "공격력 증가" },
                  { key: "reward_defense" as const, label: "방어력 증가" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-600">{label}</label>
                    <Input
                      type="number"
                      min={0}
                      value={form[key]}
                      onChange={(e) => set(key, e.target.value)}
                      placeholder="0"
                    />
                  </div>
                ))}
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
                          onValueChange={(v) => handleUpdateRewardItem(index, "item_id", v)}
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
              <Select value={form.visibility} onValueChange={(v: MissionVisibility) => set("visibility", v)}>
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

            <Button type="submit" className="w-full" disabled={submitting}>
              <PlusSquare size={15} />
              {submitting ? "추가 중..." : "임무 추가"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
