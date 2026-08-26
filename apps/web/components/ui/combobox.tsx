"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

/** 검색 가능한 드롭다운. Radix Select는 타이핑 검색을 지원하지 않아 직접 구현한다. */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "선택",
  searchPlaceholder = "검색...",
  emptyText = "결과가 없습니다.",
  className,
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = options.find((option) => option.value === value) ?? null;

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [options, query]);

  React.useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  React.useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function openDropdown() {
    setQuery("");
    setOpen(true);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ivory transition",
          "focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className={cn("flex min-w-0 items-center gap-2 truncate", !selected && "text-muted")}>
          {selected?.icon}
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className="shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-md">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search size={14} className="shrink-0 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm text-ivory placeholder:text-muted focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted">{emptyText}</p>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ivory transition-colors",
                    "hover:bg-gold/10 hover:text-gold",
                  )}
                >
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {option.value === value && <Check size={14} className="text-gold" />}
                  </span>
                  {option.icon}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
