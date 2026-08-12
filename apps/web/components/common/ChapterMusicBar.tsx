"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { fetchActiveChapter, type Chapter } from "@/lib/api";

const VISUALIZER_HEIGHTS = [3, 6, 4, 8, 5, 7, 3, 6, 4];

/** 활성 챕터의 음악을 재생하는 비카드형 픽셀 뮤직바. */
export default function ChapterMusicBar() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchActiveChapter()
      .then((activeChapter) => { if (!cancelled) setChapter(activeChapter); })
      .catch(() => { if (!cancelled) setChapter(null); });
    return () => { cancelled = true; };
  }, []);

  if (!chapter?.music_url) return null;

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try { await audio.play(); setPlaying(true); } catch { setPlaying(false); }
    } else {
      audio.pause(); setPlaying(false);
    }
  }

  return <div className="flex min-w-0 items-start gap-2 text-ivory">
    <audio ref={audioRef} src={chapter.music_url} loop preload="metadata" onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
    <button type="button" onClick={togglePlayback} className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-gold/60 text-gold transition-colors hover:bg-gold/10" aria-label={playing ? "음악 정지" : "음악 재생"}>
      {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
    </button>
    <div className="flex h-8 shrink-0 items-start gap-0.5" aria-hidden>
      {VISUALIZER_HEIGHTS.map((height, index) => <span key={index} className="flex w-1 flex-col gap-px" style={{ animationDelay: `${index * -90}ms` }}>
        {Array.from({ length: height }, (_, dot) => <i key={dot} className={`block h-0.5 w-1 bg-gold/80 ${playing ? "music-dot-playing" : ""}`} style={{ animationDelay: `${(index + dot) * -70}ms` }} />)}
      </span>)}
    </div>
    <span className="max-w-44 truncate pt-1 text-[10px] font-semibold text-muted">{chapter.name}</span>
  </div>;
}
