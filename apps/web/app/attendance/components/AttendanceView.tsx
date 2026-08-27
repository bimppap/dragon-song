"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import AlertBanner from "@/components/common/AlertBanner";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import EmptyState from "@/components/common/EmptyState";
import { fetchAttendanceEntries } from "@/lib/api";
import type { AttendanceEntry } from "@/lib/api";
import { todayDateValue } from "@/lib/utils";

export default function AttendanceView() {
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayDateValue);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchAttendanceEntries()
      .then((data) => { if (!cancelled) { setEntries(data); setErrorMessage(null); } })
      .catch((error) => { if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "출석 조회 실패"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const entriesForDate = useMemo(
    () => entries.filter((entry) => entry.attendance_date === selectedDate),
    [entries, selectedDate],
  );

  return (
    <div className="flex flex-col gap-6">
      {errorMessage && <AlertBanner>{errorMessage}</AlertBanner>}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>출석 캐릭터 조회</CardTitle>
          <div className="space-y-1.5 sm:w-48">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              <CalendarDays size={13} />
              조회 날짜
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
        </CardHeader>
        <CardContent>
          {loading ? (
            <EmptyState>출석 기록을 불러오는 중입니다.</EmptyState>
          ) : entriesForDate.length === 0 ? (
            <EmptyState>해당 날짜에 출석한 캐릭터가 없습니다.</EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {entriesForDate.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col items-center gap-2 overflow-hidden rounded-2xl border border-line bg-surface pb-3"
                >
                  <CharacterAvatar
                    src={entry.character_image_url}
                    alt={entry.character_name}
                    className="aspect-square w-full rounded-none"
                    iconSize={28}
                  />
                  <span className="truncate px-3 text-sm font-semibold text-ivory">{entry.character_name}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
