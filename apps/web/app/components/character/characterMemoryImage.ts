import type { CharacterDetail, CharacterOwnedItem, CharacterSkillNode, SkillBook } from "@/lib/api";
import { BOOK_ACCENT } from "@/components/skill/bookAccent";
import { FACTION_POSITION_IMAGE } from "@/lib/faction";
import { getRankGrade } from "@/lib/rankGrade";

/** "추억 남기기" 이미지의 논리 크기(16:9). 실제 PNG는 SCALE배로 그려 픽셀 폰트가 흐려지지 않게 한다. */
export const MEMORY_WIDTH = 1600;
export const MEMORY_HEIGHT = 900;
const SCALE = 2;

const COLOR = {
  ground: "#171e1e",
  surface: "#222b28",
  inset: "#1b2321",
  gold: "#e8c936",
  ivory: "#f1eedc",
  muted: "#9ca69e",
  line: "#313d37",
  cell: "rgba(232, 201, 54, 0.06)",
  hp: "#f43f5e",
  mp: "#0ea5e9",
};

const BOOK_COLOR: Record<SkillBook, string> = {
  "용맹의 서": "#ef4444",
  "불굴의 서": "#3b82f6",
  "헌신의 서": "#22c55e",
  "탐구의 서": "#a855f7",
};

const GRADE_STATS = [
  { key: "stat_courage", label: "용기", color: "#ef4444" },
  { key: "stat_endurance", label: "인내", color: "#3b82f6" },
  { key: "stat_charity", label: "자애", color: "#10b981" },
  { key: "stat_wisdom", label: "지혜", color: "#a855f7" },
] as const;

const GROWTH_EXP_PER_LEVEL = 20; // app/crud.py의 GROWTH_EXP_PER_LEVEL과 같다.
const MISSION_COLUMNS = 4;
const CHALLENGE_COLUMNS = 2;
const ACHIEVEMENT_ROWS = 6;
// 이만큼 달성하면 패널 오른쪽 위에 ALL CLEAR를 띄운다(공개된 임무·도전과제 전체 개수).
const ALL_CLEAR_MISSIONS = 24;
const ALL_CLEAR_CHALLENGES = 12;

const GROUP_BADGE = { name: "조사단 증표", imageUrl: "/group_badge.png" };

/** 왼쪽 아래에 넣을 수 있는 타이틀 이미지(public/title). */
export const MEMORY_TITLES = [
  { value: "/title/title1.png", label: "챕터 1" },
  { value: "/title/title2.png", label: "챕터 2" },
  { value: "/title/title3.png", label: "챕터 3" },
  { value: "/title/title4.png", label: "챕터 4" },
  { value: "/title/title5.png", label: "챕터 5" },
  { value: "/title/title6.png", label: "챕터 6" },
  { value: "/title/title_after.png", label: "엔딩" },
] as const;
// 타이틀 이미지(1080×240)는 둘레가 투명하고 그림마다 장식 높이가 달라, 모두를 감싸는 같은 영역을 잘라 쓴다.
const TITLE_CROP = { x: 280, y: 32, w: 552, h: 168 };

export interface MemoryImageData {
  character: CharacterDetail;
  /** 가장 깊이 배운 기술(정보 카드의 기술 슬롯과 같다). */
  skill: CharacterSkillNode | null;
  /** 왼쪽 아래 타이틀 이미지 경로(MEMORY_TITLES 중 하나). */
  titleImage: string;
}

const numberFormatter = new Intl.NumberFormat("ko-KR");

function font(size: number, { family = "Galmuri11", bold = false }: { family?: string; bold?: boolean } = {}) {
  return `${bold ? 700 : 400} ${size}px ${family}, monospace`;
}

async function loadFonts() {
  await Promise.all(
    [font(16), font(16, { bold: true }), font(16, { family: "Galmuri14" }), font(16, { family: "GalmuriMono11" })]
      .map((spec) => document.fonts.load(spec, "가A1")),
  );
}

function loadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    // 외부 저장소 이미지를 그려도 캔버스를 PNG로 내보낼 수 있도록 CORS로 받는다.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** 크기가 maxWidth를 넘으면 글자를 minSize까지 줄이고, 그래도 넘치면 말줄임한다. 정해진 font를 ctx에 남긴다. */
function fitText(
  ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number,
  options: { family?: string; bold?: boolean; minSize?: number } = {},
): string {
  const minSize = options.minSize ?? size;
  for (let current = size; current >= minSize; current -= 1) {
    ctx.font = font(current, options);
    if (ctx.measureText(text).width <= maxWidth) return text;
  }
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) trimmed = trimmed.slice(0, -1);
  return `${trimmed}…`;
}

