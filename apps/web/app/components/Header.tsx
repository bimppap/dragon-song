"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Store, CalendarCheck, Swords, Trophy, ScrollText, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { fetchActiveChapter, type Chapter } from "@/lib/api";

const NAV_ITEMS: { href: string; label: string; icon: React.ElementType; wip?: boolean }[] = [
  { href: "/", label: "캐릭터", icon: Users },
  { href: "/shop", label: "아이템", icon: Store },
  { href: "/attendance", label: "출석부", icon: CalendarCheck },
  { href: "/challenges", label: "도전과제", icon: Trophy },
  { href: "/missions", label: "임무", icon: ScrollText },
  { href: "/battle", label: "전투", icon: Swords },
  { href: "/admin", label: "관리", icon: Settings },
];

export default function Header() {
  const pathname = usePathname();
  const [activeChapter, setActiveChapter] = useState<Chapter | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchActiveChapter()
      .then((chapter) => { if (!cancelled) setActiveChapter(chapter); })
      .catch(() => { if (!cancelled) setActiveChapter(null); });
    return () => { cancelled = true; };
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
        <div className="flex items-center gap-3 whitespace-nowrap">
          <span className="text-sm font-bold text-indigo-600 tracking-tight select-none">
            🐉 Dragon Song
          </span>
          {activeChapter !== undefined && (
            <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              {activeChapter ? activeChapter.name : "준비 중..."}
            </span>
          )}
        </div>

        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon, wip }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={wip ? "#" : href}
                aria-disabled={wip}
                tabIndex={wip ? -1 : undefined}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                  active
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  wip && "opacity-40 pointer-events-none",
                )}
              >
                <Icon size={15} strokeWidth={active ? 2.5 : 2} />
                {label}
                {wip && (
                  <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-semibold">
                    준비중
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
