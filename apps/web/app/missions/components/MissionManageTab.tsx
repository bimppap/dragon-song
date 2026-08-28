"use client";

import { useEffect, useState } from "react";
import { Pencil, PlusSquare, ScrollText } from "lucide-react";
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
import Modal from "@/components/common/Modal";
import { createMission, fetchChapters, fetchItems, fetchMissions, updateMission } from "@/lib/api";
import type { Chapter, Item, Mission, MissionCreate, RewardGrant } from "@/lib/api";
import EmptyState from "@/components/common/EmptyState";
import RewardComposer, { type RewardFormEntry } from "@/components/common/RewardComposer";
import RewardSummary from "@/components/common/RewardSummary";
import { useToast } from "@/components/common/ToastProvider";

const ALL_CHAPTERS = "__all__";

type MissionVisibility = "공개" | "비공개";
type MissionType = "일일" | "중요";

type MissionFormState = {
  chapter: string;
  mission_type: MissionType;
  name: string;
  description: string;
  reward_entries: RewardFormEntry[];
  visibility: MissionVisibility;
};

const DEFAULT_FORM: MissionFormState = {
  chapter: "",
  mission_type: "일일",
  name: "",
  description: "",
  reward_entries: [],
  visibility: "공개",
};

const MISSION_TYPE_VARIANT: Record<MissionType, "default" | "warning"> = {
  일일: "default",
  중요: "warning",
};

function toPayload(form: MissionFormState): MissionCreate {
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
    mission_type: form.mission_type,
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

function toRewardEntries(rewardItems: Mission["reward_items"]): RewardFormEntry[] {
  return rewardItems.map((grant, index) => {
    const id = `edit-${index}-${Math.random().toString(36).slice(2)}`;
    return grant.type === "item"
      ? { id, type: "item", item_id: String(grant.item_id), quantity: String(grant.quantity) }
      : { id, type: "stat", stat: grant.stat, amount: String(grant.amount) };
  });
}

function toFormState(mission: Mission): MissionFormState {
  return {
    chapter: mission.chapter,
    mission_type: mission.mission_type as MissionType,
    name: mission.name,
    description: mission.description,
    reward_entries: toRewardEntries(mission.reward_items),
    visibility: mission.is_public ? "공개" : "비공개",
  };
}

export default function MissionManageTab() {
  const { toast } = useToast();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [chapterList, setChapterList] = useState<Chapter[]>([]);
  const [chapterFilter, setChapterFilter] = useState(ALL_CHAPTERS);
  const [form, setForm] = useState<MissionFormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
        if (!cancelled) toast(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [toast]);

  const visibleMissions = chapterFilter === ALL_CHAPTERS
    ? missions
    : missions.filter((mission) => mission.chapter === chapterFilter);

  function set<K extends keyof MissionFormState>(key: K, value: MissionFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = toPayload(form);
    if (!payload.chapter || !payload.name || !payload.description) return;
    try {
      setSubmitting(true);
      if (editingId != null) {
        const updated = await updateMission(editingId, payload);
        setMissions((prev) => prev.map((m) => (m.id === editingId ? updated : m)));
        setEditingId(null);
      } else {
        const created = await createMission(payload);
        setMissions((prev) => [...prev, created]);
      }
      setForm({ ...DEFAULT_FORM, chapter: payload.chapter, mission_type: form.mission_type });
      setModalOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "임무 저장에 실패했습니다.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function openAddModal() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setModalOpen(true);
  }

  function handleEditClick(mission: Mission) {
    setEditingId(mission.id);
    setForm(toFormState(mission));
    setModalOpen(true);
  }

  return (
    <section className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>임무 리스트</CardTitle>
            <CardDescription>등록된 모든 임무를 확인할 수 있습니다.</CardDescription>
          </div>
          <Button type="button" onClick={openAddModal} className="gap-2">
            <PlusSquare size={15} />
            임무 추가
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-inset px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted">
              <ScrollText size={16} className="text-gold" />
              등록된 임무 {visibleMissions.length}개
            </div>
            <div className="flex items-center gap-2">
              <Select value={chapterFilter} onValueChange={setChapterFilter}>
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

          {loading ? (
            <EmptyState>
              임무 목록을 불러오는 중입니다.
            </EmptyState>
          ) : visibleMissions.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="min-w-full text-sm">
                <thead className="bg-inset text-muted">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">유형 / 상태</th>
                    <th className="px-4 py-3 text-left font-semibold">이름</th>
                    <th className="px-4 py-3 text-left font-semibold">내용</th>
                    <th className="px-4 py-3 text-left font-semibold">보상 구성</th>
                    <th className="px-4 py-3 text-left font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {visibleMissions.map((mission) => (
                    <tr key={mission.id} className="border-t border-line align-top">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={MISSION_TYPE_VARIANT[mission.mission_type as MissionType] ?? "secondary"}>
                            {mission.mission_type}
                          </Badge>
                          <Badge variant={mission.is_public ? "success" : "secondary"}>
                            {mission.is_public ? "공개" : "비공개"}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-ivory">{mission.name}</td>
                      <td className="px-4 py-4 text-muted">{mission.description}</td>
                      <td className="px-4 py-4"><RewardSummary entries={mission.reward_items} items={items} /></td>
                      <td className="px-4 py-4">
                        <Button type="button" variant="outline" size="sm" onClick={() => handleEditClick(mission)}>
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
              등록된 임무가 없습니다. &quot;임무 추가&quot; 버튼으로 첫 임무를 추가해 주세요.
            </EmptyState>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId != null ? "임무 수정" : "임무 추가"}
      >
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-ivory">챕터</label>
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
              <label className="text-sm font-semibold text-ivory">유형</label>
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
              <label className="text-sm font-semibold text-ivory">이름</label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="임무 이름"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-ivory">내용</label>
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="달성 조건과 설명을 입력하세요."
                className="min-h-24"
                required
              />
            </div>

            <RewardComposer
              entries={form.reward_entries}
              items={items}
              onChange={(entries) => set("reward_entries", entries)}
            />

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-ivory">상태</label>
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
              {submitting ? "저장 중..." : editingId != null ? "임무 수정 저장" : "임무 추가"}
            </Button>
          </form>
      </Modal>
    </section>
  );
}