function drawText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  { size, color = COLOR.ivory, align = "left", maxWidth, family, bold, minSize }: {
    size: number; color?: string; align?: CanvasTextAlign; maxWidth?: number;
    family?: string; bold?: boolean; minSize?: number;
  },
) {
  const content = maxWidth ? fitText(ctx, text, maxWidth, size, { family, bold, minSize }) : text;
  if (!maxWidth) ctx.font = font(size, { family, bold });
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(content, x, y);
}

function box(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  { fill, stroke, radius = 8, lineWidth = 1 }: { fill?: string; stroke?: string; radius?: number; lineWidth?: number },
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

/** 확대할 때는 픽셀 아트가 뭉개지지 않게 최근접 보간, 축소할 때는 부드럽게 줄인다. */
function setSmoothing(ctx: CanvasRenderingContext2D, image: HTMLImageElement, drawnWidth: number) {
  ctx.imageSmoothingEnabled = drawnWidth * SCALE < image.naturalWidth;
  ctx.imageSmoothingQuality = "high";
}

function drawContain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ratio = Math.min(w / image.naturalWidth, h / image.naturalHeight);
  const dw = image.naturalWidth * ratio;
  const dh = image.naturalHeight * ratio;
  setSmoothing(ctx, image, dw);
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ratio = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const sw = w / ratio;
  const sh = h / ratio;
  setSmoothing(ctx, image, w);
  ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

/** 테두리 있는 정사각 아이콘 칸. 이미지가 없으면 칸만 남긴다. */
function drawIcon(
  ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, x: number, y: number, size: number,
  border: string = COLOR.gold,
) {
  ctx.fillStyle = "rgba(232, 201, 54, 0.1)";
  ctx.fillRect(x, y, size, size);
  if (image) drawContain(ctx, image, x + 2, y + 2, size - 4, size - 4);
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
}

/** 제목·개수가 붙은 패널 테두리. 개수는 제목 바로 뒤에 쓴다. 본문이 시작되는 y를 돌려준다. */
function panel(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, count: string,
): number {
  box(ctx, x, y, w, h, { fill: COLOR.inset, stroke: COLOR.line, radius: 10 });
  drawText(ctx, title, x + 16, y + 22, { size: 16, color: COLOR.gold, bold: true });
  const titleWidth = ctx.measureText(title).width;
  drawText(ctx, count, x + 16 + titleWidth + 10, y + 22, { size: 13, color: COLOR.muted, family: "GalmuriMono11" });
  return y + 44;
}

/** 오른쪽 끝에서부터 [글자, 색, 크기, 글꼴] 조각들을 차례로 이어 쓴다(보유 아이템 제목 옆 골드·CP). */
function drawRightAlignedRun(
  ctx: CanvasRenderingContext2D, parts: { text: string; color: string; size: number; family?: string }[],
  rightX: number, y: number, gap = 6,
) {
  let x = rightX;
  for (const part of parts.toReversed()) {
    drawText(ctx, part.text, x, y, { size: part.size, color: part.color, align: "right", family: part.family });
    x -= ctx.measureText(part.text).width + gap;
  }
}

function currencyParts(label: string, color: string, current: number, total: number) {
  return [
    { text: label, color, size: 14 },
    { text: numberFormatter.format(current), color: COLOR.ivory, size: 15, family: "GalmuriMono11" },
    { text: "(누적", color: COLOR.muted, size: 12 },
    { text: `${numberFormatter.format(total)})`, color: COLOR.muted, size: 13, family: "GalmuriMono11" },
  ];
}

/** 패널 오른쪽 위의 금색 ALL CLEAR 표시. */
function drawAllClear(ctx: CanvasRenderingContext2D, rightX: number, centerY: number) {
  const text = "ALL CLEAR";
  ctx.font = font(13, { family: "GalmuriMono11", bold: true });
  const w = ctx.measureText(text).width + 20;
  box(ctx, rightX - w, centerY - 12, w, 24, { fill: "rgba(232, 201, 54, 0.15)", stroke: COLOR.gold, radius: 4 });
  drawText(ctx, text, rightX - w / 2, centerY + 1, { size: 13, color: COLOR.gold, align: "center", family: "GalmuriMono11", bold: true });
}

function emptyNote(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number) {
  drawText(ctx, text, x + w / 2, y + h / 2, { size: 13, color: COLOR.muted, align: "center" });
}

/** 이름표: 정보 카드와 같은 육각 띠(금색 테두리 + 어두운 안쪽). */
function drawNameBanner(ctx: CanvasRenderingContext2D, name: string, factionImage: HTMLImageElement | null, x: number, y: number) {
  const h = 64;
  const iconSize = factionImage ? 40 : 0;
  const nameText = fitText(ctx, name, 640, 32, { family: "Galmuri14", minSize: 22 });
  const nameFont = ctx.font;
  const textWidth = ctx.measureText(nameText).width;
  const w = textWidth + iconSize + (iconSize ? 12 : 0) + 80;
  const hexagon = (inset: number) => {
    const cut = 28 - inset * 0.4;
    ctx.beginPath();
    ctx.moveTo(x + cut, y + inset);
    ctx.lineTo(x + w - cut, y + inset);
    ctx.lineTo(x + w - inset, y + h / 2);
    ctx.lineTo(x + w - cut, y + h - inset);
    ctx.lineTo(x + cut, y + h - inset);
    ctx.lineTo(x + inset, y + h / 2);
    ctx.closePath();
  };
  const outer = ctx.createLinearGradient(0, y, 0, y + h);
  outer.addColorStop(0, "rgba(232, 201, 54, 0.9)");
  outer.addColorStop(0.5, "rgba(232, 201, 54, 0.55)");
  outer.addColorStop(1, "rgba(232, 201, 54, 0.85)");
  hexagon(0);
  ctx.fillStyle = outer;
  ctx.fill();
  const inner = ctx.createLinearGradient(0, y, 0, y + h);
  inner.addColorStop(0, "#3a4d40");
  inner.addColorStop(0.5, COLOR.surface);
  inner.addColorStop(1, COLOR.inset);
  hexagon(4);
  ctx.fillStyle = inner;
  ctx.fill();
  let cursor = x + 40;
  if (factionImage) {
    drawContain(ctx, factionImage, cursor, y + (h - iconSize) / 2, iconSize, iconSize);
    cursor += iconSize + 12;
  }
  ctx.font = nameFont;
  ctx.fillStyle = COLOR.gold;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowOffsetY = 2;
  ctx.fillText(nameText, cursor, y + h / 2 + 1);
  ctx.shadowColor = "transparent";
  ctx.shadowOffsetY = 0;
}

function drawBar(
  ctx: CanvasRenderingContext2D, label: string, value: number, max: number, color: string,
  x: number, y: number, w: number,
) {
  drawText(ctx, label, x, y + 8, { size: 15, bold: true });
  drawText(ctx, `${numberFormatter.format(value)} / ${numberFormatter.format(max)}`, x + w, y + 8, {
    size: 15, align: "right", family: "GalmuriMono11",
  });
  box(ctx, x, y + 22, w, 8, { fill: COLOR.line, radius: 4 });
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  if (ratio > 0) box(ctx, x, y + 22, Math.max(w * ratio, 8), 8, { fill: color, radius: 4 });
}

/** 한 가지 색·굵기로 이어 쓰는 글자 조각. 줄바꿈(\n)은 강제 개행이다. */
interface TextRun { text: string; color: string; bold?: boolean; family?: string }

type TextPiece = TextRun & { width: number };

/** 여러 색이 섞인 글을 maxWidth에 맞춰 줄로 나눈다. maxLines를 넘치면 마지막 줄을 말줄임한다. */
function wrapRichText(
  ctx: CanvasRenderingContext2D, runs: TextRun[], maxWidth: number,
  { size, maxLines }: { size: number; maxLines: number },
): TextPiece[][] {
  type Piece = TextPiece;
  const measure = (run: TextRun, text: string) => {
    ctx.font = font(size, run);
    return ctx.measureText(text).width;
  };
  const lines: Piece[][] = [[]];
  let lineWidth = 0;
  const newLine = () => { lines.push([]); lineWidth = 0; };
  const append = (run: TextRun, text: string, width: number) => {
    lines[lines.length - 1].push({ ...run, text, width });
    lineWidth += width;
  };
  for (const run of runs) {
    // 공백·줄바꿈을 경계로 낱말 단위로 나눠, 낱말이 줄 끝에서 잘리지 않게 한다.
    for (const token of run.text.split(/(\n|[^\S\n]+)/)) {
      if (!token) continue;
      if (token === "\n") { newLine(); continue; }
      const isSpace = /^\s+$/.test(token);
      if (isSpace && lineWidth === 0) continue;
      const width = measure(run, token);
      if (lineWidth + width <= maxWidth) { append(run, token, width); continue; }
      if (isSpace) { newLine(); continue; }
      if (width <= maxWidth) { newLine(); append(run, token, width); continue; }
      // 한 줄보다 긴 낱말은 글자 단위로 끊는다.
      for (const char of token) {
        const charWidth = measure(run, char);
        if (lineWidth + charWidth > maxWidth) newLine();
        append(run, char, charWidth);
      }
    }
  }
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    const last = shown[shown.length - 1];
    const ellipsis = { ...(last.at(-1) ?? { color: COLOR.muted }), text: "…" } as TextRun;
    const ellipsisWidth = measure(ellipsis, "…");
    let width = last.reduce((sum, piece) => sum + piece.width, 0);
    while (last.length && width + ellipsisWidth > maxWidth) {
      const piece = last[last.length - 1];
      const trimmed = [...piece.text].slice(0, -1).join("");
      width -= piece.width;
      if (trimmed) {
        piece.text = trimmed;
        piece.width = measure(piece, trimmed);
        width += piece.width;
      } else {
        last.pop();
      }
    }
    last.push({ ...ellipsis, width: ellipsisWidth });
  }
  return shown.filter((line, index) => line.length > 0 || index < shown.length - 1);
}

