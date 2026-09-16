"use client";

import { useEffect, useState } from "react";
import { List, User, UserPlus } from "lucide-react";
import { useRequireMember } from "@/lib/auth";
import CharacterList from "../components/character/CharacterList";
import CharacterCardGrid from "../components/character/CharacterCardGrid";
import CharacterInfo from "../components/character/CharacterInfo";
import CharacterCreate from "../components/character/CharacterCreate";
import { fetchCharacters, fetchMyCharacter, type Character, type MemberRole } from "@/lib/api";
import PageContainer from "@/components/common/PageContainer";
import TabBar from "@/components/common/TabBar";
import { useToast } from "@/components/common/ToastProvider";

type Tab = "list" | "info" | "create";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "list", label: "캐릭터 목록", icon: List },
  { id: "info", label: "캐릭터 정보", icon: User },
  { id: "create", label: "캐릭터 생성", icon: UserPlus },
];

type ListLayout = "card" | "table";

/** 목록을 표/카드 중 무엇으로 볼지 바꾸는 버튼. 관리자·러너 화면이 같은 문구를 쓴다. */
function ListLayoutToggle({ layout, onChange }: { layout: ListLayout; onChange: (next: ListLayout) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(layout === "table" ? "card" : "table")}
      className="text-sm font-semibold text-muted transition-colors hover:text-gold"
    >
      {layout === "table" ? "카드로 확인하기" : "표로 확인하기"}
    </button>
  );
}

function AdminCharacterConsole() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("list");
  // 관리자는 표 보기가 기본이고, 필요할 때 러너와 같은 카드 보기로 바꾼다.
  const [listLayout, setListLayout] = useState<ListLayout>("table");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loadingCharacters, setLoadingCharacters] = useState(true);
  const [focusCharacterId, setFocusCharacterId] = useState<number | null>(null);

  function openCharacter(character: Character) {
    setFocusCharacterId(character.id);
    setTab("info");
  }

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
    {tab === "list" && (
      <div className="space-y-4">
        <div className="flex justify-end">
          <ListLayoutToggle layout={listLayout} onChange={setListLayout} />
        </div>
        {listLayout === "table" ? (
          <CharacterList
            characters={characters}
            loading={loadingCharacters}
            showAdminFlags
            editableAdminFlags
            onSelectCharacter={openCharacter}
          />
        ) : (
          <CharacterCardGrid
            characters={characters}
            loading={loadingCharacters}
            onSelectCharacter={openCharacter}
          />
        )}
      </div>
    )}
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
        adminMode
      />
    )}
    {tab === "create" && <CharacterCreate onCreated={(character) => { setCharacters((prev) => [...prev, character].toSorted((a, b) => a.name.localeCompare(b.name, "ko"))); setFocusCharacterId(character.id); setTab("info"); }} />}
  </PageContainer>;
}

type RunnerView =
  | { mode: "mine" }
  | { mode: "list" }
  | { mode: "other"; character: Character };

function MyCharacterConsole({ role }: { role: MemberRole }) {
  const { toast } = useToast();
  const [view, setView] = useState<RunnerView>({ mode: "mine" });
  const [listLayout, setListLayout] = useState<ListLayout>("card");
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

  const isStaff = role === "STAFF";

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
          <ListLayoutToggle layout={listLayout} onChange={setListLayout} />
        </div>
      </div>
      {listLayout === "table" ? (
        <CharacterList
          characters={others}
          loading={othersLoading}
          showId={isStaff}
          showAdminFlags={isStaff}
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
      {/* 스텝은 본인 캐릭터는 러너로서(mine 뷰), 다른 캐릭터는 관리자로서 다룬다. 실제 편집 가능 여부는
          CharacterInfo가 캐릭터의 소유자 유무로 다시 판정하므로, 러너 소유 캐릭터는 열람만 된다. */}
      <CharacterInfo
        key={view.character.id}
        characters={[view.character]}
        loading={false}
        showSelector={false}
        showId={isStaff}
        readOnly={!isStaff}
        adminMode={isStaff}
        showHistory={isStaff}
      />
    </>}
  </PageContainer>;
}

export default function CharacterPage() {
  const member = useRequireMember();
  if (!member) return null;
  return member.role === "ADMIN" ? <AdminCharacterConsole /> : <MyCharacterConsole role={member.role} />;
}
