"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { House, LogIn, LogOut, Menu, Settings, Sparkles, Store, Swords, Trophy, Users, X } from "lucide-react";
import { useState } from "react";
import type { MemberRole } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ChapterMusicBar from "@/components/common/ChapterMusicBar";

const NAV_ITEMS: { href: string; label: string; icon: React.ElementType; roles: MemberRole[] }[] = [
  { href: "/", label: "홈", icon: House, roles: ["RUNNER", "ADMIN"] },
  { href: "/character", label: "캐릭터", icon: Users, roles: ["RUNNER", "ADMIN"] },
  { href: "/shop", label: "상점", icon: Store, roles: ["RUNNER", "ADMIN"] },
  { href: "/challenges", label: "도전", icon: Trophy, roles: ["RUNNER"] },
  { href: "/missions", label: "임무", icon: Sparkles, roles: ["RUNNER"] },
  { href: "/battle", label: "전투", icon: Swords, roles: ["ADMIN"] },
  { href: "/battle", label: "기술", icon: Sparkles, roles: ["RUNNER"] },
  { href: "/admin", label: "관리", icon: Settings, roles: ["ADMIN"] },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { member, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  if (pathname === "/login" || pathname === "/signup") return null;

  const navItems = member ? NAV_ITEMS.filter((item) => item.roles.includes(member.role) && item.href !== pathname) : [];
  function signOut() { logout(); router.replace("/login"); }

  return <>
    <div className="fixed left-5 top-5 z-50 flex items-start gap-3">
      {pathname !== "/" && <Link href="/" className="block shrink-0" aria-label="홈으로 이동">
        <img src="/light.png" alt="Dragon Song 홈" className="h-9 w-auto object-contain" />
      </Link>}
      <ChapterMusicBar />
    </div>

    <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
      {pathname !== "/" && member && <div className="relative">
        <button type="button" onClick={() => setMenuOpen((open) => !open)} className="flex size-8 items-center justify-center rounded-full border-2 border-gold/70 bg-surface text-gold shadow-lg transition-transform hover:scale-105" aria-label="메뉴" aria-expanded={menuOpen}>
          {menuOpen ? <X size={14} /> : <Menu size={14} />}
        </button>
        {menuOpen && <nav aria-label="메뉴" className="absolute right-0 top-10 flex flex-col items-center gap-2">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={`${href}-${label}`} href={href} title={label} onClick={() => setMenuOpen(false)} className="flex size-10 flex-col items-center justify-center rounded-full border border-line bg-surface text-[8px] font-semibold text-ivory shadow-lg transition-colors hover:border-gold hover:text-gold"><Icon size={14} /><span>{label}</span></Link>
          ))}
        </nav>}
      </div>}
      {member ? <>
        <span className="rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs font-semibold text-ivory">{member.login_id}</span>
        <span className="rounded-full border border-gold/50 bg-gold/10 px-2 py-1.5 text-[10px] font-semibold text-gold">{member.role}</span>
        <button type="button" onClick={signOut} className="rounded-full border border-line bg-surface/95 p-2 text-muted transition-colors hover:text-ivory" aria-label="로그아웃"><LogOut size={15} /></button>
      </> : <Link href="/login" className="rounded-full border border-line bg-surface/95 p-2 text-ivory" aria-label="로그인"><LogIn size={16} /></Link>}
    </div>

  </>;
}