function drawRichLines(
  ctx: CanvasRenderingContext2D, lines: TextPiece[][], x: number, y: number,
  { size, lineHeight }: { size: number; lineHeight: number },
) {
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  lines.forEach((line, index) => {
    let cursor = x;
    for (const piece of line) {
      ctx.font = font(size, piece);
      ctx.fillStyle = piece.color;
      ctx.fillText(piece.text, cursor, y + index * lineHeight + lineHeight / 2);
      cursor += piece.width;
    }
  });
}

/** 작은따옴표로 감싼 구간을 강조색으로 바꾼다. 따옴표는 서식 기호라 지운다. 홀수 번째 조각이 따옴표 안쪽이다. */
function quotedRuns(text: string, base: TextRun, quoted: TextRun): TextRun[] {
  return text.split(/'([^']+)'/g).map((part, index) => ({ ...(index % 2 ? quoted : base), text: part }));
}

/** 기술은 러너가 쓴 커스텀 설명만 보여준다. 따옴표 구간은 커스텀 색(없으면 서 색)으로 굵게 칠한다. */
function skillDescriptionRuns(skill: CharacterSkillNode): TextRun[] {
  if (!skill.custom_description) return [];
  return quotedRuns(skill.custom_description,
    { text: "", color: COLOR.ivory },
    { text: "", color: skill.custom_description_color || BOOK_ACCENT[skill.book].line, bold: true });
}

