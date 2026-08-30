"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarCheck, Coins, House, LogIn, LogOut, Settings, Sparkles, Store, Swords, Trophy, Users, UserStar, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchMyCharacter, type MemberRole } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import ChapterMusicBar from "@/components/common/ChapterMusicBar";

const NAV_ITEMS: { href: string; label: string; icon: React.ElementType; roles: MemberRole[] }[] = [
  { href: "/", label: "홈", icon: House, roles: ["RUNNER", "ADMIN", "STAFF"] },
  { href: "/character", label: "캐릭터", icon: Users, roles: ["RUNNER", "ADMIN", "STAFF"] },
  { href: "/shop", label: "상점", icon: Store, roles: ["RUNNER", "ADMIN", "STAFF"] },
  { href: "/challenges", label: "도전", icon: Trophy, roles: ["RUNNER", "STAFF"] },
  { href: "/missions", label: "임무", icon: Sparkles, roles: ["RUNNER", "STAFF"] },
  { href: "/battle", label: "전투", icon: Swords, roles: ["RUNNER", "ADMIN", "STAFF"] },
  { href: "/attendance", label: "출석", icon: CalendarCheck, roles: ["RUNNER", "STAFF"] },
  { href: "/settlement", label: "정산", icon: Coins, roles: ["RUNNER", "ADMIN", "STAFF"] },
  { href: "/admin", label: "관리", icon: Settings, roles: ["ADMIN", "STAFF"] },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { member, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [character, setCharacter] = useState<{ name: string; image_url: string | null } | null>(null);

  const isAdmin = member?.role === "ADMIN";
  const isStaff = member?.role === "STAFF";
  const characterId = member?.role === "RUNNER" || member?.role === "STAFF" ? member.character_id : null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (characterId == null) {
        setCharacter(null);
        return;
      }
      try {
        const detail = await fetchMyCharacter();
        if (!cancelled) setCharacter({ name: detail.name, image_url: detail.image_url });
      } catch {
        if (!cancelled) setCharacter(null);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [characterId]);

  if (pathname === "/login" || pathname === "/signup") return null;

  const navItems = member ? NAV_ITEMS.filter((item) => item.roles.includes(member.role)) : [];
  const displayName = isAdmin ? "관리자" : character?.name ?? member?.login_id ?? "";

  function signOut() {
    setMenuOpen(false);
    logout();
    router.replace("/login");
  }

  return <>
    <div className="fixed left-5 top-5 z-50 flex items-start gap-3">
      {pathname !== "/" && <Link href="/" className="block shrink-0" aria-label="홈으로 이동">
        <Image src="/light.png" alt="Dragon Song 홈" width={200} height={200} className="h-9 w-auto object-contain" />
      </Link>}
      <ChapterMusicBar />
    </div>

    <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
      {member ? <div className="relative flex items-center gap-2">
        {isStaff && (
          <span className="flex items-center gap-1 rounded-full border border-gold/50 bg-gold/10 px-2 py-1.5 text-xs font-semibold text-gold">
            <UserStar size={13} />
            스텝
          </span>
        )}
        <span className="rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs font-semibold text-ivory">{displayName}</span>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="block shrink-0 overflow-hidden rounded-full border-2 border-gold/70 shadow-lg transition-transform hover:scale-105"
          aria-label="메뉴 열기"
          aria-expanded={menuOpen}
        >
          {isAdmin ? (
            <span className="flex size-9 items-center justify-center bg-surface text-gold"><Wrench size={16} /></span>
          ) : (
            <CharacterAvatar src={character?.image_url ?? null} alt={displayName} className="size-9" iconSize={16} />
          )}
        </button>

        {menuOpen && <nav aria-label="메뉴" className="pixel-frame absolute right-0 top-12 flex w-36 flex-col bg-surface p-1.5 shadow-xl">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={`${href}-${label}`}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-ivory transition-colors hover:bg-primary-light/20 hover:text-gold"
            >
              <Icon size={14} className="text-gold" />
              {label}
            </Link>
          ))}
          <div className="mx-2 my-1 border-t border-line" />
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-muted transition-colors hover:bg-primary-light/20 hover:text-ivory"
          >
            <LogOut size={14} />
            로그아웃
          </button>
        </nav>}
      </div> : <Link href="/login" className="rounded-full border border-line bg-surface/95 p-2 text-ivory" aria-label="로그인"><LogIn size={16} /></Link>}
    </div>

  </>;
}
