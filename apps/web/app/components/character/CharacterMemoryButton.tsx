"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Camera, Download } from "lucide-react";
import Modal from "@/components/common/Modal";
import { Button } from "@/components/ui/button";
import { fetchCharacterSkillTree, type CharacterDetail, type SkillBook } from "@/lib/api";
import { deepestLearnedSkill } from "@/lib/skillProgression";
import { MEMORY_HEIGHT, MEMORY_WIDTH, renderCharacterMemory } from "./characterMemoryImage";

const BOOKS: SkillBook[] = ["용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"];

/** 캐릭터 정보를 16:9 이미지 한 장으로 만들어 미리 보고 내려받는 "추억 남기기" 버튼. */
export default function CharacterMemoryButton({ character }: { character: CharacterDetail }) {
  const [open, setOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, [open, character]);

  function openModal() {
    setImageUrl(null);
    setError(null);
    setOpen(true);
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
        <div className="flex justify-end gap-2">
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
