"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import AlertBanner from "@/components/common/AlertBanner";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import EmptyState from "@/components/common/EmptyState";
import { useDialog } from "@/components/common/DialogProvider";
import {
  createAttendanceEntry,
  deleteAttendanceEntry,
  fetchAttendanceEntries,
  fetchAttendanceMission,
  updateAttendanceEntry,
} from "@/lib/api";
import type { AttendanceEntry, AttendanceMission, Member } from "@/lib/api";
import { cn, toDateValue, todayDateValue } from "@/lib/utils";

const MESSAGE_MAX = 200;

const timestampFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) return null;
  const variant = rank === 1 ? "default" : rank === 2 ? "secondary" : "outline";
  return <Badge variant={variant} className="shrink-0">{rank}등</Badge>;
}

export default function AttendanceBook({ member }: { member: Member }) {
  const today = todayDateValue();
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(today);
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [mission, setMission] = useState<AttendanceMission | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const dialog = useDialog();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const [entryList, missionData] = await Promise.all([
          fetchAttendanceEntries(selectedDate),
          fetchAttendanceMission(selectedDate),
        ]);
        if (cancelled) return;
        setEntries(entryList);
        setMission(missionData);
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "출석 데이터 조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [selectedDate]);

  function moveMonth(delta: number) {
    setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const isToday = selectedDate === today;
  const myCharacterId = member.character_id;
  const alreadyAttended = myCharacterId != null && entries.some((e) => e.character_id === myCharacterId);
  const canWrite = isToday && myCharacterId != null && !alreadyAttended;

  async function handleSubmit() {
    try {
      setSubmitting(true);
      setEntries(await createAttendanceEntry(selectedDate, message.trim()));
      setMessage("");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "출석 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveEdit(entryId: number) {
    try {
      setEntries(await updateAttendanceEntry(entryId, editMessage.trim()));
      setEditingId(null);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "출석 수정 실패");
    }
  }

  async function handleDelete(entry: AttendanceEntry) {
    const ok = await dialog.confirm({
      title: "출석 기록 삭제",
      description: `${entry.character_name}의 출석 한마디를 삭제할까요?`,
      confirmText: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    try {
      setEntries(await deleteAttendanceEntry(entry.id));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "출석 삭제 실패");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {errorMessage && <AlertBanner>{errorMessage}</AlertBanner>}

      {/* 월 이동 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          className="flex size-8 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-gold hover:text-gold"
          aria-label="이전 달"
        >
          <ChevronLeft size={16} />
        </button>
        <h2 className="text-xl font-bold tracking-tight text-ivory">
          {year}년 {String(month).padStart(2, "0")}월
        </h2>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          className="flex size-8 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-gold hover:text-gold"
          aria-label="다음 달"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* 날짜 스트립 */}
      <div className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-1">
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const value = toDateValue(new Date(year, month - 1, day));
          const selected = value === selectedDate;
          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDate(value)}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                selected
                  ? "border-2 border-gold text-gold"
                  : value === today
                    ? "text-ivory underline decoration-gold/60 underline-offset-4 hover:text-gold"
                    : "text-muted hover:text-gold",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* 출석미션 (있을 때만) */}
      {mission && (
        <div className="pixel-frame bg-surface/75 px-4 py-6 text-center">
          <p className="font-pixel-sm mb-3 text-sm tracking-[0.2em] text-red-400">출석미션</p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ivory/90">{mission.content}</p>
        </div>
      )}

      {/* 오늘의 한마디 입력 (오늘 날짜 + 미출석일 때만) */}
      {canWrite && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value.slice(0, MESSAGE_MAX))}
              placeholder="글을 입력해 주세요."
              maxLength={MESSAGE_MAX}
              className="min-h-30"
              disabled={submitting}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted">
                오늘의 출첵 멤버 : <span className="font-semibold text-gold">{entries.length}명</span>
                <span className="ml-3 text-xs">{message.length}/{MESSAGE_MAX}</span>
              </p>
              <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                <CalendarCheck size={15} />
                {submitting ? "출석 중..." : "출석하기"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isToday && myCharacterId != null && alreadyAttended && (
        <AlertBanner tone="success">오늘 출석을 완료했습니다. 보상으로 골드 1G와 CP 1이 지급되었어요.</AlertBanner>
      )}

      {/* 출석 목록 (최신순) */}
      {loading ? (
        <EmptyState>출석 데이터를 불러오는 중입니다.</EmptyState>
      ) : entries.length === 0 ? (
        <EmptyState>이 날짜에 출석한 모험가가 없습니다.</EmptyState>
      ) : (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {entries.map((entry) => {
            const isMine = myCharacterId != null && entry.character_id === myCharacterId;
            const canDelete = isMine || member.role === "ADMIN";
            const editing = editingId === entry.id;
            return (
              <div key={entry.id} className="flex items-start gap-4 py-4">
                <CharacterAvatar
                  src={entry.character_image_url}
                  alt={entry.character_name}
                  className="size-12 rounded-lg border border-line"
                  iconSize={20}
                />

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm font-bold text-ivory">{entry.character_name}</p>
                  {editing ? (
                    <div className="flex flex-col gap-2">
                      <Textarea
                        value={editMessage}
                        onChange={(event) => setEditMessage(event.target.value.slice(0, MESSAGE_MAX))}
                        maxLength={MESSAGE_MAX}
                        className="min-h-20"
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => handleSaveEdit(entry.id)}>저장</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>취소</Button>
                        <span className="text-xs text-muted">{editMessage.length}/{MESSAGE_MAX}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <RankBadge rank={entry.rank} />
                      <p className="whitespace-pre-line wrap-break-word text-sm text-ivory/90">
                        {entry.message || <span className="text-muted">(한마디 없음)</span>}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2 pt-0.5 text-xs text-muted">
                  <span>{timestampFormatter.format(new Date(entry.created_at))}</span>
                  {isMine && !editing && (
                    <button
                      type="button"
                      onClick={() => { setEditingId(entry.id); setEditMessage(entry.message); }}
                      className="flex items-center gap-1 border-l border-line pl-2 transition-colors hover:text-gold"
                    >
                      <Pencil size={12} />수정
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(entry)}
                      className="flex items-center gap-1 border-l border-line pl-2 transition-colors hover:text-red-400"
                    >
                      <Trash2 size={12} />삭제
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
