"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Camera, Download, ImageIcon, X } from "lucide-react";
import Modal from "@/components/common/Modal";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchCharacterSkillTree, type CharacterDetail, type SkillBook } from "@/lib/api";
import { deepestLearnedSkill } from "@/lib/skillProgression";
import {
  MEMORY_BACKGROUND_SIZE, MEMORY_FRAME_BORDER_DEFAULTS, MEMORY_GLASSES, MEMORY_HEIGHT, MEMORY_OVERLAY, MEMORY_THEMES, MEMORY_TITLES, MEMORY_WIDTH,
  renderCharacterMemory, type MemoryGlass, type MemoryTheme,
} from "./characterMemoryImage";

const BOOKS: SkillBook[] = ["용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"];

/** 캐릭터 정보를 16:9 이미지 한 장으로 만들어 미리 보고 내려받는 "추억 남기기" 버튼. */
export default function CharacterMemoryButton({ character }: { character: CharacterDetail }) {
  const [open, setOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titleImage, setTitleImage] = useState<string>(MEMORY_TITLES[0].value);
  const [theme, setTheme] = useState<MemoryTheme>("dark");
  // "직접 등록" 테마에서 러너가 고른 배경 파일의 object URL. 서버에 올리지 않고 이 창에서만 쓴다.
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);

  useEffect(() => () => { if (backgroundUrl) URL.revokeObjectURL(backgroundUrl); }, [backgroundUrl]);

  const [glass, setGlass] = useState<MemoryGlass>("dark");
  const [frameBorder, setFrameBorder] = useState(MEMORY_FRAME_BORDER_DEFAULTS.dark);
  const [overlay, setOverlay] = useState(MEMORY_OVERLAY.defaults.dark);

  // 창을 열 때와 설정을 바꿀 때마다 최신 정보로 다시 그린다. 슬라이더·색 고르기를 움직이는 동안
  // 매번 그리지 않도록, 값이 잠시 멈춘 뒤에 한 번만 그린다.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let url: string | null = null;
    const timer = setTimeout(async () => {
      try {
        const trees = await Promise.all(BOOKS.map((book) => fetchCharacterSkillTree(character.id, book)));
        const blob = await renderCharacterMemory({
          character,
          skill: deepestLearnedSkill(trees.flatMap((tree) => tree.nodes)),
          titleImage,
          theme,
          backgroundImage: backgroundUrl,
          overlay,
          glass,
          frameBorder,
        });
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImageUrl(url);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "이미지를 만들지 못했습니다.");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, character, titleImage, theme, backgroundUrl, overlay, glass, frameBorder]);

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

  function changeTheme(value: MemoryTheme) {
    if (value === theme) return;
    setImageUrl(null);
    setError(null);
    setTheme(value);
  }

  function changeGlass(value: MemoryGlass) {
    // 유리 색을 바꾸면 진하기·테두리 색도 그 유리의 기본값으로 돌린다.
    setGlass(value);
    setOverlay(MEMORY_OVERLAY.defaults[value]);
    setFrameBorder(MEMORY_FRAME_BORDER_DEFAULTS[value]);
  }

  function changeBackground(file: File | null) {
    setImageUrl(null);
    setError(null);
    setBackgroundUrl(file ? URL.createObjectURL(file) : null);
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">테마</span>
          <Select value={theme} onValueChange={(value) => changeTheme(value as MemoryTheme)}>
            <SelectTrigger className="w-32" aria-label="색 테마">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {MEMORY_THEMES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <span className="ml-2 text-sm text-muted">타이틀</span>
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
        </div>
        {theme === "custom" && <div className="flex flex-wrap items-center gap-2">
          <label className={buttonVariants({ variant: "outline", size: "sm", className: "cursor-pointer gap-1.5" })}>
            <ImageIcon size={14} />
            {backgroundUrl ? "배경 바꾸기" : "배경 이미지 등록"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                changeBackground(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
          </label>
          {backgroundUrl && (
            <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => changeBackground(null)}>
              <X size={14} />
              배경 지우기
            </Button>
          )}
          {backgroundUrl && (
            <Select value={glass} onValueChange={(value) => changeGlass(value as MemoryGlass)}>
              <SelectTrigger className="h-8 w-32" aria-label="카드 유리 색">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {MEMORY_GLASSES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          {backgroundUrl && (
            <label className="flex items-center gap-2 text-sm text-muted">
              {glass === "dark" ? "배경 어둡기" : "배경 밝기"}
              <input
                type="range"
                min={MEMORY_OVERLAY.min}
                max={MEMORY_OVERLAY.max}
                step={MEMORY_OVERLAY.step}
                value={overlay}
                onChange={(event) => setOverlay(Number(event.target.value))}
                className="w-32 accent-gold"
              />
              <span className="w-10 font-num text-ivory">{Math.round(overlay * 100)}%</span>
            </label>
          )}
          {backgroundUrl && (
            <label className="flex items-center gap-2 text-sm text-muted">
              테두리 색
              <input
                type="color"
                value={frameBorder}
                onChange={(event) => setFrameBorder(event.target.value)}
                className="h-8 w-10 cursor-pointer border border-line bg-surface"
              />
            </label>
          )}
          <span className="text-xs text-muted">
            {backgroundUrl ? "" : "배경 이미지를 등록하면 카드가 반투명해지고 뒤 배경이 흐리게 비칩니다. "}
            권장 크기 {MEMORY_BACKGROUND_SIZE}(16:9). 비율이 다르면 가운데를 기준으로 잘립니다.
          </span>
        </div>}
        <div className="flex flex-wrap items-center justify-end gap-2">
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
