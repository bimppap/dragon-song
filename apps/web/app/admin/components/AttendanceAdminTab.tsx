"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Flame, Gift, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import AlertBanner from "@/components/common/AlertBanner";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import EmptyState from "@/components/common/EmptyState";
import {
  createAttendanceEntry,
  fetchAttendanceEntries,
  fetchAttendanceStreakRanking,
  fetchCharacters,
  payAttendanceRewards,
} from "@/lib/api";
import type { AttendanceEntry, AttendanceStreakEntry, Character } from "@/lib/api";
import { todayDateValue } from "@/lib/utils";

function StreakRow({ entry }: { entry: AttendanceStreakEntry }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-8 shrink-0 text-center text-sm font-bold text-gold">{entry.rank}위</span>
      <CharacterAvatar
        src={entry.character_image_url}
        alt={entry.character_name}
        className="size-8 rounded-lg"
        iconSize={14}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ivory">{entry.character_name}</span>
      <Badge variant="warning">
        <Flame size={12} />
        연속 {entry.streak}일
      </Badge>
    </div>
  );
}

export default function AttendanceAdminTab() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [streaks, setStreaks] = useState<AttendanceStreakEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayDateValue);
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const [entriesData, streaksData] = await Promise.all([
          fetchAttendanceEntries(),
          fetchAttendanceStreakRanking(),
        ]);
        if (cancelled) return;
        setEntries(entriesData);
        setStreaks(streaksData);
        setErrorMessage(null);
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "출석 현황 조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchCharacters().then((data) => { if (!cancelled) setCharacters(data); }).catch(console.error);
    load();
    return () => { cancelled = true; };
  }, []);

  const characterOptions = useMemo(
    () => characters.map((c) => ({
      value: String(c.id),
      label: c.name,
      icon: <CharacterAvatar src={c.image_url} alt={c.name} className="size-5 rounded-full" iconSize={10} />,
    })),
    [characters],
  );

  const unpaidCount = entries.filter((entry) => !entry.reward_paid).length;

  async function handleCheckIn() {
    if (!selectedCharacterId) return;
    try {
      setSubmitting(true);
      const updated = await createAttendanceEntry(Number(selectedCharacterId), selectedDate);
      setEntries(updated);
      setSelectedCharacterId(null);
      setSuccessMessage("출석 처리했습니다.");
      setErrorMessage(null);
      fetchAttendanceStreakRanking().then(setStreaks).catch(() => {});
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "출석 처리 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePayRewards() {
    try {
      setPaying(true);
      const result = await payAttendanceRewards();
      setEntries(result.entries);
      setSuccessMessage(`${result.paid_count}명에게 출석 보상을 전송했습니다.`);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "출석 보상 전송 실패");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {errorMessage && <AlertBanner>{errorMessage}</AlertBanner>}
      {successMessage && <AlertBanner tone="success">{successMessage}</AlertBanner>}

      <Card>
        <CardHeader>
          <CardTitle>출석 처리</CardTitle>
          <CardDescription>캐릭터와 날짜를 선택해 출석을 기록합니다. 보상은 별도로 지급합니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              <UserPlus size={13} />
              캐릭터
            </p>
            <Combobox
              options={characterOptions}
              value={selectedCharacterId}
              onChange={setSelectedCharacterId}
              placeholder="캐릭터 선택"
              searchPlaceholder="캐릭터 이름 검색"
              emptyText="일치하는 캐릭터가 없습니다."
            />
          </div>
          <div className="space-y-1.5 sm:w-48">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              <CalendarDays size={13} />
              출석 날짜
            </p>
            <Input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                if (!event.target.value) return;
                setSelectedDate(event.target.value);
              }}
            />
          </div>
          <Button onClick={handleCheckIn} disabled={!selectedCharacterId || submitting} className="gap-2">
            <UserPlus size={15} />
            {submitting ? "처리 중..." : "출석 처리"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>출석한 캐릭터</CardTitle>
            <CardDescription>보상 수령 여부를 확인하고, 미수령 캐릭터에게 일괄 지급할 수 있습니다.</CardDescription>
          </div>
          <Button
            onClick={handlePayRewards}
            disabled={unpaidCount === 0 || paying}
            variant="cta"
            className="gap-2"
          >
            <Gift size={15} />
            {paying ? "전송 중..." : `출석 보상 전송${unpaidCount > 0 ? ` (${unpaidCount})` : ""}`}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <EmptyState>출석 기록을 불러오는 중입니다.</EmptyState>
          ) : entries.length === 0 ? (
            <EmptyState>출석 기록이 없습니다.</EmptyState>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 py-2">
                  <CharacterAvatar
                    src={entry.character_image_url}
                    alt={entry.character_name}
                    className="size-8 rounded-lg"
                    iconSize={14}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ivory">
                    {entry.character_name}
                  </span>
                  <span className="text-xs text-muted">{entry.attendance_date}</span>
                  <Badge variant={entry.reward_paid ? "success" : "outline"}>
                    {entry.reward_paid ? "보상 수령" : "미수령"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame size={16} className="text-gold" />
            연속 출석 순위
          </CardTitle>
          <CardDescription>연속 출석일 기준 5위까지 표시하며, 동률은 같은 순위로 묶입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {streaks.length === 0 ? (
            <p className="text-sm text-muted">연속출석 중인 캐릭터가 없습니다.</p>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {streaks.map((entry) => (
                <StreakRow key={entry.character_id} entry={entry} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
