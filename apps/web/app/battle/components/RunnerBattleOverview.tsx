"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, CalendarClock, Image as ImageIcon, Play } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { useToast } from "@/components/common/ToastProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchActiveChapter, fetchEnemies, fetchFinishedRealBattles, fetchLiveBattle,
  type BattleSession, type BattleSessionSummary, type Chapter, type Enemy,
} from "@/lib/api";
import { useBattleSocket, type BattleDraftPreview } from "@/lib/useBattleSocket";
import BattleArena from "./BattleArena";
import BattleTurnReplay from "./BattleTurnReplay";

/** 지난 전투 한 줄의 이름: "챕터1 : 적이름a, 적이름b". */
function pastBattleName(battle: BattleSessionSummary): string {
  return `${battle.chapter ?? "챕터 미지정"} : ${battle.enemy_names.join(", ") || "에너미 없음"}`;
}

/** 지금까지 진행한 실전 전투를 드롭다운으로 펼쳐, 골라서 턴 단위로 되짚어본다. */
function PastBattlesMenu({ battles, onSelect }: {
  battles: BattleSessionSummary[];
  onSelect: (sessionId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (battles.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1 text-sm text-muted transition-colors hover:text-gold"
        onClick={() => setOpen((current) => !current)}
      >
        과거 전투 돌아보기
        <ArrowRight size={14} />
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 z-20 mt-2 max-h-80 w-max min-w-64 max-w-[min(90vw,28rem)] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg"
        >
          {battles.map((battle) => (
            <li key={battle.id} role="none" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-inset">
              <span className="min-w-0 flex-1 truncate text-sm text-ivory">{pastBattleName(battle)}</span>
              <Button
                type="button"
                role="menuitem"
                variant="ghost"
                size="sm"
                className="size-7 shrink-0 p-0 text-gold"
                aria-label={`${pastBattleName(battle)} 턴 되짚어보기`}
                onClick={() => { setOpen(false); onSelect(battle.id); }}
              >
                <Play size={14} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  // 과거 전투 돌아보기: 완료된 실전 전투를 턴 단위로 되짚어본다.
  const [pastBattles, setPastBattles] = useState<BattleSessionSummary[]>([]);
  const [replaySessionId, setReplaySessionId] = useState<number | null>(null);

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

  const keepFinishedResult = useEffectEvent(() => liveSession != null && liveSession.status !== "in_progress");

  // 관리자가 실전 전투를 시작했는지 주기적으로 확인해, 있으면 관전 화면으로 전환한다.
  useEffect(() => {
    // 소켓이 살아 있는 동안에는 같은 전투 상태를 REST로 중복 확인하지 않는다.
    if (battleSocketConnected && liveSession?.status === "in_progress") return;
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
          // 다음 전투가 없으면 종료 결과 화면을 유지하면서 탐색만 계속한다.
          if (live === null && keepFinishedResult()) return;
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
  }, [battleSocketConnected, liveSession?.status]);

  // 지난 전투 목록은 자주 바뀌지 않으므로 화면에 들어올 때 한 번만 읽는다.
  useEffect(() => {
    let cancelled = false;
    fetchFinishedRealBattles()
      .then((battles) => { if (!cancelled) setPastBattles(battles); })
      // 목록을 못 읽어도 전투 화면 자체는 보여준다. 대신 조용히 사라지지 않게 콘솔에는 남긴다.
      .catch((error) => { if (!cancelled) console.error("지난 전투 목록 조회 실패", error); });
    return () => { cancelled = true; };
  }, []);


  if (replaySessionId != null) {
    return <BattleTurnReplay sessionId={replaySessionId} onExit={() => setReplaySessionId(null)} />;
  }

  if (liveSession != null) {
    return (
      <BattleArena
        sessionId={liveSession.id}
        externalSession={liveSession}
        draftPreview={draftPreview}
        readOnly
        onExit={() => {
          setLiveSession(null);
          liveVersionRef.current = null;
          setDraftPreview(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 지난 실전 전투 되짚어보기. 실전 전투가 진행 중이면 관전 화면으로 넘어가 이 줄 자체가 보이지 않는다. */}
      <div className="flex justify-end">
        <PastBattlesMenu battles={pastBattles} onSelect={setReplaySessionId} />
      </div>

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
