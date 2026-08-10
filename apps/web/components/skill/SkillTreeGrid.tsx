"use client";

import { cn } from "@/lib/utils";
import type { SkillNode } from "@/lib/api";

export interface SkillTreeGridNode extends SkillNode {
  unlocked?: boolean;
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
  return (
    <div className="grid grid-cols-6 gap-2" style={{ gridTemplateRows: "repeat(6, minmax(52px, auto))" }}>
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

        return (
          <button
            key={node.id}
            type="button"
            disabled={!clickable}
            onClick={() => onNodeClick?.(node)}
            style={{ gridRow: row, gridColumn: `${colStart} / span ${colSpan}` }}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 rounded-lg border-2 px-2 py-2 text-center transition-colors",
              highlighted
                ? "border-indigo-600 bg-indigo-50 shadow-[0_0_0_3px_rgba(79,70,229,0.18)]"
                : "border-slate-200 bg-white",
              clickable ? "hover:border-indigo-400 cursor-pointer" : "cursor-default",
              disabled && !highlighted ? "opacity-45" : "",
            )}
          >
            <span className={cn("text-xs font-semibold leading-tight", highlighted ? "text-indigo-700" : "text-slate-600")}>
              {getLabel(node)}
            </span>
            <span className="text-[10px] text-slate-400">{node.tier_label}</span>
          </button>
        );
      })}
    </div>
  );
}
