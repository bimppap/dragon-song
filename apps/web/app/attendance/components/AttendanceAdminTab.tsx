"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Flame, Save, UserCheck, UserX } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import AlertBanner from "@/components/common/AlertBanner";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/common/Modal";
import {
  fetchAttendanceMission,
  fetchAttendanceSummary,
  saveAttendanceMission,
} from "@/lib/api";
import type { AttendanceCharacterBrief, AttendanceStreakEntry, AttendanceSummary } from "@/lib/api";
import { todayDateValue } from "@/lib/utils";

const MISSION_MAX = 500;
const STREAK_TOP_COUNT = 10;

function CharacterChip({ character }: { character: AttendanceCharacterBrief }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5">
      <CharacterAvatar src={character.image_url} alt={character.name} className="size-6 rounded-full" iconSize={12} />
      <span className="text-sm font-medium text-ivory">{character.name}</span>
    </div>
  );
}

function StreakRow({ entry, rank }: { entry: AttendanceStreakEntry; rank: number }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-8 shrink-0 text-center text-sm font-bold text-gold">{rank}위</span>
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
  const [selectedDate, setSelectedDate] = useState(todayDateValue);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [missionContent, setMissionContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingMission, setSavingMission] = useState(false);
  const [missionSavedMessage, setMissionSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streakModalOpen, setStreakModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setMissionSavedMessage(null);
        const [summaryData, missionData] = await Promise.all([
          fetchAttendanceSummary(selectedDate),
          fetchAttendanceMission(selectedDate),
        ]);
        if (cancelled) return;
        setSummary(summaryData);
        setMissionContent(missionData?.content ?? "");
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "출석 현황 조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [selectedDate]);

  async function handleSaveMission() {
    try {
      setSavingMission(true);
      const saved = await saveAttendanceMission(selectedDate, missionContent.trim());
      setMissionContent(saved?.content ?? "");
      setMissionSavedMessage(saved ? "출석미션을 저장했습니다." : "출석미션을 비웠습니다. 러너에게는 표시되지 않습니다.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "출석미션 저장 실패");
    } finally {
      setSavingMission(false);
    }
  }

  const streaks = summary?.streaks ?? [];
  const topStreaks = streaks.slice(0, STREAK_TOP_COUNT);

  return (
    <div className="flex flex-col gap-6">
      {errorMessage && <AlertBanner>{errorMessage}</AlertBanner>}
      {missionSavedMessage && <AlertBanner tone="success">{missionSavedMessage}</AlertBanner>}

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>출석 현황</CardTitle>
            <CardDescription>
              날짜를 선택하면 해당 일자의 출석/미출석 캐릭터와 연속출석 순위를 확인할 수 있습니다.
            </CardDescription>
          </div>
          <div className="w-full sm:w-56">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
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

        <CardContent className="flex flex-col gap-6">
          {loading ? (
            <EmptyState>출석 현황을 불러오는 중입니다.</EmptyState>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-line bg-inset p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <UserCheck size={16} className="text-emerald-300" />
                    <p className="text-sm font-semibold text-ivory">출석한 캐릭터</p>
                    <Badge variant="success">{summary?.attended.length ?? 0}명</Badge>
                  </div>
                  {summary && summary.attended.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {summary.attended.map((c) => <CharacterChip key={c.id} character={c} />)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">출석한 캐릭터가 없습니다.</p>
                  )}
                </div>

                <div className="rounded-2xl border border-line bg-inset p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <UserX size={16} className="text-red-400" />
                    <p className="text-sm font-semibold text-ivory">출석하지 않은 캐릭터</p>
                    <Badge variant="outline">{summary?.absent.length ?? 0}명</Badge>
                  </div>
                  {summary && summary.absent.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {summary.absent.map((c) => <CharacterChip key={c.id} character={c} />)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">모든 캐릭터가 출석했습니다.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-inset p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Flame size={16} className="text-gold" />
                    <p className="text-sm font-semibold text-ivory">연속출석 순위 TOP {STREAK_TOP_COUNT}</p>
                  </div>
                  {streaks.length > STREAK_TOP_COUNT && (
                    <Button variant="outline" size="sm" onClick={() => setStreakModalOpen(true)}>
                      더보기
                    </Button>
                  )}
                </div>
                {topStreaks.length === 0 ? (
                  <p className="text-sm text-muted">연속출석 중인 캐릭터가 없습니다.</p>
                ) : (
                  <div className="flex flex-col divide-y divide-line">
                    {topStreaks.map((entry, index) => (
                      <StreakRow key={entry.character_id} entry={entry} rank={index + 1} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>출석미션</CardTitle>
          <CardDescription>
            선택한 날짜의 출석미션을 등록합니다. 내용이 있으면 러너 출석부에 표시되고, 비워 두면 표시되지 않습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea
            value={missionContent}
            onChange={(event) => setMissionContent(event.target.value.slice(0, MISSION_MAX))}
            placeholder="출석미션 내용을 입력해 주세요. (비워서 저장하면 미션이 삭제됩니다)"
            maxLength={MISSION_MAX}
            className="min-h-35"
            disabled={loading || savingMission}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted">{missionContent.length}/{MISSION_MAX}</span>
            <Button onClick={handleSaveMission} disabled={loading || savingMission} className="gap-2">
              <Save size={15} />
              {savingMission ? "저장 중..." : "미션 저장"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={streakModalOpen}
        onClose={() => setStreakModalOpen(false)}
        title={`연속출석 전체 순위 (${streaks.length}명)`}
      >
        <div className="flex flex-col divide-y divide-line">
          {streaks.map((entry, index) => (
            <StreakRow key={entry.character_id} entry={entry} rank={index + 1} />
          ))}
        </div>
      </Modal>
    </div>
  );
}
