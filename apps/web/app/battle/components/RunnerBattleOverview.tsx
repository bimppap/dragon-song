"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CalendarClock, Image as ImageIcon } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { useToast } from "@/components/common/ToastProvider";
import { Badge } from "@/components/ui/badge";
import { fetchActiveChapter, fetchEnemies, fetchLiveBattle, type BattleSession, type Chapter, type Enemy } from "@/lib/api";
import BattleArena from "./BattleArena";

// 웹소켓 없이 폴링으로 진행 상황을 갱신한다. 너무 잦으면 서버 부담, 너무 길면 갱신이 굼떠 보이므로 절충한다.
const LIVE_BATTLE_POLL_MS = 6000;

export default function RunnerBattleOverview() {
  const { toast } = useToast();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveSession, setLiveSession] = useState<BattleSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [activeChapter, visibleEnemies] = await Promise.all([
          fetchActiveChapter(),
          fetchEnemies(),
        ]);
        if (cancelled) return;
        setChapter(activeChapter);
        setEnemies(visibleEnemies);
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : "전투 정보를 불러오지 못했습니다.", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [toast]);

  // 관리자가 실전 전투를 시작했는지 주기적으로 확인해, 있으면 관전 화면으로 전환한다.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const live = await fetchLiveBattle();
        if (!cancelled) setLiveSession(live);
      } catch {
        if (!cancelled) setLiveSession(null);
      }
    }

    poll();
    const interval = setInterval(poll, LIVE_BATTLE_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (liveSession != null) {
    return (
      <BattleArena
        sessionId={liveSession.id}
        externalSession={liveSession}
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
          <Badge variant={chapter.is_battle_day ? "success" : "outline"} className="font-num">
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
      ) : !chapter.is_battle_day ? (
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