const LOADOUT_HEADER_HEIGHT = 76;
const LOADOUT_TEXT = { size: 12, lineHeight: 16, maxLines: 6 };

/** 설명 줄 수에 맞춘 칸 높이. 설명이 없으면 아이콘·이름 부분만 쓴다. */
function loadoutCardHeight(lineCount: number) {
  return lineCount ? LOADOUT_HEADER_HEIGHT + 8 + lineCount * LOADOUT_TEXT.lineHeight + 10 : LOADOUT_HEADER_HEIGHT;
}

/** 기술·동반자·장신구·특성 칸: 위에 아이콘·이름, 아래에 설명(미리 줄바꿈한 lines). */
function drawLoadoutCard(
  ctx: CanvasRenderingContext2D,
  { label, name, nameColor = COLOR.ivory, image, border, lines }: {
    label: string; name: string | null; nameColor?: string; image: HTMLImageElement | null;
    border: string; lines: TextPiece[][];
  },
  x: number, y: number, w: number, h: number,
) {
  box(ctx, x, y, w, h, { fill: COLOR.inset, stroke: COLOR.line });
  const iconSize = 52;
  drawIcon(ctx, name ? image : null, x + 12, y + 12, iconSize, name ? border : COLOR.line);
  const textX = x + 24 + iconSize;
  drawText(ctx, label, textX, y + 26, { size: 12, color: COLOR.muted });
  drawText(ctx, name ?? "없음", textX, y + 50, {
    size: 16, color: name ? nameColor : COLOR.muted, maxWidth: x + w - 12 - textX, minSize: 11,
  });
  if (lines.length === 0) return;
  ctx.fillStyle = COLOR.line;
  ctx.fillRect(x + 12, y + LOADOUT_HEADER_HEIGHT, w - 24, 1);
  drawRichLines(ctx, lines, x + 12, y + LOADOUT_HEADER_HEIGHT + 8, LOADOUT_TEXT);
}

