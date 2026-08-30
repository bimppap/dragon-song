"use client";

import { useEffect, useState } from "react";
import { List, User, UserPlus } from "lucide-react";
import { useRequireMember } from "@/lib/auth";
import CharacterList from "../components/character/CharacterList";
import CharacterCardGrid from "../components/character/CharacterCardGrid";
import CharacterInfo from "../components/character/CharacterInfo";
import CharacterCreate from "../components/character/CharacterCreate";
import { fetchCharacters, fetchMyCharacter, type Character, type CharacterDetail } from "@/lib/api";
import PageContainer from "@/components/common/PageContainer";
import TabBar from "@/components/common/TabBar";
import { useToast } from "@/components/common/ToastProvider";

type Tab = "list" | "info" | "create" | "edit";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "list", label: "캐릭터 목록", icon: List },
  { id: "info", label: "캐릭터 정보", icon: User },
  { id: "create", label: "캐릭터 생성", icon: UserPlus },
];

function AdminCharacterConsole() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("list");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loadingCharacters, setLoadingCharacters] = useState(true);
  const [focusCharacterId, setFocusCharacterId] = useState<number | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<CharacterDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCharacters().then((list) => {
      if (!cancelled) setCharacters(list);
    }).catch((error) => {
      if (!cancelled) toast(error instanceof Error ? error.message : "캐릭터 목록을 불러오지 못했습니다.", "error");
    }).finally(() => {
      if (!cancelled) setLoadingCharacters(false);
    });
    return () => { cancelled = true; };
  }, [toast]);

  return <PageContainer max="4xl" className="space-y-8">
    <TabBar tabs={TABS} active={tab} onChange={setTab} />
    {tab === "list" && <CharacterList characters={characters} loading={loadingCharacters} showAdminFlags onSelectCharacter={(character) => { setFocusCharacterId(character.id); setTab("info"); }} />}
    {tab === "info" && (
      <CharacterInfo
        key={focusCharacterId ?? "info"}
        characters={characters}
        loading={loadingCharacters}
        focusCharacterId={focusCharacterId}
        onDeleted={(characterId) => {
          setCharacters((prev) => prev.filter((c) => c.id !== characterId));
          setFocusCharacterId(null);
          setTab("list");
        }}
        onEdit={(character) => { setEditingCharacter(character); setTab("edit"); }}
      />
    )}
    {tab === "create" && <CharacterCreate onCreated={(character) => { setCharacters((prev) => [...prev, character].toSorted((a, b) => a.name.localeCompare(b.name, "ko"))); setTab("list"); }} />}
    {tab === "edit" && editingCharacter && (
      <CharacterCreate
        key={editingCharacter.id}
        character={editingCharacter}
        onSaved={(character) => {
          setCharacters((prev) => prev.map((c) => (c.id === character.id ? character : c)));
          setEditingCharacter(null);
          setTab("info");
        }}
        onCancel={() => { setEditingCharacter(null); setTab("info"); }}
      />
    )}
  </PageContainer>;
}

type RunnerView =
  | { mode: "mine" }
  | { mode: "list" }
  | { mode: "other"; character: Character };

type RunnerListLayout = "card" | "table";

function MyCharacterConsole() {
  const { toast } = useToast();
  const [view, setView] = useState<RunnerView>({ mode: "mine" });
  const [listLayout, setListLayout] = useState<RunnerListLayout>("card");
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [others, setOthers] = useState<Character[]>([]);
  const [othersLoading, setOthersLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMyCharacter().then((detail) => {
      if (!cancelled) setCharacter(detail);
    }).catch((error) => {
      if (!cancelled) toast(error instanceof Error ? error.message : "캐릭터 정보를 불러오지 못했습니다.", "error");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [toast]);

  async function openList() {
    setView({ mode: "list" });
    if (others.length > 0) return;
    setOthersLoading(true);
    try {
      setOthers(await fetchCharacters());
    } catch (error) {
      toast(error instanceof Error ? error.message : "캐릭터 목록을 불러오지 못했습니다.", "error");
    } finally {
      setOthersLoading(false);
    }
  }

  return <PageContainer max="4xl" className="space-y-8">
    {view.mode === "mine" && <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openList}
          className="text-sm font-semibold text-muted transition-colors hover:text-gold"
        >
          다른 캐릭터 보러 가기 &gt;&gt;
        </button>
      </div>
      <CharacterInfo characters={character ? [character] : []} loading={loading} showSelector={false} showId={false} />
    </>}

    {view.mode === "list" && <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <button
          type="button"
          onClick={() => setView({ mode: "mine" })}
          className="text-sm font-semibold text-muted transition-colors hover:text-gold"
        >
          &lt;&lt; 내 캐릭터로 돌아가기
        </button>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          {listLayout === "table" ? (
            <button
              type="button"
              onClick={() => setListLayout("card")}
              className="text-sm font-semibold text-muted transition-colors hover:text-gold"
            >
              카드로 확인하기
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setListLayout("table")}
              className="text-sm font-semibold text-muted transition-colors hover:text-gold"
            >
              표로 확인하기
            </button>
          )}
        </div>
      </div>
      {listLayout === "table" ? (
        <CharacterList
          characters={others}
          loading={othersLoading}
          onSelectCharacter={(selected) => setView({ mode: "other", character: selected })}
        />
      ) : (
        <CharacterCardGrid
          characters={others}
          loading={othersLoading}
          onSelectCharacter={(selected) => setView({ mode: "other", character: selected })}
        />
      )}
    </>}

    {view.mode === "other" && <>
      <div className="flex justify-start">
        <button
          type="button"
          onClick={openList}
          className="text-sm font-semibold text-muted transition-colors hover:text-gold"
        >
          &lt;&lt; 캐릭터 목록으로
        </button>
      </div>
      <CharacterInfo
        key={view.character.id}
        characters={[view.character]}
        loading={false}
        showSelector={false}
        showId={false}
        readOnly
      />
    </>}
  </PageContainer>;
}

export default function CharacterPage() {
  const member = useRequireMember();
  if (!member) return null;
  return member.role === "ADMIN" ? <AdminCharacterConsole /> : <MyCharacterConsole />;
}
