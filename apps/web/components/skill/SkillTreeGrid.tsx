"use client";

import { Sparkles } from "lucide-react";
import InfoTooltip from "@/components/common/InfoTooltip";
import { cn } from "@/lib/utils";
import { formatEffect, type ItemEffect, type SkillNode } from "@/lib/api";

export interface SkillTreeGridNode extends SkillNode {
  unlocked?: boolean;
}

// 노드 배치 좌표 상수 (컴팩트하게). 6열 × 6행 그리드를 절대 좌표로 그린다.
const CELL_W = 52;
const CELL_H = 68;
const COLS = 6;
const ROWS = 6;
const ICON = 40; // size-10
const ICON_TOP = 4;
const ICON_CENTER_Y = ICON_TOP + ICON / 2;

interface Cell {
  startCol: number;
  span: number;
  row: number;
  cx: number;
  cy: number;
}

/** branch/col/tier 로부터 셀 위치(열 시작·너비·행)와 아이콘 중심 좌표를 계산한다. */
function cellFor(branch: number | null, col: number | null, tier: number): Cell {
  const row = ROWS - 1 - tier;
  let startCol: number;
  let span: number;
  if (tier === 0) {
    startCol = 0;
    span = COLS;
  } else if (tier === 1) {
    startCol = (branch ?? 0) * 2;
    span = 2;
  } else {
    startCol = (branch ?? 0) * 2 + (col ?? 0);
    span = 1;
  }
  return {
    startCol,
    span,
    row,
    cx: (startCol + span / 2) * CELL_W,
    cy: row * CELL_H + ICON_CENTER_Y,
  };
}

/** 기술 이름 + 효과 목록을 보여주는 공용 툴팁 내용. */
export function SkillTooltipContent({ name, effects }: { name: string; effects: ItemEffect[] }) {
  return (
    <div className="max-w-56 text-left">
      <div className="font-semibold">{name}</div>
      {effects.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-slate-300">
          {effects.map((effect, index) => (
            <li key={index}>{formatEffect(effect)}</li>
          ))}
        </ul>
      ) : (
        <div className="mt-1 text-slate-400 dark:text-slate-500">효과 없음</div>
      )}
    </div>
  );
}

interface SkillTreeGridProps<T extends SkillTreeGridNode> {
  nodes: T[];
  getLabel: (node: T) => string;
  isHighlighted?: (node: T) => boolean;
  isDisabled?: (node: T) => boolean;
  onNodeClick?: (node: T) => void;
}

export default function SkillTreeGrid<T extends SkillTreeGridNode>({
  nodes,
  getLabel,
  isHighlighted,
  isDisabled,
  onNodeClick,
}: SkillTreeGridProps<T>) {
  const width = COLS * CELL_W;
  const height = ROWS * CELL_H;

  // 부모(하위 tier)와 잇는 연결선. tier1→기본, tier≥2→같은 계열/열의 한 단계 아래.
  const lines = nodes
    .filter((node) => node.tier >= 1)
    .map((node) => {
      const child = cellFor(node.branch, node.col, node.tier);
      const parent =
        node.tier === 1
          ? cellFor(null, null, 0)
          : cellFor(node.branch, node.col, node.tier - 1);
      return { id: node.id, child, parent, active: Boolean(node.unlocked) };
    });

  return (
    <div className="relative" style={{ width, height }}>
      <svg
        className="pointer-events-none absolute inset-0"
        width={width}
        height={height}
        aria-hidden
      >
        {lines.map((line) => (
          <line
            key={line.id}
            x1={line.parent.cx}
            y1={line.parent.cy}
            x2={line.child.cx}
            y2={line.child.cy}
            stroke={line.active ? "#4f46e5" : "#e2e8f0"}
            strokeWidth={2}
          />
        ))}
      </svg>

      {nodes.map((node) => {
        const cell = cellFor(node.branch, node.col, node.tier);
        const highlighted = isHighlighted?.(node) ?? false;
        const disabled = isDisabled?.(node) ?? false;
        const clickable = Boolean(onNodeClick) && !disabled;

        return (
          <InfoTooltip
            key={node.id}
            side="top"
            content={<SkillTooltipContent name={getLabel(node)} effects={node.effects} />}
          >
            <button
              type="button"
              aria-disabled={!clickable}
              onClick={clickable ? () => onNodeClick?.(node) : undefined}
              style={{
                position: "absolute",
                left: cell.startCol * CELL_W,
                top: cell.row * CELL_H,
                width: cell.span * CELL_W,
                height: CELL_H,
              }}
              className={cn(
                "flex flex-col items-center gap-1 pt-1 text-center",
                clickable ? "cursor-pointer" : "cursor-default",
                disabled && !highlighted ? "opacity-45" : "",
              )}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 bg-white dark:bg-slate-900 transition-colors",
                  highlighted
                    ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 shadow-[0_0_0_3px_rgba(79,70,229,0.18)]"
                    : "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500",
                  clickable && !highlighted ? "hover:border-indigo-400" : "",
                )}
              >
                {node.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={node.image_url} alt="" className="size-full object-cover" />
                ) : (
                  <Sparkles size={18} />
                )}
              </span>
              <span
                className={cn(
                  "line-clamp-2 text-[10px] font-semibold leading-tight",
                  highlighted ? "text-indigo-700" : "text-slate-600 dark:text-slate-300",
                )}
              >
                {getLabel(node)}
              </span>
            </button>
          </InfoTooltip>
        );
      })}
    </div>
  );
}
