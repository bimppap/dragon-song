"use client";

import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import InfoTooltip from "@/components/common/InfoTooltip";
import { cn } from "@/lib/utils";
import { formatEffect, type ItemEffect, type SkillNode } from "@/lib/api";

export interface SkillTreeGridNode extends SkillNode {
  unlocked?: boolean;
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
        <div className="mt-1 text-slate-400">효과 없음</div>
      )}
    </div>
  );
}

interface SkillTreeGridProps<T extends SkillTreeGridNode> {
  nodes: T[];
  getLabel: (node: T) => string;
  getTooltip?: (node: T) => ReactNode;
  isHighlighted?: (node: T) => boolean;
  isDisabled?: (node: T) => boolean;
  onNodeClick?: (node: T) => void;
}

export default function SkillTreeGrid<T extends SkillTreeGridNode>({
  nodes,
  getLabel,
  getTooltip,
  isHighlighted,
  isDisabled,
  onNodeClick,
}: SkillTreeGridProps<T>) {
  return (
    <div className="grid grid-cols-6 gap-2" style={{ gridTemplateRows: "repeat(6, minmax(72px, auto))" }}>
      {nodes.map((node) => {
        const row = 6 - node.tier;
        let colStart: number;
        let colSpan: number;
        if (node.tier === 0) {
          colStart = 1;
          colSpan = 6;
        } else if (node.tier === 1) {
          colStart = (node.branch ?? 0) * 2 + 1;
          colSpan = 2;
        } else {
          colStart = (node.branch ?? 0) * 2 + (node.col ?? 0) + 1;
          colSpan = 1;
        }
        const highlighted = isHighlighted?.(node) ?? false;
        const disabled = isDisabled?.(node) ?? false;
        const clickable = Boolean(onNodeClick) && !disabled;
        const tooltip = getTooltip?.(node) ?? (
          <SkillTooltipContent name={getLabel(node)} effects={node.effects} />
        );

        const tile = (
          <button
            type="button"
            aria-disabled={!clickable}
            onClick={clickable ? () => onNodeClick?.(node) : undefined}
            style={{ gridRow: row, gridColumn: `${colStart} / span ${colSpan}` }}
            className={cn(
              "flex flex-col items-center justify-start gap-1.5 rounded-lg px-2 py-2 text-center transition-colors",
              clickable ? "cursor-pointer" : "cursor-default",
              disabled && !highlighted ? "opacity-45" : "",
            )}
          >
            <span
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-xl border-2 transition-colors",
                highlighted
                  ? "border-indigo-600 bg-indigo-50 text-indigo-600 shadow-[0_0_0_3px_rgba(79,70,229,0.18)]"
                  : "border-slate-200 bg-white text-slate-400",
                clickable && !highlighted ? "hover:border-indigo-400" : "",
              )}
            >
              <Sparkles size={20} />
            </span>
            <span className={cn("text-xs font-semibold leading-tight", highlighted ? "text-indigo-700" : "text-slate-600")}>
              {getLabel(node)}
            </span>
            <span className="text-[10px] text-slate-400">{node.tier_label}</span>
          </button>
        );

        return (
          <InfoTooltip key={node.id} side="top" content={tooltip}>
            {tile}
          </InfoTooltip>
        );
      })}
    </div>
  );
}