/** 아이콘 + 이름이 들어간 작은 칸(임무·도전과제·아이템 공용). */
function drawEntryCell(
  ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, name: string, x: number, y: number, w: number, h: number,
  trailing?: string,
) {
  box(ctx, x, y, w, h, { fill: COLOR.cell, radius: 6 });
  const iconSize = h - 8;
  drawIcon(ctx, image, x + 4, y + 4, iconSize, COLOR.line);
  let right = x + w - 8;
  if (trailing) {
    drawText(ctx, trailing, right, y + h / 2, { size: 13, color: COLOR.gold, align: "right", family: "GalmuriMono11" });
    right -= ctx.measureText(trailing).width + 8;
  }
  const textX = x + iconSize + 12;
  drawText(ctx, name, textX, y + h / 2, { size: 12, maxWidth: right - textX, minSize: 10 });
}

/** "1. 서막" → ["1", "서막"]. 번호가 없으면 이름만 쓴다. */
function splitChapter(chapter: string): [string | null, string] {
  const match = chapter.match(/^(\d+)\.\s*(.*)$/);
  return match ? [match[1], match[2]] : [null, chapter];
}

interface Row<T> { chapter: string; entries: T[]; first: boolean }

/** 챕터별로 묶어 한 줄에 columns개씩 나눈다. 챕터가 바뀌면 새 줄에서 시작한다. */
function chapterRows<T extends { chapter: string }>(entries: T[], columns: number): Row<T>[] {
  const byChapter = new Map<string, T[]>();
  for (const entry of entries) byChapter.set(entry.chapter, [...(byChapter.get(entry.chapter) ?? []), entry]);
  const chapters = [...byChapter.keys()].toSorted((a, b) => a.localeCompare(b, "ko", { numeric: true }));
  return chapters.flatMap((chapter) => {
    const list = byChapter.get(chapter)!;
    return Array.from({ length: Math.ceil(list.length / columns) }, (_, index) => ({
      chapter, entries: list.slice(index * columns, (index + 1) * columns), first: index === 0,
    }));
  });
}

function ownedItemCount(item: CharacterOwnedItem) {
  return item.item_type === "consumable" ? item.quantity - item.used_quantity : item.quantity;
}

function todayLabel() {
  const now = new Date();
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
}

