import type { CharacterDetail, CharacterOwnedItem, CharacterSkillNode, SkillBook } from "@/lib/api";
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

const GROUP_BADGE = { name: "조사단 증표", imageUrl: "/group_badge.png" };

export interface MemoryImageData {
  character: CharacterDetail;
  /** 가장 깊이 배운 기술(정보 카드의 기술 슬롯과 같다). */
  skill: CharacterSkillNode | null;
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

/** 제목·개수가 붙은 패널 테두리. 본문이 시작되는 y를 돌려준다. */
function panel(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, count?: string,
): number {
  box(ctx, x, y, w, h, { fill: COLOR.inset, stroke: COLOR.line, radius: 10 });
  drawText(ctx, title, x + 16, y + 22, { size: 16, color: COLOR.gold, bold: true });
  if (count) drawText(ctx, count, x + w - 16, y + 22, { size: 13, color: COLOR.muted, align: "right", family: "GalmuriMono11" });
  return y + 44;
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

/** 위에 작은 라벨, 아래에 큰 값을 쓰는 칸. */
function drawValueBox(
  ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number, w: number, h: number,
  valueColor: string = COLOR.gold,
) {
  box(ctx, x, y, w, h, { fill: COLOR.inset, stroke: COLOR.line });
  drawText(ctx, label, x + 12, y + 18, { size: 12, color: COLOR.muted });
  drawText(ctx, value, x + 12, y + h - 18, { size: 18, color: valueColor, family: "GalmuriMono11", maxWidth: w - 24, minSize: 12 });
}

function drawCurrencyBox(
  ctx: CanvasRenderingContext2D, label: string, color: string, current: number, total: number,
  x: number, y: number, w: number, h: number,
) {
  box(ctx, x, y, w, h, { fill: COLOR.inset, stroke: COLOR.line });
  drawText(ctx, label, x + 12, y + 18, { size: 13, color, bold: true });
  for (const [index, [name, value]] of ([["현재", current], ["누적", total]] as const).entries()) {
    const rowY = y + 44 + index * 24;
    drawText(ctx, name, x + 12, rowY, { size: 12, color: COLOR.muted });
    drawText(ctx, numberFormatter.format(value), x + w - 12, rowY, {
      size: 15, align: "right", family: "GalmuriMono11", maxWidth: w - 60, minSize: 11,
    });
  }
}

function drawLoadoutCard(
  ctx: CanvasRenderingContext2D, label: string, name: string | null, image: HTMLImageElement | null,
  border: string, x: number, y: number, w: number, h: number,
) {
  box(ctx, x, y, w, h, { fill: COLOR.inset, stroke: COLOR.line });
  const iconSize = h - 24;
  drawIcon(ctx, name ? image : null, x + 12, y + 12, iconSize, name ? border : COLOR.line);
  const textX = x + 24 + iconSize;
  drawText(ctx, label, textX, y + h / 2 - 12, { size: 12, color: COLOR.muted });
  drawText(ctx, name ?? "없음", textX, y + h / 2 + 12, {
    size: 16, color: name ? COLOR.ivory : COLOR.muted, maxWidth: x + w - 12 - textX, minSize: 11,
  });
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

export async function renderCharacterMemory({ character, skill }: MemoryImageData): Promise<Blob> {
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
    image("/dragonsong_title.png"),
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

  // ── 왼쪽: 프로필·성장·능력치·재화 ──
  const left = 48;
  const leftWidth = 288;
  const frameX = left + (leftWidth - 240) / 2;
  const frameY = 52;
  if (frame) drawContain(ctx, frame, frameX, frameY, 240, 240);
  if (photo) drawCover(ctx, photo, frameX + 20, frameY + 20, 200, 200);
  if (medal) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 4;
    drawContain(ctx, medal, frameX - 20, frameY - 20, 72, 72);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  }

  const halfWidth = (leftWidth - 12) / 2;
  let y = frameY + 256;
  drawValueBox(ctx, "성장 등급", `Lv.${character.lv}`, left, y, halfWidth, 60);
  const totalExp = Math.max(0, (character.lv - 1) * GROWTH_EXP_PER_LEVEL + character.exp);
  drawValueBox(ctx, "총 획득 경험치", `${numberFormatter.format(totalExp)} EXP`, left + halfWidth + 12, y, halfWidth, 60);

  y += 80;
  drawBar(ctx, "HP", character.hp, character.hp_max, COLOR.hp, left, y, leftWidth);
  y += 46;
  drawBar(ctx, "MP", character.mp, character.mp_max, COLOR.mp, left, y, leftWidth);

  y += 52;
  GRADE_STATS.forEach((stat, index) => {
    const x = left + (index % 2) * (halfWidth + 12);
    const cellY = y + Math.floor(index / 2) * 52;
    box(ctx, x, cellY, halfWidth, 42, { fill: COLOR.inset, stroke: COLOR.line });
    drawText(ctx, stat.label, x + 12, cellY + 21, { size: 15, color: stat.color, bold: true });
    drawText(ctx, String(character[stat.key]), x + halfWidth - 12, cellY + 21, { size: 18, align: "right", family: "GalmuriMono11" });
  });

  y += 112;
  drawCurrencyBox(ctx, "골드", COLOR.gold, character.gold, character.total_gold_earned, left, y, halfWidth, 92);
  drawCurrencyBox(ctx, "CP", "#22d3ee", character.cp, character.total_cp_earned, left + halfWidth + 12, y, halfWidth, 92);

  if (title) {
    // 원본은 좌우·위아래 여백이 넓어 글자 부분만 잘라 쓴다.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(title, 290, 70, 500, 130, left + (leftWidth - 250) / 2, MEMORY_HEIGHT - 48 - 65 - 8, 250, 65);
  }

  // ── 오른쪽 ──
  const right = 368;
  const rightWidth = MEMORY_WIDTH - 48 - right;

  drawNameBanner(ctx, character.name, faction, right, 48);
  drawText(ctx, todayLabel(), right + rightWidth, 66, { size: 14, color: COLOR.muted, align: "right", family: "GalmuriMono11" });
  drawText(ctx, `모험가 등급 · ${grade.name}패`, right + rightWidth, 92, { size: 13, color: COLOR.gold, align: "right" });

  // 기술·동반자·장신구·특성
  const loadoutY = 132;
  const loadoutWidth = (rightWidth - 36) / 4;
  const loadout = [
    { label: "기술", name: skill?.display_name ?? null, image: skillImage, border: skill ? BOOK_COLOR[skill.book] : COLOR.gold },
    { label: "동반자", name: companion?.item_name ?? null, image: companionImage, border: COLOR.gold },
    { label: "장신구", name: accessory?.item_name ?? null, image: accessoryImage, border: COLOR.gold },
    { label: "특성", name: trait?.name ?? null, image: traitImage, border: COLOR.gold },
  ];
  loadout.forEach((slot, index) => {
    drawLoadoutCard(ctx, slot.label, slot.name, slot.image, slot.border, right + index * (loadoutWidth + 12), loadoutY, loadoutWidth, 76);
  });

  // 달성 임무(4개씩, 챕터별) · 도전과제(2개씩)
  const achievementY = 228;
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
    if (hidden > 0) drawText(ctx, `외 ${hidden}개`, right + missionWidth - 90, achievementY + 22, { size: 12, color: COLOR.muted, align: "right" });
  }

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
      drawText(ctx, `외 ${challenges.length - capacity}개`, challengeX + challengeWidth - 70, achievementY + 22, { size: 12, color: COLOR.muted, align: "right" });
    }
  }

  // 보유 아이템(개수 포함)
  const itemsY = achievementY + achievementHeight + 16;
  const itemsHeight = MEMORY_HEIGHT - 48 - itemsY;
  bodyY = panel(ctx, right, itemsY, rightWidth, itemsHeight, "보유 아이템", `${ownedItems.length}종`);
  const itemColumns = 5;
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
