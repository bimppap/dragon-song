"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { Sparkles } from "lucide-react";
import InfoTooltip from "@/components/common/InfoTooltip";
import { cn } from "@/lib/utils";
import type { SkillNode } from "@/lib/api";
import { type BookAccent } from "@/components/skill/bookAccent";

const DEFAULT_ACCENT: BookAccent = {
  text: "text-emerald-400",
  border: "border-emerald-500/60 text-emerald-500",
  line: "#e2e8f0",
};

export interface SkillTreeGridNode extends SkillNode {
  unlocked?: boolean;
}

// 노드 배치 좌표 상수 (컴팩트하게). 6열 × 7행(0~6단계) 그리드를 절대 좌표로 그린다.
const CELL_W = 52;
const CELL_H = 68;
const COLS = 6;
const ROWS = 7;
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <li>
      <span className="text-ivory/60">{label}</span> {value}
    </li>
  );
}

/**
 * 기술 정보 툴팁. 명칭·발동 타입·분류·중첩 가능·기술 대상·발동 순서·기술 설명은 러너에게도 보여주고,
 * 관리자에게는 그 외 관리자 전용 정보(기술 비용·위력·계산 공식)를 추가로 보여준다.
 */
export function SkillTooltipContent({
  node,
  variant,
  footer,
}: {
  node: SkillNode;
  variant: "runner" | "admin";
  footer?: ReactNode;
}) {
  // 0단계(서 아이덴티티 노드)는 실제 기술이 아니라 위치 표시용이라 이름만 보여준다.
  if (node.tier === 0) {
    return (
      <div className="max-w-64 text-left">
        <div className="font-semibold text-ivory">{node.default_name}</div>
        {footer ? <div className="mt-2">{footer}</div> : null}
      </div>
    );
  }

  const stackableText = node.stackable == null ? "정보 없음" : node.stackable ? "가능" : "불가능";

  return (
    <div className="max-w-64 text-left">
      <div className="flex items-center gap-1.5 font-semibold text-emerald-400">{node.default_name}</div>
      <ul className="mt-1.5 space-y-0.5 text-muted">
        <InfoRow label="발동 타입:" value={node.trigger_type ?? "정보 없음"} />
        <InfoRow label="분류:" value={node.category ?? "정보 없음"} />
        <InfoRow label="중첩 가능:" value={stackableText} />
        <InfoRow label="기술 대상:" value={node.target ?? "정보 없음"} />
        <InfoRow label="발동 순서:" value={node.activation_order != null ? String(node.activation_order) : "정보 없음"} />
        {variant === "admin" && (
          <>
            <InfoRow label="기술 비용:" value={node.cost != null ? String(node.cost) : "정보 없음"} />
            <InfoRow label="기술 위력:" value={node.power != null ? String(node.power) : "정보 없음"} />
            <InfoRow label="계산 공식:" value={node.formula ?? "정보 없음"} />
          </>
        )}
      </ul>
      {node.description && (
        <p className="mt-1.5 whitespace-pre-line border-t border-line pt-1.5 text-muted">{node.description}</p>
      )}
      {footer ? <div className="mt-2">{footer}</div> : null}
    </div>
  );
}

interface SkillTreeGridProps<T extends SkillTreeGridNode> {
  nodes: T[];
  getLabel: (node: T) => string;
  isHighlighted?: (node: T) => boolean;
  isDisabled?: (node: T) => boolean;
  isLocked?: (node: T) => boolean;
  onNodeClick?: (node: T) => void;
  showLabels?: boolean;
  /** 툴팁에 노출할 정보 범위. 러너는 제한된 필드만, 관리자는 변수명을 제외한 전부를 본다. */
  tooltipVariant?: "runner" | "admin";
  /** 서(book)별 테마 색상. 미지정 시 기본 에메랄드 색상을 사용한다. */
  accent?: BookAccent;
}

