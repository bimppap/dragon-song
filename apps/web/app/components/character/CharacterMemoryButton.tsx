"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Camera, Download } from "lucide-react";
import Modal from "@/components/common/Modal";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchCharacterSkillTree, type CharacterDetail, type SkillBook } from "@/lib/api";
import { deepestLearnedSkill } from "@/lib/skillProgression";
import { MEMORY_HEIGHT, MEMORY_TITLES, MEMORY_WIDTH, renderCharacterMemory } from "./characterMemoryImage";

const BOOKS: SkillBook[] = ["용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"];

/** 처음에는 임무를 달성한 가장 늦은 챕터의 타이틀을 고른다. */
function defaultTitle(character: CharacterDetail): string {
  const chapters = character.achieved_missions.map((mission) => Number.parseInt(mission.chapter, 10)).filter(Number.isFinite);
  const latest = chapters.length ? Math.max(...chapters) : 1;
  return (MEMORY_TITLES.find((title) => title.label === `챕터 ${latest}`) ?? MEMORY_TITLES[0]).value;
}

/** 캐릭터 정보를 16:9 이미지 한 장으로 만들어 미리 보고 내려받는 "추억 남기기" 버튼. */
export default function CharacterMemoryButton({ character }: { character: CharacterDetail }) {
  const [open, setOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titleImage, setTitleImage] = useState(() => defaultTitle(character));

  // 창을 열 때마다 최신 정보로 다시 그린다.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        const trees = await Promise.all(BOOKS.map((book) => fetchCharacterSkillTree(character.id, book)));
        const blob = await renderCharacterMemory({
          character,
          skill: deepestLearnedSkill(trees.flatMap((tree) => tree.nodes)),
          titleImage,
        });
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImageUrl(url);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "이미지를 만들지 못했습니다.");
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, character, titleImage]);

  function openModal() {
    setImageUrl(null);
    setError(null);
    setOpen(true);
  }

  function changeTitle(value: string) {
    if (value === titleImage) return;
    setImageUrl(null);
    setError(null);
    setTitleImage(value);
  }

  return <>
    <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={openModal}>
      <Camera size={14} />
      추억 남기기
    </Button>
    <Modal open={open} onClose={() => setOpen(false)} title="추억 남기기" className="max-w-5xl">
      <div className="flex flex-col gap-4">
        <div className="relative aspect-video w-full overflow-hidden border border-line bg-inset">
          {imageUrl ? (
            <Image src={imageUrl} alt={`${character.name}의 추억`} width={MEMORY_WIDTH} height={MEMORY_HEIGHT} unoptimized className="size-full object-contain" />
          ) : (
            <div className="flex size-full items-center justify-center text-sm text-muted">
              {error ?? "이미지를 만드는 중입니다..."}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-sm text-muted">타이틀</span>
          <Select value={titleImage} onValueChange={changeTitle}>
            <SelectTrigger className="w-32" aria-label="타이틀 이미지">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {MEMORY_TITLES.map((title) => (
                  <SelectItem key={title.value} value={title.value}>{title.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <span className="flex-1" />
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>닫기</Button>
          {imageUrl ? (
            <Button asChild variant="cta" className="gap-1.5">
              <a href={imageUrl} download={`${character.name}_추억.png`}>
                <Download size={14} />
                다운로드
              </a>
            </Button>
          ) : (
            <Button type="button" variant="cta" className="gap-1.5" disabled>
              <Download size={14} />
              다운로드
            </Button>
          )}
        </div>
      </div>
    </Modal>
  </>;
}
