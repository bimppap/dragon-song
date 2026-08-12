"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, Settings, ShoppingBag, Swords, Users } from "lucide-react";
import { fetchChapters, type Chapter } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import HomeFlamefall from "@/components/common/HomeFlamefall";
import HomeChapterCalendar from "@/components/common/HomeChapterCalendar";

const SHORTCUTS = [
  { href: "/character", label: "캐릭터", icon: Users },
  { href: "/shop", label: "상점", icon: ShoppingBag },
  { href: "/battle", label: "전투", icon: Swords },
];
export default function HomePage() {
  const { member } = useAuth();
  const [chapters, setChapters] = useState<Chapter[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchChapters().then((data) => { if (!cancelled) setChapters(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const activeChapter = chapters.find((chapter) => chapter.is_active);
  const quickLinks = member?.role === "ADMIN"
    ? [...SHORTCUTS, { href: "/admin", label: "관리", icon: Settings }]
    : SHORTCUTS;
  const calendarMonth = activeChapter ? new Date(`${activeChapter.start_date}T00:00:00`) : new Date();

  return (
    <main className="home-adventure-bg relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center gap-10 px-4 py-8 sm:px-6 sm:py-12">
      <HomeFlamefall />
      <div aria-hidden className="home-dragon-watermark home-dragon-watermark-left" />
      <img aria-hidden src="/dragon-dots-moss.png" alt="" className="home-dragon-watermark home-dragon-watermark-right" />
      <img src="/dragonsong_title.png" alt="Dragon Song" className="-mb-8 mx-auto w-full max-w-4xl select-none object-contain" />

      <section className="grid w-full gap-4 lg:h-[28rem] lg:grid-cols-[minmax(0,1.7fr)_minmax(240px,1fr)] lg:items-stretch">
        <div className="order-1 flex min-h-[18rem] flex-col gap-0.5 overflow-hidden lg:h-full lg:min-h-0">
          <nav aria-label="빠른 메뉴" className="flex shrink-0 items-center justify-center gap-14 pb-0.5 sm:gap-20">
            {quickLinks.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="flex flex-col items-center justify-center gap-1 text-xs font-semibold text-ivory transition-colors hover:text-gold">
                <Icon size={25} className="text-gold" />
                {label}
              </Link>
            ))}
          </nav>
          <div className="group relative min-h-0 flex-1">
            <img src="/map.png" alt="Dragon Song 지도" className="absolute inset-0 size-full object-contain" />
            <img src="/map2.png" alt="" aria-hidden="true" className="absolute inset-0 size-full object-contain opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
          </div>
        </div>

        <div className="order-2 flex min-h-[18rem] flex-col gap-2 lg:min-h-0 lg:translate-y-14">
          <section className="pixel-frame relative w-full shrink-0 bg-surface/75 p-1.5">
            <span aria-hidden className="absolute left-1 top-1 size-1 bg-gold" />
            <span aria-hidden className="absolute bottom-1 right-1 size-1 bg-gold" />
            <div className="mb-0.5 flex items-center gap-1 px-1 text-gold">
              <CalendarDays size={11} />
              <h1 className="font-pixel-sm text-[10px] tracking-[0.14em]">SCHEDULE</h1>
            </div>
            <HomeChapterCalendar chapters={chapters} initialMonth={calendarMonth} />
          </section>

          <div className="flex min-h-0 flex-[2] items-center justify-center">
            <img
              src={activeChapter?.image_url ?? "/title_0.png"}
              alt={activeChapter ? `${activeChapter.name} 챕터 이미지` : "진행 중인 챕터 없음"}
              className="block max-h-full w-full object-contain"
            />
          </div>
        </div>
      </section>

    </main>
  );
}
