"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Users, Store, Swords, Sparkles, Trophy, ScrollText, Settings, LogIn, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { fetchActiveChapter, type Chapter } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import type { MemberRole } from "@/lib/api";

const NAV_ITEMS: { href: string; label: string; icon: React.ElementType; roles: MemberRole[] }[] = [
  { href: "/", label: "캐릭터", icon: Users, roles: ["RUNNER", "ADMIN"] },
  { href: "/shop", label: "아이템", icon: Store, roles: ["RUNNER", "ADMIN"] },
  { href: "/challenges", label: "도전과제", icon: Trophy, roles: ["RUNNER"] },
  { href: "/missions", label: "임무", icon: ScrollText, roles: ["RUNNER"] },
  { href: "/battle", label: "전투", icon: Swords, roles: ["ADMIN"] },
  { href: "/battle", label: "기술", icon: Sparkles, roles: ["RUNNER"] },
  { href: "/admin", label: "관리", icon: Settings, roles: ["ADMIN"] },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { member, logout } = useAuth();
  const [activeChapter, setActiveChapter] = useState<Chapter | null | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchActiveChapter()
      .then((chapter) => { if (!cancelled) setActiveChapter(chapter); })
      .catch(() => { if (!cancelled) setActiveChapter(null); });
    return () => { cancelled = true; };
  }, []);

  const navItems = member ? NAV_ITEMS.filter((item) => item.roles.includes(member.role)) : [];

  function handleLogout() {
    setMenuOpen(false);
    logout();
    router.replace("/login");
  }

  function isActive(href: string) {
    return pathname === href || (href !== "/" && pathname.startsWith(href));
  }

  // 로그인/회원가입 등 진입 화면에서는 헤더를 숨긴다.
  if (pathname === "/login" || pathname === "/signup") return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-line bg-base shadow-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
        {/* 로고 */}
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="select-none text-xs font-bold tracking-tight text-gold">🐉 Dragon Song</span>
          {activeChapter !== undefined && (
            <span className="hidden rounded-full border border-gold bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-gold sm:inline">
              {activeChapter ? activeChapter.name : "준비 중..."}
            </span>
          )}
        </div>

        {/* 데스크톱 중앙 네비 */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors",
                isActive(href) ? "bg-primary-light text-ivory" : "text-ivory/85 hover:bg-primary-light/20 hover:text-ivory",
              )}
            >
              <Icon size={15} strokeWidth={isActive(href) ? 2.5 : 2} />
              {label}
            </Link>
          ))}
        </nav>

        {/* 데스크톱 우측 사용자 */}
        <div className="ml-auto hidden items-center gap-2 whitespace-nowrap md:flex">
          {member ? (
            <>
              <span className="text-[11px] font-semibold text-muted">
                {member.login_id}
                <span className="ml-1.5 rounded-full bg-primary-light/20 px-2 py-0.5 text-[10px] text-muted">{member.role}</span>
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

        {/* 모바일 테마 토글 + 햄버거 */}
        <div className="ml-auto flex items-center gap-1 md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-lg p-2 text-ivory/85 transition-colors hover:bg-primary-light/20"
            aria-label="메뉴"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* 모바일 드롭다운 메뉴 */}
      {menuOpen && (
        <div className="border-t border-line bg-surface px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                  isActive(href) ? "bg-primary-light text-ivory" : "text-ivory/85 hover:bg-primary-light/20 hover:text-ivory",
                )}
              >
                <Icon size={16} strokeWidth={isActive(href) ? 2.5 : 2} />
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            {member ? (
              <>
                <span className="text-xs font-semibold text-muted">
                  {member.login_id}
                  <span className="ml-1.5 rounded-full bg-primary-light/20 px-2 py-0.5 text-[10px] text-muted">{member.role}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut size={13} />
                  로그아웃
                </Button>
              </>
            ) : (
              <Link href="/login" onClick={() => setMenuOpen(false)} className="w-full">
                <Button variant="outline" size="sm" className="w-full">
                  <LogIn size={13} />
                  로그인
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
