"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import InfoTooltip from "@/components/common/InfoTooltip";
import { SkillTooltipContent } from "@/components/skill/SkillTreeGrid";
import { BOOK_ACCENT } from "@/components/skill/bookAccent";
import { Button } from "@/components/ui/button";
import { fetchCharacterSkillTree, type CharacterSkillNode, type SkillBook } from "@/lib/api";
import CharacterSlot from "./CharacterSlot";
import Modal from "@/components/common/Modal";
import MySkillTree from "@/app/battle/components/MySkillTree";
import type { CharacterDetail } from "@/lib/api";

import { deepestLearnedSkill } from "@/lib/skillProgression";

const BOOKS: SkillBook[] = ["용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"];
const BOOK_BORDER_CLASS: Record<SkillBook, string> = {
  "용맹의 서": "border-red-500",
  "불굴의 서": "border-blue-500",
  "헌신의 서": "border-green-500",
  "탐구의 서": "border-purple-500",
};

interface Props {
  characterId: number;
  adminMode?: boolean;
  onUpdated?: (detail: CharacterDetail) => void;
  /** 다른 러너의 캐릭터를 열람할 때: 기술트리 편집 페이지로 이동하지 않고 정보만 보여준다. */
  readOnly?: boolean;
}

/** 서와 무관하게 가장 깊이 습득한 기술을 한 슬롯에 보여준다. */
export default function CharacterOwnedSkills({ characterId, readOnly = false, adminMode = false, onUpdated }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"actions" | "tree" | "custom" | null>(null);
  const [revision, setRevision] = useState(0);
  const [skills, setSkills] = useState<CharacterSkillNode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goToSkillPage() {
    if (readOnly) return;
    if (adminMode) { setMode(skills.length ? "actions" : "tree"); return; }
    router.push("/skill");
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      setLoaded(false);
      try {
        const trees = await Promise.all(BOOKS.map((b) => fetchCharacterSkillTree(characterId, b)));
        if (cancelled) return;
        const deepest = deepestLearnedSkill(trees.flatMap((tree) => tree.nodes));
        setSkills(deepest ? [deepest] : []);
        setLoaded(true);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "기술 조회 실패");
        setLoaded(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [characterId, revision]);

  return (
    <>
      {adminMode && <>
        <Modal open={mode === "actions"} onClose={() => setMode(null)} title="기술 설정">
          <div className="flex gap-2"><Button onClick={() => setMode("tree")}>스킬 변경하기</Button><Button variant="outline" onClick={() => setMode("custom")}>커스텀 하기</Button></div>
        </Modal>
        <Modal open={mode === "tree"} onClose={() => setMode(null)} title="기술 선택" className="max-w-6xl">
          {mode === "tree" && <MySkillTree characterId={characterId} adminMode onClose={() => setMode(null)} onUpdated={(detail) => { onUpdated?.(detail); setRevision((value) => value + 1); }} />}
        </Modal>
        {mode === "custom" && <MySkillTree characterId={characterId} adminMode customizeOnly onClose={() => setMode(null)} onUpdated={(detail) => { onUpdated?.(detail); setRevision((value) => value + 1); }} />}
      </>}
      {error ? (
        <span className="text-xs text-red-500">{error}</span>
      ) : !loaded ? (
        <span className="text-xs text-muted">불러오는 중...</span>
      ) : (
        <>
          {skills.length === 0 && !readOnly && (
            <CharacterSlot aria-label="기술 배우기" interactive onClick={goToSkillPage}>
              <Sparkles size={17} />
            </CharacterSlot>
          )}
          {skills.map((skill) => {
            const isOwned = skill.unlocked && skill.tier > 0;
            return (
              <InfoTooltip
                key={skill.book}
                side="top"
                content={(
                  <SkillTooltipContent
                    node={skill}
                    variant="runner"
                    accent={BOOK_ACCENT[skill.book]}
                    footer={readOnly ? undefined : (
                      <Button
                        type="button"
                        size="sm"
                        variant="cta"
                        className="w-full"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          goToSkillPage();
                        }}
                      >
                        {adminMode ? "기술 설정" : isOwned ? "기술 강화하기" : "기술 배우기"}
                      </Button>
                    )}
                  />
                )}
              >
                <CharacterSlot
                  aria-label={readOnly ? skill.display_name : `${skill.display_name} · 기술트리 열기`}
                  borderClassName={BOOK_BORDER_CLASS[skill.book]}
                  interactive={!readOnly}
                  onClick={goToSkillPage}
                >
                  {skill.image_url ? (
                    <Image src={skill.image_url} alt="" fill sizes="36px" unoptimized className="object-cover" />
                  ) : (
                    <Sparkles size={17} />
                  )}
                </CharacterSlot>
              </InfoTooltip>
            );
          })}
        </>
      )}
    </>
  );
}
