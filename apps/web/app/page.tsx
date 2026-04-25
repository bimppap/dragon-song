"use client";

import { useEffect, useState } from "react";
import { List, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import CharacterList from "./components/character/CharacterList";
import CharacterInfo from "./components/character/CharacterInfo";
import CharacterCreate from "./components/character/CharacterCreate";
import { fetchCharacters } from "@/lib/api";
import type { Character } from "@/lib/api";

type Tab = "list" | "info" | "create";

const TABS: { id: Tab; label: string; icon: React.ElementType; wip?: boolean }[] = [
  { id: "list",   label: "캐릭터 목록", icon: List },
  { id: "info",   label: "캐릭터 정보", icon: User },
  { id: "create", label: "캐릭터 생성", icon: UserPlus },
];

export default function CharacterPage() {
  const [tab, setTab] = useState<Tab>("list");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loadingCharacters, setLoadingCharacters] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCharacters() {
      try {
        setLoadingCharacters(true);
        const list = await fetchCharacters();

        if (cancelled) return;

        setCharacters(list);
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setErrorMessage(
          error instanceof Error ? error.message : "캐릭터 목록을 불러오지 못했습니다.",
        );
      } finally {
        if (!cancelled) {
          setLoadingCharacters(false);
        }
      }
    }

    loadCharacters();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleCreated(character: Character) {
    setCharacters((prev) => [...prev, character].toSorted((a, b) => a.id - b.id));
    setErrorMessage(null);
    setTab("list");
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMessage}
        </div>
      )}

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
        {tab === "list" && <CharacterList characters={characters} loading={loadingCharacters} />}
        {tab === "info" && (
          <CharacterInfo characters={characters} loading={loadingCharacters} />
        )}
        {tab === "create" && <CharacterCreate onCreated={handleCreated} />}
      </div>
    </main>
  );
}
