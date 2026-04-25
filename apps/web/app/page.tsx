"use client";

import { useState, useCallback } from "react";
import { List, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import CharacterList from "./components/character/CharacterList";
import CharacterInfo from "./components/character/CharacterInfo";
import CharacterCreate from "./components/character/CharacterCreate";
import type { Character } from "@/lib/api";

type Tab = "list" | "info" | "create";

const TABS: { id: Tab; label: string; icon: React.ElementType; wip?: boolean }[] = [
  { id: "list",   label: "캐릭터 목록", icon: List },
  { id: "info",   label: "캐릭터 정보", icon: User, wip: true },
  { id: "create", label: "캐릭터 생성", icon: UserPlus },
];

export default function CharacterPage() {
  const [tab, setTab] = useState<Tab>("list");
  const [characters, setCharacters] = useState<Character[]>([]);

  const handleLoad = useCallback((list: Character[]) => {
    setCharacters(list);
  }, []);

  function handleCreated() {
    setTab("list");
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">

      {/* 탭 바 */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon, wip }) => (
          <Button
            key={id}
            variant="ghost"
            onClick={() => setTab(id)}
            className={cn(
              "gap-2 rounded-none border-b-2 -mb-px h-11 px-5 font-semibold",
              tab === id
                ? "border-indigo-600 text-indigo-600 bg-transparent hover:bg-transparent hover:text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-transparent",
              wip && "opacity-50"
            )}
          >
            <Icon size={15} />
            {label}
            {wip && (
              <span className="text-[10px] bg-slate-100 text-slate-400 font-semibold px-1.5 py-0.5 rounded ml-0.5">
                준비중
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      <div>
        {tab === "list" && (
          <CharacterList characters={characters} onLoad={handleLoad} />
        )}
        {tab === "info" && <CharacterInfo />}
        {tab === "create" && <CharacterCreate onCreated={handleCreated} />}
      </div>
    </main>
  );
}
