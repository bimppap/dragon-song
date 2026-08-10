"use client";

import { useEffect, useState } from "react";
import { List, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRequireMember } from "@/lib/auth";
import CharacterList from "./components/character/CharacterList";
import CharacterInfo from "./components/character/CharacterInfo";
import CharacterCreate from "./components/character/CharacterCreate";
import { fetchCharacters, fetchMyCharacter } from "@/lib/api";
import type { Character } from "@/lib/api";

type Tab = "list" | "info" | "create";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "list",   label: "캐릭터 목록", icon: List },
  { id: "info",   label: "캐릭터 정보", icon: User },
  { id: "create", label: "캐릭터 생성", icon: UserPlus },
];

function AdminCharacterConsole() {
  const [tab, setTab] = useState<Tab>("list");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loadingCharacters, setLoadingCharacters] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [focusCharacterId, setFocusCharacterId] = useState<number | null>(null);

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

  function handleSelectCharacter(character: Character) {
    setFocusCharacterId(character.id);
    setTab("info");
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
        {TABS.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant="ghost"
            onClick={() => setTab(id)}
            className={cn(
              "gap-2 rounded-none border-b-2 -mb-px h-11 px-5 font-semibold",
              tab === id
                ? "border-indigo-600 text-indigo-600 bg-transparent hover:bg-transparent hover:text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-transparent",
            )}
          >
            <Icon size={15} />
            {label}
          </Button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      <div>
        {tab === "list" && (
          <CharacterList
            characters={characters}
            loading={loadingCharacters}
            onSelectCharacter={handleSelectCharacter}
          />
        )}
        {tab === "info" && (
          <CharacterInfo
            key={focusCharacterId ?? "info"}
            characters={characters}
            loading={loadingCharacters}
            focusCharacterId={focusCharacterId}
          />
        )}
        {tab === "create" && <CharacterCreate onCreated={handleCreated} />}
      </div>
    </main>
  );
}

function MyCharacterConsole() {
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchMyCharacter()
      .then((detail) => {
        if (cancelled) return;
        setCharacter(detail);
        setErrorMessage(null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(error);
        setErrorMessage(error instanceof Error ? error.message : "캐릭터 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMessage}
        </div>
      )}
      <CharacterInfo
        characters={character ? [character] : []}
        loading={loading}
        showSelector={false}
        showId={false}
      />
    </main>
  );
}

export default function CharacterPage() {
  const member = useRequireMember();

  if (!member) return null;

  return member.role === "ADMIN" ? <AdminCharacterConsole /> : <MyCharacterConsole />;
}
