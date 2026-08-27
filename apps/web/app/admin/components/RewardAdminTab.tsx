"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AlertBanner from "@/components/common/AlertBanner";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import EmptyState from "@/components/common/EmptyState";
import { useDialog } from "@/components/common/DialogProvider";
import { fetchAllRewards, fetchCharacters, revokeReward } from "@/lib/api";
import type { Character, RewardWithCharacter } from "@/lib/api";
import { formatRewardItems, REWARD_TYPE_LABELS } from "@/lib/rewards";

const ALL_CHARACTERS = "__all__";

export default function RewardAdminTab() {
  const { confirm } = useDialog();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterFilter, setCharacterFilter] = useState<string>(ALL_CHARACTERS);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rewards, setRewards] = useState<RewardWithCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchCharacters().then(setCharacters).catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const list = await fetchAllRewards({
          character_id: characterFilter === ALL_CHARACTERS ? undefined : Number(characterFilter),
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        });
        if (!cancelled) {
          setRewards(list);
          setErrorMessage(null);
        }
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "보상 이력 조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [characterFilter, dateFrom, dateTo]);

  async function handleRevoke(reward: RewardWithCharacter) {
    const ok = await confirm({
      title: "보상 회수",
      description: `${reward.character_name}의 보상(${formatRewardItems(reward)})을 회수할까요?\n회수 후 값이 음수가 될 수 있으며, 회수 내역도 보상 이력에 남습니다.`,
      confirmText: "회수",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const revokeEntry = await revokeReward(reward.id);
      setRewards((prev) => [
        revokeEntry,
        ...prev.map((r) => (r.id === reward.id ? { ...r, revoked: true } : r)),
      ]);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "보상 회수 실패");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {errorMessage && <AlertBanner>{errorMessage}</AlertBanner>}

      <Card>
        <CardHeader>
          <CardTitle>보상 이력</CardTitle>
          <CardDescription>
            러너들에게 지급된 모든 보상 내역입니다. 러너·기간으로 필터링하고, 잘못 지급된 보상은 회수할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* 필터 */}
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-inset p-4">
            <label className="space-y-1">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted">러너</span>
              <Select value={characterFilter} onValueChange={setCharacterFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CHARACTERS}>전체</SelectItem>
                  {characters.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted">시작일</span>
              <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted">종료일</span>
              <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <Badge variant="outline" className="mb-2 ml-auto">{rewards.length}건</Badge>
          </div>

          {loading ? (
            <EmptyState>보상 이력을 불러오는 중입니다.</EmptyState>
          ) : rewards.length === 0 ? (
            <EmptyState>조건에 맞는 보상 이력이 없습니다.</EmptyState>
          ) : (
            <div className="flex flex-col gap-3">
              {rewards.map((reward) => {
                const isRevoke = reward.type === "revoke";
                return (
                  <div
                    key={reward.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <CharacterAvatar
                        src={reward.character_image_url}
                        alt={reward.character_name}
                        className="size-10 shrink-0 rounded-full"
                        iconSize={18}
                      />
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="truncate font-semibold text-ivory">
                          {reward.character_name}
                          <span className="ml-2 font-normal text-ivory/85">{formatRewardItems(reward)}</span>
                        </p>
                        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                          {reward.rewarded_at}
                          <Badge variant={isRevoke ? "destructive" : "secondary"} className="text-xs">
                            {REWARD_TYPE_LABELS[reward.type] ?? reward.type}
                          </Badge>
                          {reward.revoked && <Badge variant="outline" className="text-xs">회수됨</Badge>}
                        </p>
                      </div>
                    </div>
                    {!isRevoke && !reward.revoked && (
                      <Button variant="outline" size="sm" className="shrink-0 gap-1" onClick={() => handleRevoke(reward)}>
                        <RotateCcw size={13} />
                        회수
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
