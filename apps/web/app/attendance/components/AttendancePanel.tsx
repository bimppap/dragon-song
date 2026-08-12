"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Gift, Image as ImageIcon, Users } from "lucide-react";
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
import { fetchAttendance, fetchCharacters, payAttendanceRewards, saveAttendance } from "@/lib/api";
import type { AttendanceRecord, Character } from "@/lib/api";
import { cn } from "@/lib/utils";
import AlertBanner from "@/components/common/AlertBanner";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "full",
});

function getTodayDateValue() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function formatDateLabel(value: string) {
  if (!value) return "";
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function updateCharacterIds(
  characterIds: number[],
  characterId: number,
  checked: boolean,
) {
  const nextIds = checked
    ? [...characterIds, characterId]
    : characterIds.filter((id) => id !== characterId);
  return [...new Set(nextIds)].toSorted((a, b) => a - b);
}

export default function AttendancePanel() {
  const [selectedDate, setSelectedDate] = useState(getTodayDateValue);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [showAttendedOnly, setShowAttendedOnly] = useState(false);
  const [loadingCharacters, setLoadingCharacters] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [payingReward, setPayingReward] = useState(false);
  const [rewardMessage, setRewardMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCharacters() {
      try {
        setLoadingCharacters(true);
        const characterList = await fetchCharacters();

        if (cancelled) return;

        setCharacters(characterList);
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setErrorMessage(
          error instanceof Error ? error.message : "캐릭터 목록을 불러오지 못했습니다.",
        );
      } finally {
        if (!cancelled) {
          setLoadingCharacters(false);
        }
      }
    }

    loadCharacters();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAttendance(currentDate: string) {
      try {
        setLoadingAttendance(true);
        const nextAttendance = await fetchAttendance(currentDate);

        if (cancelled) return;

        setAttendance(nextAttendance);
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setAttendance(null);
        setErrorMessage(
          error instanceof Error ? error.message : "출석 데이터를 불러오지 못했습니다.",
        );
      } finally {
        if (!cancelled) {
          setLoadingAttendance(false);
        }
      }
    }

    loadAttendance(selectedDate);

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  async function persistAttendance(nextCharacterIds: number[]) {
    const previousAttendance = attendance;
    const optimisticAttendance: AttendanceRecord = {
      attendance_date: selectedDate,
      character_ids: nextCharacterIds,
      reward_paid: previousAttendance?.reward_paid ?? false,
    };

    setAttendance(optimisticAttendance);

    try {
      setSavingAttendance(true);
      const savedAttendance = await saveAttendance(
        selectedDate,
        nextCharacterIds,
        optimisticAttendance.reward_paid,
      );
      setAttendance(savedAttendance);
      setErrorMessage(null);
    } catch (error) {
      console.error(error);
      setAttendance(previousAttendance);
      setErrorMessage(
        error instanceof Error ? error.message : "출석 데이터 저장에 실패했습니다.",
      );
    } finally {
      setSavingAttendance(false);
    }
  }

  async function handlePayReward() {
    try {
      setPayingReward(true);
      setRewardMessage(null);
      const result = await payAttendanceRewards(selectedDate);
      if (result.paid_count === 0) {
        setRewardMessage("이미 모든 출석자에게 보상이 지급되었거나 출석자가 없습니다.");
      } else {
        setRewardMessage(`${result.paid_count}명에게 출석 보상(골드 10G)이 지급되었습니다.`);
        const updated = await fetchAttendance(selectedDate);
        setAttendance(updated);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "출석 보상 지급에 실패했습니다.");
    } finally {
      setPayingReward(false);
    }
  }

  function handleToggleAttendance(characterId: number, checked: boolean | "indeterminate") {
    const nextCharacterIds = updateCharacterIds(
      attendance?.character_ids ?? [],
      characterId,
      checked === true,
    );
    void persistAttendance(nextCharacterIds);
  }

  const attendedCharacterIds = new Set(attendance?.character_ids ?? []);
  const visibleCharacters = showAttendedOnly
    ? characters.filter((character) => attendedCharacterIds.has(character.id))
    : characters;
  const attendedCount = attendance?.character_ids.length ?? 0;

  if (loadingCharacters) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted">
          캐릭터 목록을 불러오는 중입니다.
        </CardContent>
      </Card>
    );
  }

  if (characters.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted">
          출석을 기록할 캐릭터가 없습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {errorMessage && (
        <AlertBanner>{errorMessage}</AlertBanner>
      )}
      {rewardMessage && (
        <AlertBanner tone="success">{rewardMessage}</AlertBanner>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1.5">
            <CardTitle>출석 체크</CardTitle>
            <CardDescription>
              날짜를 선택하면 해당 일자의 캐릭터별 출석 여부를 확인하고 바로 수정할 수 있습니다.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="w-full sm:w-56">
              <p className="mb-1.5 text-xs font-semibold tracking-[0.18em] text-muted uppercase">
                출석 날짜
              </p>
              <Input
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  if (!event.target.value) return;
                  setSelectedDate(event.target.value);
                }}
                disabled={savingAttendance}
              />
            </div>
            <Button
              variant="outline"
              className="gap-2"
              onClick={handlePayReward}
              disabled={payingReward || savingAttendance || !attendance?.character_ids?.length}
            >
              <Gift size={16} />
              {payingReward ? "지급 중..." : "출석 보상 지급"}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-inset p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-ivory">
                <CalendarDays size={16} className="text-gold" />
                {formatDateLabel(selectedDate)}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  <Users size={12} />
                  전체 {characters.length}명
                </Badge>
                <Badge variant={attendedCount > 0 ? "success" : "outline"}>
                  출석 {attendedCount}명
                </Badge>
                <Badge variant={attendance?.reward_paid ? "warning" : "outline"}>
                  {attendance?.reward_paid ? "보상 지급 완료" : "보상 미지급"}
                </Badge>
              </div>
            </div>

            <label className="inline-flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-ivory">
              <Checkbox
                checked={showAttendedOnly}
                onCheckedChange={(checked) => setShowAttendedOnly(checked === true)}
              />
              출석한 캐릭터만 보기
            </label>
          </div>

          {savingAttendance && (
            <p className="text-sm text-muted">출석 데이터를 저장하는 중입니다.</p>
          )}

          {loadingAttendance ? (
            <div className="rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
              선택한 날짜의 출석 데이터를 불러오는 중입니다.
            </div>
          ) : visibleCharacters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
              {showAttendedOnly
                ? "선택한 날짜에 출석한 캐릭터가 없습니다."
                : "표시할 캐릭터가 없습니다."}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {visibleCharacters.map((character) => {
                const checked = attendedCharacterIds.has(character.id);

                return (
                  <label
                    key={character.id}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-xl border-2 transition-colors",
                      checked
                        ? "border-emerald-500 ring-2 ring-emerald-500/30"
                        : "cursor-pointer border-line hover:border-gold",
                    )}
                  >
                    {/* 캐릭터 이미지 */}
                    {character.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={character.image_url} alt={character.name} className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center bg-primary-light/20 text-muted">
                        <ImageIcon size={28} />
                      </div>
                    )}

                    {/* 좌측 상단 체크박스 */}
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-surface/90 p-0.5 shadow-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(nextChecked) => handleToggleAttendance(character.id, nextChecked)}
                        disabled={savingAttendance}
                      />
                    </span>

                    {/* 하단 이름 */}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/75 to-transparent px-2 py-1.5 text-center text-xs font-semibold text-ivory">
                      {character.name}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
