"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { CalendarClock, Image as ImageIcon } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { useToast } from "@/components/common/ToastProvider";
import { Badge } from "@/components/ui/badge";
import { fetchActiveChapter, fetchEnemies, fetchLiveBattle, type BattleSession, type Chapter, type Enemy } from "@/lib/api";
import { useBattleSocket, type BattleDraftPreview } from "@/lib/useBattleSocket";
import BattleArena from "./BattleArena";

// 진행 상황 갱신은 WebSocket이 담당하고, 폴링은 연결 실패 시를 대비한 폴백으로만 남긴다.
const LIVE_BATTLE_POLL_MIN_MS = 15000;
const LIVE_BATTLE_POLL_JITTER_MS = 5000;
// 챕터/에너미 조회가 실패했을 때 재시도 횟수와 간격(지수 백오프, 상한 8초).
const CHAPTER_LOAD_MAX_RETRIES = 4;
const CHAPTER_LOAD_RETRY_MAX_MS = 8000;

export default function RunnerBattleOverview() {
  const { toast } = useToast();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveSession, setLiveSession] = useState<BattleSession | null>(null);
  const [draftPreview, setDraftPreview] = useState<BattleDraftPreview | null>(null);
  const liveVersionRef = useRef<Pick<BattleSession, "id" | "updated_at"> | null>(null);

  const { connected: battleSocketConnected } = useBattleSocket(liveSession?.id ?? null, (msg) => {
    if (msg.type === "battle_update") {
      const previous = liveVersionRef.current;
      if (previous?.id === msg.session.id && previous.updated_at > msg.session.updated_at) return;
      setLiveSession(msg.session);
      liveVersionRef.current = { id: msg.session.id, updated_at: msg.session.updated_at };
      setDraftPreview(msg.preview);
    } else if (msg.type === "battle_deleted") {
      setLiveSession(null);
      liveVersionRef.current = null;
      setDraftPreview(null);
    } else if (msg.type === "draft_preview") {
      if (msg.version !== liveVersionRef.current?.updated_at) return;
      setDraftPreview(msg.draft);
    }
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;

    async function load() {
      setLoading(true); // 재시도 중에도 오류 대신 로딩 상태를 유지한다.
      try {
        const [activeChapter, visibleEnemies] = await Promise.all([
          fetchActiveChapter(),
          fetchEnemies(),
        ]);
        if (cancelled) return;
        setChapter(activeChapter);
        setEnemies(visibleEnemies);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        // 서버가 깨어나는 중이거나 액세스 토큰 재발급이 잠시 실패한 경우가 대부분이라,
        // 곧바로 오류를 띄우지 않고 몇 차례 다시 시도한다. 그 동안에는 로딩 상태를 유지한다.
        failures += 1;
        if (failures > CHAPTER_LOAD_MAX_RETRIES) {
          setLoading(false);
          toast(e instanceof Error ? e.message : "전투 정보를 불러오지 못했습니다.", "error");
          return;
        }
        timer = setTimeout(() => void load(), Math.min(1000 * 2 ** failures, CHAPTER_LOAD_RETRY_MAX_MS));
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [toast]);

  // 관리자가 실전 전투를 시작했는지 주기적으로 확인해, 있으면 관전 화면으로 전환한다.
  useEffect(() => {
    // 소켓이 살아 있는 동안에는 같은 전투 상태를 REST로 중복 확인하지 않는다.
    if (battleSocketConnected) return;
    let cancelled = false;
    let polling = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function scheduleNextPoll() {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      const delay = LIVE_BATTLE_POLL_MIN_MS + Math.random() * LIVE_BATTLE_POLL_JITTER_MS;
      timer = setTimeout(() => void poll(), delay);
    }

    async function poll() {
      if (cancelled || polling) return;
      if (document.visibilityState === "hidden") {
        scheduleNextPoll();
        return;
      }
      polling = true;
      try {
        const live = await fetchLiveBattle(liveVersionRef.current ?? undefined);
        if (!cancelled && live !== undefined) {
          const previous = liveVersionRef.current;
          if (live && previous?.id === live.id && previous.updated_at > live.updated_at) return;
          if (previous?.id !== live?.id || previous?.updated_at !== live?.updated_at) setDraftPreview(null);
          setLiveSession(live);
          liveVersionRef.current = live ? { id: live.id, updated_at: live.updated_at } : null;
        }
      } catch {
        // 일시적인 폴링 실패에는 현재 화면을 유지하고 다음 주기에 재시도한다.
      } finally {
        polling = false;
        scheduleNextPoll();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      timer = null;
      void poll();
    }

    void poll();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [battleSocketConnected]);

  if (liveSession != null) {
    return (
      <BattleArena
        sessionId={liveSession.id}
        externalSession={liveSession}
        draftPreview={draftPreview}
        readOnly
        onExit={() => setLiveSession(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-xl font-semibold text-ivory">{chapter?.name ?? "진행 중인 챕터 없음"}</h1>
        {chapter?.battle_date ? (
          <Badge variant={chapter.is_battle_open ? "success" : "outline"} className="font-num">
            전투 일정 {chapter.battle_date}
          </Badge>
        ) : (
          <Badge variant="outline">전투 일정 미정</Badge>
        )}
        {!chapter && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <CalendarClock size={15} />
            현재 날짜에 진행 중인 챕터가 없어 전투 정보를 표시할 수 없습니다.
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-center text-sm text-muted">전투 정보를 불러오는 중입니다.</p>
      ) : !chapter ? (
        <EmptyState>진행 중인 챕터가 없습니다.</EmptyState>
      ) : !chapter.is_battle_open ? (
        <div className="rounded-xl border border-dashed border-line bg-inset/40 px-6 py-10 text-center text-lg font-semibold text-muted">
          적의 동향을 살피는 중입니다...
        </div>
      ) : enemies.length === 0 ? (
        <EmptyState>이 챕터에 등록된 에너미가 없습니다.</EmptyState>
      ) : (
        <div className="flex flex-wrap justify-center gap-8">
          {enemies.map((enemy) => (
            <div key={enemy.id} className="flex w-full flex-col items-center gap-2 sm:w-[45%]">
              <div className="relative flex aspect-4/5 w-full items-center justify-center">
                {enemy.image_url ? (
                  <Image
                    src={enemy.image_url}
                    alt={`${enemy.name} 이미지`}
                    fill
                    sizes="(min-width: 640px) 45vw, 90vw"
                    unoptimized
                    className="object-contain"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted">
                    <ImageIcon size={28} />
                  </div>
                )}
              </div>
              <p className="text-center text-base font-semibold text-ivory">{enemy.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