export async function renderCharacterMemory({ character, skill, titleImage }: MemoryImageData): Promise<Blob> {
  const equipped = (type: CharacterOwnedItem["item_type"]) =>
    character.owned_items.find((item) => item.equipped && item.item_type === type && item.quantity > 0) ?? null;
  const companion = equipped("companion");
  const accessory = equipped("accessory");
  const trait = character.equipped_trait ?? null;
  const ownedItems = [
    { name: GROUP_BADGE.name, image_url: GROUP_BADGE.imageUrl as string | null, count: 1 },
    ...character.owned_items
      .filter((item) => !item.equipped && ownedItemCount(item) > 0)
      .map((item) => ({ name: item.item_name, image_url: item.item_image_url, count: ownedItemCount(item) })),
  ];
  const missionRows = chapterRows(character.achieved_missions, MISSION_COLUMNS);
  const challenges = character.achieved_challenges;
  const grade = getRankGrade(character.rank);

  const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
  const image = (src: string | null | undefined) => {
    if (!src) return Promise.resolve(null);
    if (!imageCache.has(src)) imageCache.set(src, loadImage(src));
    return imageCache.get(src)!;
  };
  const [frame, photo, medal, faction, title, skillImage, companionImage, accessoryImage, traitImage] = await Promise.all([
    image("/profile/frame.png"),
    image(character.image_url),
    image(grade.medalImage),
    image(character.faction ? FACTION_POSITION_IMAGE[character.faction] : null),
    image(titleImage),
    image(skill?.image_url),
    image(companion?.item_image_url),
    image(accessory?.item_image_url),
    image(trait?.image_url),
    loadFonts(),
  ]);
  const [missionImages, challengeImages, itemImages] = await Promise.all([
    Promise.all(character.achieved_missions.map((mission) => image(mission.image_url))),
    Promise.all(challenges.map((challenge) => image(challenge.image_url))),
    Promise.all(ownedItems.map((item) => image(item.image_url))),
  ]);
  const missionImageById = new Map(character.achieved_missions.map((mission, index) => [mission.mission_id, missionImages[index]]));

  const canvas = document.createElement("canvas");
  canvas.width = MEMORY_WIDTH * SCALE;
  canvas.height = MEMORY_HEIGHT * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 그릴 수 없는 브라우저입니다.");
  ctx.scale(SCALE, SCALE);

  // 바탕과 금색 테두리.
  ctx.fillStyle = COLOR.ground;
  ctx.fillRect(0, 0, MEMORY_WIDTH, MEMORY_HEIGHT);
  box(ctx, 16, 16, MEMORY_WIDTH - 32, MEMORY_HEIGHT - 32, { fill: COLOR.surface, stroke: "rgba(232, 201, 54, 0.55)", radius: 14, lineWidth: 3 });
  box(ctx, 24, 24, MEMORY_WIDTH - 48, MEMORY_HEIGHT - 48, { stroke: COLOR.line, radius: 10 });

  // ── 왼쪽: 프로필·성장·능력치·타이틀 ──
  const left = 48;
  const leftWidth = 288;
  const frameX = left + (leftWidth - 240) / 2;
  const frameY = 52;
  if (frame) drawContain(ctx, frame, frameX, frameY, 240, 240);
  if (photo) drawCover(ctx, photo, frameX + 20, frameY + 20, 200, 200);

  // 성장 등급(Lv. n, 아래에 총 획득 경험치)과 그 오른쪽 메달
  const medalSize = 72;
  let y = frameY + 256;
  const gradeWidth = leftWidth - medalSize - 12;
  drawText(ctx, `Lv. ${character.lv}`, left + 4, y + 24, { size: 28, color: COLOR.gold, family: "GalmuriMono11" });
  const totalExp = Math.max(0, (character.lv - 1) * GROWTH_EXP_PER_LEVEL + character.exp);
  drawText(ctx, `Total ${numberFormatter.format(totalExp)} EXP`, left + 4, y + 54, {
    size: 15, color: COLOR.ivory, family: "GalmuriMono11", maxWidth: gradeWidth - 8, minSize: 11,
  });
  if (medal) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 4;
    drawContain(ctx, medal, left + leftWidth - medalSize, y, medalSize, medalSize);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  }

  y += medalSize + 24;
  drawBar(ctx, "HP", character.hp, character.hp_max, COLOR.hp, left, y, leftWidth);
  y += 46;
  drawBar(ctx, "MP", character.mp, character.mp_max, COLOR.mp, left, y, leftWidth);

  y += 52;
  const halfWidth = (leftWidth - 12) / 2;
  GRADE_STATS.forEach((stat, index) => {
    const x = left + (index % 2) * (halfWidth + 12);
    const cellY = y + Math.floor(index / 2) * 52;
    box(ctx, x, cellY, halfWidth, 42, { fill: COLOR.inset, stroke: COLOR.line });
    drawText(ctx, stat.label, x + 12, cellY + 21, { size: 15, color: stat.color, bold: true });
    drawText(ctx, String(character[stat.key]), x + halfWidth - 12, cellY + 21, { size: 18, align: "right", family: "GalmuriMono11" });
  });

  if (title) {
    // 절반 크기로 그리면 실제 PNG(SCALE 2)에서 원본 픽셀과 1:1이 되어 픽셀 아트가 고르게 보인다.
    const titleWidth = TITLE_CROP.w / SCALE;
    const titleHeight = TITLE_CROP.h / SCALE;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(title, TITLE_CROP.x, TITLE_CROP.y, TITLE_CROP.w, TITLE_CROP.h,
      left + (leftWidth - titleWidth) / 2, MEMORY_HEIGHT - 48 - titleHeight - 8, titleWidth, titleHeight);
  }

  // ── 오른쪽 ──
  const right = 368;
  const rightWidth = MEMORY_WIDTH - 48 - right;

  drawNameBanner(ctx, character.name, faction, right, 48);
  drawText(ctx, todayLabel(), right + rightWidth, 80, { size: 14, color: COLOR.muted, align: "right", family: "GalmuriMono11" });

  // 기술·동반자·장신구·특성(설명 포함). 칸 높이는 설명이 가장 긴 칸에 맞춘다.
  const loadoutY = 124;
  const cardWidth = (rightWidth - 36) / 4;
  const plain = (text: string | null | undefined): TextRun[] => (text ? [{ text, color: COLOR.muted }] : []);
  const loadout = [
    {
      label: "기술", name: skill?.display_name ?? null, image: skillImage,
      nameColor: skill?.custom_description_color || COLOR.ivory,
      border: skill ? BOOK_COLOR[skill.book] : COLOR.gold, description: skill ? skillDescriptionRuns(skill) : [],
    },
    { label: "동반자", name: companion?.item_name ?? null, image: companionImage, border: COLOR.gold, description: plain(companion?.item_description) },
    { label: "장신구", name: accessory?.item_name ?? null, image: accessoryImage, border: COLOR.gold, description: plain(accessory?.item_description) },
    { label: "특성", name: trait?.name ?? null, image: traitImage, border: COLOR.gold, description: plain(trait?.description) },
  ];
  const cards = loadout.map((slot) => ({
    ...slot,
    lines: slot.name ? wrapRichText(ctx, slot.description, cardWidth - 24, LOADOUT_TEXT) : [],
  }));
  const loadoutHeight = loadoutCardHeight(Math.max(...cards.map((card) => card.lines.length)));
  cards.forEach((card, index) => {
    drawLoadoutCard(ctx, card, right + index * (cardWidth + 12), loadoutY, cardWidth, loadoutHeight);
  });

  // 달성 임무(4개씩, 챕터별) · 도전과제(2개씩)
  const achievementY = loadoutY + loadoutHeight + 16;
  const achievementHeight = 304;
  const rowHeight = 36;
  const rowGap = 6;
  const missionWidth = 768;
  const challengeX = right + missionWidth + 16;
  const challengeWidth = rightWidth - missionWidth - 16;

  let bodyY = panel(ctx, right, achievementY, missionWidth, achievementHeight, "달성한 임무", `${character.achieved_missions.length}개`);
  if (missionRows.length === 0) {
    emptyNote(ctx, "아직 달성한 임무가 없습니다.", right, bodyY, missionWidth, achievementHeight - 44);
  } else {
    const chapterWidth = 84;
    const cellGap = 8;
    const cellsX = right + 16 + chapterWidth;
    const cellWidth = (missionWidth - 32 - chapterWidth - cellGap * (MISSION_COLUMNS - 1)) / MISSION_COLUMNS;
    const visible = missionRows.slice(0, ACHIEVEMENT_ROWS);
    visible.forEach((row, rowIndex) => {
      const rowY = bodyY + rowIndex * (rowHeight + rowGap);
      if (row.first) {
        // 챕터 이름은 그 챕터의 화면에 보이는 줄들 가운데에 둔다.
        const span = visible.slice(rowIndex).findIndex((other, offset) => offset > 0 && other.chapter !== row.chapter);
        const rows = span === -1 ? visible.length - rowIndex : span;
        const centerY = rowY + (rows * (rowHeight + rowGap) - rowGap) / 2;
        const [number, name] = splitChapter(row.chapter);
        if (number) {
          drawText(ctx, `${number}장`, right + 16, centerY - 9, { size: 12, color: COLOR.gold, family: "GalmuriMono11" });
          drawText(ctx, name, right + 16, centerY + 9, { size: 12, color: COLOR.muted, maxWidth: chapterWidth - 8, minSize: 9 });
        } else {
          drawText(ctx, name, right + 16, centerY, { size: 12, color: COLOR.gold, maxWidth: chapterWidth - 8, minSize: 9 });
        }
      }
      row.entries.forEach((mission, column) => {
        drawEntryCell(ctx, missionImageById.get(mission.mission_id) ?? null, mission.name,
          cellsX + column * (cellWidth + cellGap), rowY, cellWidth, rowHeight);
      });
    });
    const hidden = missionRows.slice(ACHIEVEMENT_ROWS).reduce((sum, row) => sum + row.entries.length, 0);
    if (hidden > 0) drawText(ctx, `외 ${hidden}개`, right + missionWidth - 16, achievementY + 22, { size: 12, color: COLOR.muted, align: "right" });
  }
  if (character.achieved_missions.length >= ALL_CLEAR_MISSIONS) drawAllClear(ctx, right + missionWidth - 16, achievementY + 22);

  bodyY = panel(ctx, challengeX, achievementY, challengeWidth, achievementHeight, "달성한 도전과제", `${challenges.length}개`);
  if (challenges.length === 0) {
    emptyNote(ctx, "아직 달성한 도전과제가 없습니다.", challengeX, bodyY, challengeWidth, achievementHeight - 44);
  } else {
    const cellGap = 8;
    const cellWidth = (challengeWidth - 32 - cellGap * (CHALLENGE_COLUMNS - 1)) / CHALLENGE_COLUMNS;
    const capacity = CHALLENGE_COLUMNS * ACHIEVEMENT_ROWS;
    challenges.slice(0, capacity).forEach((challenge, index) => {
      drawEntryCell(ctx, challengeImages[index], challenge.name,
        challengeX + 16 + (index % CHALLENGE_COLUMNS) * (cellWidth + cellGap),
        bodyY + Math.floor(index / CHALLENGE_COLUMNS) * (rowHeight + rowGap), cellWidth, rowHeight);
    });
    if (challenges.length > capacity) {
      drawText(ctx, `외 ${challenges.length - capacity}개`, challengeX + challengeWidth - 16, achievementY + 22, { size: 12, color: COLOR.muted, align: "right" });
    }
  }
  if (challenges.length >= ALL_CLEAR_CHALLENGES) drawAllClear(ctx, challengeX + challengeWidth - 16, achievementY + 22);

  // 보유 아이템(개수 포함)
  const itemsY = achievementY + achievementHeight + 16;
  const itemsHeight = MEMORY_HEIGHT - 48 - itemsY;
  bodyY = panel(ctx, right, itemsY, rightWidth, itemsHeight, "보유 아이템", `${ownedItems.length}종`);
  drawRightAlignedRun(ctx, [
    ...currencyParts("골드", COLOR.gold, character.gold, character.total_gold_earned),
    { text: "·", color: COLOR.line, size: 14 },
    ...currencyParts("CP", "#22d3ee", character.cp, character.total_cp_earned),
  ], right + rightWidth - 16, itemsY + 22);
  const itemColumns = 6;
  const itemGap = 8;
  const itemRowHeight = 40;
  const itemCellWidth = (rightWidth - 32 - itemGap * (itemColumns - 1)) / itemColumns;
  const itemRows = Math.floor((itemsY + itemsHeight - 12 - bodyY + rowGap) / (itemRowHeight + rowGap));
  const itemCapacity = itemColumns * itemRows;
  const overflow = ownedItems.length > itemCapacity;
  const shownItems = overflow ? ownedItems.slice(0, itemCapacity - 1) : ownedItems;
  shownItems.forEach((item, index) => {
    drawEntryCell(ctx, itemImages[index], item.name,
      right + 16 + (index % itemColumns) * (itemCellWidth + itemGap),
      bodyY + Math.floor(index / itemColumns) * (itemRowHeight + rowGap), itemCellWidth, itemRowHeight,
      `×${numberFormatter.format(item.count)}`);
  });
  if (overflow) {
    const index = shownItems.length;
    const x = right + 16 + (index % itemColumns) * (itemCellWidth + itemGap);
    const cellY = bodyY + Math.floor(index / itemColumns) * (itemRowHeight + rowGap);
    box(ctx, x, cellY, itemCellWidth, itemRowHeight, { fill: COLOR.cell, radius: 6 });
    drawText(ctx, `외 ${ownedItems.length - shownItems.length}종`, x + itemCellWidth / 2, cellY + itemRowHeight / 2, { size: 13, color: COLOR.muted, align: "center" });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("이미지를 만들지 못했습니다."))), "image/png");
  });
}
