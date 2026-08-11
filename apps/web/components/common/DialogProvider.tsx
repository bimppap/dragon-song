"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DialogOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "danger";
}

type DialogInput = string | DialogOptions;

interface DialogState extends DialogOptions {
  mode: "confirm" | "alert";
  resolve: (value: boolean) => void;
}

interface DialogContextValue {
  /** 확인/취소 팝업. 확인 시 true, 취소 시 false. */
  confirm: (input: DialogInput) => Promise<boolean>;
  /** 안내 팝업. 확인 버튼만 있으며 항상 닫힌다. */
  alert: (input: DialogInput) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function normalize(input: DialogInput): DialogOptions {
  return typeof input === "string" ? { description: input } : input;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const confirm = useCallback(
    (input: DialogInput) =>
      new Promise<boolean>((resolve) => {
        setDialog({ mode: "confirm", ...normalize(input), resolve });
      }),
    [],
  );

  const alert = useCallback(
    (input: DialogInput) =>
      new Promise<void>((resolve) => {
        setDialog({ mode: "alert", ...normalize(input), resolve: () => resolve() });
      }),
    [],
  );

  const close = useCallback((value: boolean) => {
    setDialog((prev) => {
      prev?.resolve(value);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!dialog) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter") close(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, close]);

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => close(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {dialog.title && <h2 className="text-base font-bold text-slate-900">{dialog.title}</h2>}
            {dialog.description && (
              <p className={cn("text-sm text-slate-600", dialog.title ? "mt-2" : "")}>{dialog.description}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              {dialog.mode === "confirm" && (
                <Button variant="outline" size="sm" onClick={() => close(false)}>
                  {dialog.cancelText ?? "취소"}
                </Button>
              )}
              <Button
                size="sm"
                variant={dialog.tone === "danger" ? "destructive" : "default"}
                onClick={() => close(true)}
                autoFocus
              >
                {dialog.confirmText ?? "확인"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog는 DialogProvider 내부에서만 사용할 수 있습니다.");
  return ctx;
}
