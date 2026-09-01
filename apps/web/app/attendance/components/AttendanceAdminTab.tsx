"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Flame, Gift, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import EmptyState from "@/components/common/EmptyState";
import { useDialog } from "@/components/common/DialogProvider";
import { useToast } from "@/components/common/ToastProvider";
import {
  createAttendanceEntry,
  deleteAttendanceEntry,
  fetchAttendanceEntries,
  fetchAttendanceStreakRanking,
  fetchCharacters,
  payAttendanceRewards,
} from "@/lib/api";
import type { AttendanceEntry, AttendanceStreakEntry, Character } from "@/lib/api";
import { todayDateValue } from "@/lib/utils";

function attendanceCardNameFontSize(name: string): number {
  return Math.min(14, 132 / Math.max(1, Array.from(name).length));
}

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
  const { confirm } = useDialog();
  const { toast } = useToast();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [streaks, setStreaks] = useState<AttendanceStreakEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayDateValue);
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);

  const [dateFilter, setDateFilter] = useState("all");
  const [characterFilter, setCharacterFilter] = useState("all");
  const [showAbsentOnly, setShowAbsentOnly] = useState(false);

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
        const latestDate = entriesData
          .map((entry) => entry.attendance_date)
          .toSorted((a, b) => b.localeCompare(a))[0];
        if (latestDate) setDateFilter(latestDate);
      } catch (error) {
        if (!cancelled) toast(error instanceof Error ? error.message : "출석 현황 조회 실패", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchCharacters().then((data) => { if (!cancelled) setCharacters(data); }).catch(console.error);
    load();
    return () => { cancelled = true; };
  }, [toast]);

  const charactersById = useMemo(
    () => new Map(characters.map((c) => [String(c.id), c])),
    [characters],
  );

  const sortedEntries = useMemo(
    () => entries.toSorted((a, b) => {
      const dateOrder = b.attendance_date.localeCompare(a.attendance_date);
      return dateOrder || a.character_name.localeCompare(b.character_name, "ko");
    }),
    [entries],
  );

  const sortedSelectedCharacterIds = useMemo(
    () => selectedCharacterIds.toSorted((a, b) => (
      (charactersById.get(a)?.name ?? "").localeCompare(charactersById.get(b)?.name ?? "", "ko")
    )),
    [charactersById, selectedCharacterIds],
  );

  const alreadyAttendedIdsForSelectedDate = useMemo(
    () => new Set(
      entries
        .filter((entry) => entry.attendance_date === selectedDate)
        .map((entry) => entry.character_id),
    ),
    [entries, selectedDate],
  );

  const characterOptions = useMemo(
    () => characters
      .filter((c) => !selectedCharacterIds.includes(String(c.id)) && !alreadyAttendedIdsForSelectedDate.has(c.id))
      .map((c) => ({
        value: String(c.id),
        label: c.name,
        icon: <CharacterAvatar src={c.image_url} alt={c.name} className="size-5 rounded-full" iconSize={10} />,
      })),
    [characters, selectedCharacterIds, alreadyAttendedIdsForSelectedDate],
  );

  const attendanceDates = useMemo(
    () => [...new Set(entries.map((entry) => entry.attendance_date))].toSorted((a, b) => b.localeCompare(a)),
    [entries],
  );

  const attendedCharacters = useMemo(() => {
    const byId = new Map<number, { id: number; name: string }>();
    for (const entry of entries) {
      if (!byId.has(entry.character_id)) {
        byId.set(entry.character_id, { id: entry.character_id, name: entry.character_name });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [entries]);

  const filteredEntries = useMemo(
    () => sortedEntries.filter((entry) => (
      (dateFilter === "all" || entry.attendance_date === dateFilter)
      && (characterFilter === "all" || String(entry.character_id) === characterFilter)
    )),
    [sortedEntries, dateFilter, characterFilter],
  );

  const absentCharacters = useMemo(() => {
    // 날짜를 특정하지 않은 경우, 해당 날짜에 국한하지 않고 한 번도 출석하지 않은 캐릭터를 보여준다.
    const attendedIds = new Set(
      entries
        .filter((entry) => dateFilter === "all" || entry.attendance_date === dateFilter)
        .map((entry) => entry.character_id),
    );
    return characters
      .filter((c) => !attendedIds.has(c.id) && (characterFilter === "all" || String(c.id) === characterFilter))
      .toSorted((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [characters, entries, dateFilter, characterFilter]);

  const unpaidCount = entries.filter((entry) => !entry.reward_paid).length;

  function handleSelectCharacter(value: string) {
    setSelectedCharacterIds((prev) => (prev.includes(value) ? prev : [...prev, value]));
  }

  function handleUnselectCharacter(value: string) {
    setSelectedCharacterIds((prev) => prev.filter((id) => id !== value));
  }

  async function handleCheckIn() {
    if (selectedCharacterIds.length === 0) return;
    try {
      setSubmitting(true);
      const failedNames: string[] = [];
      let updated: AttendanceEntry[] = entries;

      for (const characterId of selectedCharacterIds) {
        try {
          updated = await createAttendanceEntry(Number(characterId), selectedDate);
        } catch (error) {
          const name = charactersById.get(characterId)?.name ?? characterId;
          failedNames.push(`${name}(${error instanceof Error ? error.message : "실패"})`);
        }
      }

      setEntries(updated);
      setSelectedCharacterIds([]);
      fetchAttendanceStreakRanking().then(setStreaks).catch(() => {});

      if (failedNames.length > 0) {
        toast(`일부 캐릭터 출석 처리에 실패했습니다: ${failedNames.join(", ")}`, "error");
      } else {
        toast("출석 처리했습니다.", "success");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveEntry(entry: AttendanceEntry) {
    const ok = await confirm({
      title: "출석 취소",
      description: `${entry.character_name}의 ${entry.attendance_date} 출석 기록을 삭제할까요?`,
      confirmText: "삭제",
      tone: "danger",
    });
    if (!ok) return;

    try {
      const updated = await deleteAttendanceEntry(entry.id);
      setEntries(updated);
      toast("출석 기록을 삭제했습니다.", "success");
      fetchAttendanceStreakRanking().then(setStreaks).catch(() => {});
    } catch (error) {
      toast(error instanceof Error ? error.message : "출석 기록 삭제 실패", "error");
    }
  }

  async function handlePayRewards() {
    const unpaidEntries = entries.filter((entry) => !entry.reward_paid);
    if (unpaidEntries.length === 0) return;

    const ok = await confirm({
      title: "출석 보상 전송",
      description: `아래 ${unpaidEntries.length}명에게 출석 보상을 전송할까요?`,
      confirmText: "전송",
      content: (
        <div className="mt-3 flex max-h-48 flex-col gap-2 overflow-y-auto rounded-lg border border-line bg-ground/40 p-2">
          {unpaidEntries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2">
              <CharacterAvatar
                src={entry.character_image_url}
                alt={entry.character_name}
                className="size-6 rounded-full"
                iconSize={12}
              />
              <span className="text-sm text-ivory">{entry.character_name}</span>
            </div>
          ))}
        </div>
      ),
    });
    if (!ok) return;

    try {
      setPaying(true);
      const result = await payAttendanceRewards();
      setEntries(result.entries);
      toast(`${result.paid_count}명에게 출석 보상을 전송했습니다.`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "출석 보상 전송 실패", "error");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>출석 처리</CardTitle>
          <CardDescription>캐릭터와 날짜를 선택해 출석을 기록합니다. 보상은 별도로 지급합니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                <UserPlus size={13} />
                캐릭터
              </p>
              <Combobox
                options={characterOptions}
                value={null}
                onChange={handleSelectCharacter}
                placeholder="캐릭터 선택 (여러 명 선택 가능)"
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
            <Button onClick={handleCheckIn} disabled={selectedCharacterIds.length === 0 || submitting} className="gap-2">
              <UserPlus size={15} />
              {submitting ? "처리 중..." : `출석 처리${selectedCharacterIds.length > 0 ? ` (${selectedCharacterIds.length})` : ""}`}
            </Button>
          </div>

          {selectedCharacterIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sortedSelectedCharacterIds.map((id) => {
                const character = charactersById.get(id);
                return (
                  <Badge key={id} variant="secondary" className="gap-1.5 py-1 pl-1.5 pr-1">
                    <CharacterAvatar
                      src={character?.image_url ?? null}
                      alt={character?.name ?? id}
                      className="size-4 rounded-full"
                      iconSize={9}
                    />
                    {character?.name ?? id}
                    <button
                      type="button"
                      onClick={() => handleUnselectCharacter(id)}
                      className="rounded-full p-0.5 text-ivory/70 transition-colors hover:bg-ivory/15 hover:text-ivory"
                      aria-label={`${character?.name ?? id} 선택 해제`}
                    >
                      <X size={11} />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          </div>
          {entries.length > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">날짜 필터</p>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 날짜</SelectItem>
                    {attendanceDates.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">캐릭터 필터</p>
                <Select value={characterFilter} onValueChange={setCharacterFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 캐릭터</SelectItem>
                    {attendedCharacters.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {characters.length > 0 && (
            <label className="flex w-fit items-center gap-2 text-sm font-medium text-ivory">
              <Checkbox checked={showAbsentOnly} onCheckedChange={(checked) => setShowAbsentOnly(checked === true)} />
              미출석 캐릭터 보기
            </label>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <EmptyState>출석 기록을 불러오는 중입니다.</EmptyState>
          ) : entries.length === 0 && !showAbsentOnly ? (
            <EmptyState>출석 기록이 없습니다.</EmptyState>
          ) : showAbsentOnly ? (
            absentCharacters.length === 0 ? (
              <EmptyState>조건에 맞는 미출석 캐릭터가 없습니다.</EmptyState>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {absentCharacters.map((character) => (
                  <div
                    key={character.id}
                    className="flex flex-col items-center gap-2 overflow-hidden rounded-2xl border border-line bg-surface pb-3"
                  >
                    <CharacterAvatar
                      src={character.image_url}
                      alt={character.name}
                      className="aspect-square w-full rounded-none grayscale opacity-60"
                      iconSize={28}
                    />
                    <p
                      className="flex h-5 w-full items-center justify-center whitespace-nowrap px-1 text-center font-semibold leading-none text-ivory"
                      style={{ fontSize: `${attendanceCardNameFontSize(character.name)}px` }}
                    >
                      {character.name}
                    </p>
                  </div>
                ))}
              </div>
            )
          ) : filteredEntries.length === 0 ? (
            <EmptyState>조건에 맞는 출석 기록이 없습니다.</EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="group flex flex-col items-center gap-2 overflow-hidden rounded-2xl border border-line bg-surface pb-3"
                >
                  <div className="relative w-full">
                    <CharacterAvatar
                      src={entry.character_image_url}
                      alt={entry.character_name}
                      className="aspect-square w-full rounded-none"
                      iconSize={28}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveEntry(entry)}
                      aria-label={`${entry.character_name} 출석 기록 삭제`}
                      className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-ground/70 text-ivory/80 opacity-0 transition-opacity hover:bg-ground hover:text-ivory focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <X size={13} />
                    </button>
                    {entry.reward_paid && (
                      <span className="absolute bottom-2 right-2 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white shadow-md">
                        완
                      </span>
                    )}
                  </div>
                  <p
                    className="flex h-5 w-full items-center justify-center whitespace-nowrap px-1 text-center font-semibold leading-none text-ivory"
                    style={{ fontSize: `${attendanceCardNameFontSize(entry.character_name)}px` }}
                  >
                    {entry.character_name}
                  </p>
                  {dateFilter === "all" && (
                    <span className="text-[11px] text-muted">{entry.attendance_date}</span>
                  )}
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
