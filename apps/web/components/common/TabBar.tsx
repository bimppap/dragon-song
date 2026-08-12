"use client";

import type { ElementType } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: ElementType;
}

interface Props<T extends string> {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}

/** 공통 탭 바. 모바일에서는 가로 스크롤로 넘친 탭을 볼 수 있다. */
export default function TabBar<T extends string>({ tabs, active, onChange, className }: Props<T>) {
  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700", className)}>
      {tabs.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          variant="ghost"
          onClick={() => onChange(id)}
          className={cn(
            "-mb-px h-11 shrink-0 gap-2 whitespace-nowrap rounded-none border-b-2 px-4 font-semibold sm:px-5",
            active === id
              ? "border-indigo-600 bg-transparent text-indigo-600 hover:bg-transparent hover:text-indigo-600"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:bg-transparent hover:text-slate-800",
          )}
        >
          {Icon && <Icon size={15} />}
          {label}
        </Button>
      ))}
    </div>
  );
}
