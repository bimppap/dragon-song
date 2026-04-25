"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Store, CalendarCheck, Swords } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "캐릭터", icon: Users },
  { href: "/shop", label: "상점", icon: Store },
  { href: "/attendance", label: "출석부", icon: CalendarCheck, wip: true },
  { href: "/battle", label: "전투", icon: Swords, wip: true },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
        <span className="text-sm font-bold text-indigo-600 tracking-tight select-none whitespace-nowrap">
          🐉 Dragon Song
        </span>

        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon, wip }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={wip ? "#" : href}
                aria-disabled={wip}
                tabIndex={wip ? -1 : undefined}
                className={[
                  "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-colors",
                  active
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  wip ? "opacity-40 pointer-events-none" : "",
                ].join(" ")}
              >
                <Icon size={15} strokeWidth={active ? 2.5 : 2} />
                {label}
                {wip && (
                  <span className="text-[10px] bg-slate-100 text-slate-400 font-semibold px-1.5 py-0.5 rounded">
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
