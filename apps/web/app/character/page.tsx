"use client";

import { useEffect, useState } from "react";
import { List, User, UserPlus } from "lucide-react";
import { useRequireMember } from "@/lib/auth";
import CharacterList from "../components/character/CharacterList";
import CharacterInfo from "../components/character/CharacterInfo";
import CharacterCreate from "../components/character/CharacterCreate";
import { fetchCharacters, fetchMyCharacter, type Character } from "@/lib/api";
import AlertBanner from "@/components/common/AlertBanner";
import PageContainer from "@/components/common/PageContainer";
import TabBar from "@/components/common/TabBar";

type Tab = "list" | "info" | "create";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "list", label: "캐릭터 목록", icon: List },
  { id: "info", label: "캐릭터 정보", icon: User },
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
    fetchCharacters().then((list) => {
      if (!cancelled) setCharacters(list);
    }).catch((error) => {
      if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "캐릭터 목록을 불러오지 못했습니다.");
    }).finally(() => {
      if (!cancelled) setLoadingCharacters(false);
    });
    return () => { cancelled = true; };
  }, []);

  return <PageContainer max="4xl" className="space-y-8">
    {errorMessage && <AlertBanner>{errorMessage}</AlertBanner>}
    <TabBar tabs={TABS} active={tab} onChange={setTab} />
    {tab === "list" && <CharacterList characters={characters} loading={loadingCharacters} onSelectCharacter={(character) => { setFocusCharacterId(character.id); setTab("info"); }} />}
    {tab === "info" && <CharacterInfo key={focusCharacterId ?? "info"} characters={characters} loading={loadingCharacters} focusCharacterId={focusCharacterId} />}
    {tab === "create" && <CharacterCreate onCreated={(character) => { setCharacters((prev) => [...prev, character].toSorted((a, b) => a.id - b.id)); setTab("list"); }} />}
  </PageContainer>;
}

function MyCharacterConsole() {
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyCharacter().then((detail) => {
      if (!cancelled) setCharacter(detail);
    }).catch((error) => {
      if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "캐릭터 정보를 불러오지 못했습니다.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return <PageContainer max="4xl" className="space-y-8">
    {errorMessage && <AlertBanner>{errorMessage}</AlertBanner>}
    <CharacterInfo characters={character ? [character] : []} loading={loading} showSelector={false} showId={false} />
  </PageContainer>;
}

export default function CharacterPage() {
  const member = useRequireMember();
  if (!member) return null;
  return member.role === "ADMIN" ? <AdminCharacterConsole /> : <MyCharacterConsole />;
}
