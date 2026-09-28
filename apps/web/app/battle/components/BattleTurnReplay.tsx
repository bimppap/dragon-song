"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/common/ToastProvider";
import {
  fetchBattle,
  fetchBattleReplay,
  type BattleReplay,
  type BattleReplayTurn,
  type BattleSession,
} from "@/lib/api";
import type { BattleDraftPreview } from "@/lib/useBattleSocket";
import BattleArena, { PHASE_LABEL } from "./BattleArena";

/** 되짚어보기 한 칸의 이름표(예: "3라운드 · 아군 턴"). */
function turnLabel(turn: BattleReplayTurn): string {
  return `${turn.round}라운드 · ${turn.phase ? PHASE_LABEL[turn.phase] : "진행"}`;
}

/**
 * 완료된 실전 전투를 턴 단위로 되짚어보는 화면.
 *
 * 각 턴이 끝난 시점의 판과 그 턴까지의 로그를 세션 하나로 합쳐, 러너뷰(행동 + 전투 로그)를
 * 읽기 전용으로 그대로 다시 그린다.
 */
export default function BattleTurnReplay({ sessionId, onExit }: { sessionId: number; onExit: () => void }) {
  const { toast } = useToast();
  const [session, setSession] = useState<BattleSession | null>(null);
  const [replay, setReplay] = useState<BattleReplay | null>(null);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [loadedSession, loadedReplay] = await Promise.all([
          fetchBattle(sessionId),
          fetchBattleReplay(sessionId),
        ]);
        if (cancelled) return;
        setSession(loadedSession);
        setReplay(loadedReplay);
        setIndex(0);
      } catch (e) {
        if (cancelled) return;
        setFailed(true);
        toast(e instanceof Error ? e.message : "전투 진행 기록을 불러오지 못했습니다.", "error");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [sessionId, toast]);

  const turn = replay?.turns[index];

  if (failed) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="px-2" onClick={onExit}>
          <ArrowLeft size={15} />
          돌아가기
        </Button>
        <p className="text-sm text-muted">전투 진행 기록을 불러오지 못했습니다.</p>
      </div>
    );
  }

  if (!session || !replay || !turn) {
    return <p className="text-sm text-muted">전투 진행 기록을 불러오는 중입니다.</p>;
  }

  const lastIndex = replay.turns.length - 1;
  // 마지막 턴에서만 실제 전투 결과(승리/패배)를 보여주고, 그 전에는 진행 중으로 그린다.
  const replaySession: BattleSession = {
    ...session,
    round: turn.round,
    phase: turn.phase ?? session.phase,
    status: index === lastIndex ? session.status : "in_progress",
    participants: turn.participants,
    enemies: turn.enemies,
    summons: turn.summons,
    pending_enemy_actions: turn.pending_enemy_actions,
    log: replay.turns.slice(0, index + 1).map((entry) => ({
      round: entry.round,
      phase: entry.phase ?? undefined,
      kind: entry.kind ?? undefined,
      events: entry.events,
      calculations: entry.calculations,
    })) as BattleSession["log"],
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gold/40 bg-gold/5 p-3">
        <Button variant="ghost" size="sm" className="px-2" onClick={onExit} aria-label="되짚어보기 닫기">
          <ArrowLeft size={15} />
        </Button>
        <span className="text-sm font-semibold text-ivory">턴 되짚어보기</span>
        <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>
          <ChevronLeft size={14} />
          이전 턴
        </Button>
        <span className="font-num text-sm text-gold">
          {turnLabel(turn)}
          <span className="ml-1.5 text-xs text-muted">{index + 1}/{replay.turns.length}</span>
        </span>
        <Button variant="outline" size="sm" disabled={index === lastIndex} onClick={() => setIndex((current) => Math.min(lastIndex, current + 1))}>
          다음 턴
          <ChevronRight size={14} />
        </Button>
        <input
          type="range"
          aria-label="되짚어볼 턴"
          min={0}
          max={lastIndex}
          value={index}
          onChange={(event) => setIndex(Number(event.target.value))}
          className="ml-auto w-40 max-w-full accent-gold"
        />
      </div>
      <BattleArena
        key={`replay-${index}`}
        sessionId={session.id}
        externalSession={replaySession}
        // 아군 턴이면 그때 고른 행동을 그대로 넘겨, 기술·아이템 아이콘과 카드 색·북마크를 다시 그린다.
        draftPreview={turn.phase === "ally" ? (turn.action_preview as BattleDraftPreview) : null}
        readOnly
        hideReadOnlyNotice
        replayMode
        runnerPreview
        onExit={onExit}
      />
    </div>
  );
}
