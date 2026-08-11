"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Users, Store, CalendarCheck, Swords, Sparkles, Trophy, ScrollText, Settings, LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { fetchActiveChapter, type Chapter } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import type { MemberRole } from "@/lib/api";

const NAV_ITEMS: { href: string; label: string; icon: React.ElementType; roles: MemberRole[] }[] = [
  { href: "/", label: "캐릭터", icon: Users, roles: ["RUNNER", "ADMIN"] },
  { href: "/shop", label: "아이템", icon: Store, roles: ["RUNNER", "ADMIN"] },
  { href: "/challenges", label: "도전과제", icon: Trophy, roles: ["RUNNER", "ADMIN"] },
  { href: "/missions", label: "임무", icon: ScrollText, roles: ["RUNNER", "ADMIN"] },
  { href: "/attendance", label: "출석부", icon: CalendarCheck, roles: ["ADMIN"] },
  { href: "/battle", label: "전투", icon: Swords, roles: ["ADMIN"] },
  { href: "/battle", label: "기술", icon: Sparkles, roles: ["RUNNER"] },
  { href: "/admin", label: "관리", icon: Settings, roles: ["ADMIN"] },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { member, logout } = useAuth();
  const [activeChapter, setActiveChapter] = useState<Chapter | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchActiveChapter()
      .then((chapter) => { if (!cancelled) setActiveChapter(chapter); })
      .catch(() => { if (!cancelled) setActiveChapter(null); });
    return () => { cancelled = true; };
  }, []);

  const navItems = member ? NAV_ITEMS.filter((item) => item.roles.includes(member.role)) : [];

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
        <div className="flex items-center gap-3 whitespace-nowrap">
          <span className="text-xs font-bold text-indigo-600 tracking-tight select-none">
            🐉 Dragon Song
          </span>
          {activeChapter !== undefined && (
            <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              {activeChapter ? activeChapter.name : "준비 중..."}
            </span>
          )}
        </div>

        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap",
                  active
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Icon size={15} strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3 whitespace-nowrap">
          {member ? (
            <>
              <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                {member.login_id}
                <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                  {member.role}
                </span>
              </span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut size={13} />
                로그아웃
              </Button>
            </>
          ) : (
            <Link href="/login">
              <Button variant="outline" size="sm">
                <LogIn size={13} />
                로그인
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