export default function SkillTreeGrid<T extends SkillTreeGridNode>({
  nodes,
  getLabel,
  isHighlighted,
  isDisabled,
  isLocked,
  onNodeClick,
  showLabels = true,
  tooltipVariant = "runner",
  accent = DEFAULT_ACCENT,
}: SkillTreeGridProps<T>) {
  const width = COLS * CELL_W;
  const height = ROWS * CELL_H;

  // 부모(하위 tier)와 잇는 연결선. tier1→기본, tier≥2→같은 계열/열의 한 단계 아래.
  // 마지막 단계(최고 티어)는 선행 관계가 로직상으로만 존재하고, 화면에는 선을 그리지 않는다.
  const lines = nodes
    .filter((node) => node.tier >= 1 && node.tier < ROWS - 1)
    .map((node) => {
      const child = cellFor(node.branch, node.col, node.tier);
      const parent =
        node.tier === 1
          ? cellFor(null, null, 0)
          : cellFor(node.branch, node.col, node.tier - 1);
      return { id: node.id, child, parent, active: Boolean(node.unlocked) && !(isLocked?.(node) ?? false) };
    });

  return (
    <div className="relative" style={{ width, height }}>
      <svg
        className="pointer-events-none absolute inset-0"
        width={width}
        height={height}
        aria-hidden
      >
        {lines.map((line) => {
          // 부모-자식 x좌표가 다르면(계열 분기 등) 대각선 대신 수직-수평-수직 꺾임선으로 잇는다.
          const midY = (line.parent.cy + line.child.cy) / 2;
          const d = `M ${line.parent.cx} ${line.parent.cy} V ${midY} H ${line.child.cx} V ${line.child.cy}`;
          return (
            <path
              key={line.id}
              d={d}
              fill="none"
              stroke={line.active ? "#d97706" : accent.line}
              strokeWidth={2}
            />
          );
        })}
      </svg>

      {nodes.map((node) => {
        const cell = cellFor(node.branch, node.col, node.tier);
        const locked = isLocked?.(node) ?? false;
        const highlighted = !locked && (isHighlighted?.(node) ?? false);
        const disabled = locked || (isDisabled?.(node) ?? false);
        const clickable = Boolean(onNodeClick) && !disabled;

        const nodeButton = (
          <button
              key={node.id}
              type="button"
              aria-label={locked ? "비공개 기술" : getLabel(node)}
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
                "z-10 flex flex-col items-center gap-1 pt-1 text-center",
                clickable ? "cursor-pointer" : "cursor-default",
                disabled && !highlighted ? "grayscale" : "",
              )}
            >
              <span
                className={cn(
                  "relative flex size-10 shrink-0 items-center justify-center overflow-hidden border-2 bg-surface transition-colors",
                  highlighted
                    ? "border-gold bg-[#3b321f] text-gold shadow-[0_0_0_3px_rgba(245,158,11,0.25)]"
                    : disabled ? "border-line bg-inset text-muted" : "border-line text-muted",
                  !locked && !highlighted && node.tier !== 0 ? accent.border : "",
                  clickable && !highlighted ? "hover:border-gold" : "",
                )}
              >
                {locked ? (
                  <Image src="/skill/private_skill.png" alt="비공개 기술" fill sizes="40px" className="object-cover" />
                ) : node.image_url ? (
                  <Image src={node.image_url} alt="" fill sizes="40px" className="object-cover" />
                ) : (
                  <Sparkles size={18} />
                )}
              </span>
              {showLabels && !locked && (
                <span
                  className={cn(
                    "line-clamp-2 text-[10px] font-semibold leading-tight",
                    highlighted ? "text-gold" : node.tier !== 0 ? accent.text : "text-ivory/85",
                  )}
                >
                  {getLabel(node)}
                </span>
              )}
          </button>
        );

        return locked ? nodeButton : (
          <InfoTooltip
            key={node.id}
            side="top"
            content={<SkillTooltipContent node={node} variant={tooltipVariant} />}
          >
            {nodeButton}
          </InfoTooltip>
        );
      })}
    </div>
  );
}
