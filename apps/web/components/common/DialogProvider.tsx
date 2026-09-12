"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DialogOptions {
  title?: string;
  description?: string;
  /** description 아래에 표시할 커스텀 콘텐츠 (예: 대상 목록). */
  content?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "danger";
  /** 팝업 최대 너비 (Tailwind max-w-* 클래스). 기본은 max-w-sm. */
  maxWidthClassName?: string;
  /** Enter 키로 확인되지 않게 한다(확인 버튼 자동 포커스도 끈다).
   *  선물 전송처럼 실수로 보내면 되돌리기 어려운 창에 쓴다. */
  disableEnterConfirm?: boolean;
}

type DialogInput = string | DialogOptions;

interface DialogState extends DialogOptions {
  mode: "confirm" | "alert" | "prompt";
  initialValue?: string;
  resolve: (value: boolean | string | null) => void;
}

interface DialogContextValue {
  /** 확인/취소 팝업. 확인 시 true, 취소 시 false. */
  confirm: (input: DialogInput) => Promise<boolean>;
  /** 안내 팝업. 확인 버튼만 있으며 항상 닫힌다. */
  alert: (input: DialogInput) => Promise<void>;
  /** 텍스트 입력 팝업. 확인 시 입력값, 취소 시 null. */
  prompt: (input: DialogInput, initialValue?: string) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function normalize(input: DialogInput): DialogOptions {
  return typeof input === "string" ? { description: input } : input;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [promptValue, setPromptValue] = useState("");

  const confirm = useCallback(
    (input: DialogInput) =>
      new Promise<boolean>((resolve) => {
        setDialog({ mode: "confirm", ...normalize(input), resolve: (value) => resolve(Boolean(value)) });
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

  const prompt = useCallback(
    (input: DialogInput, initialValue = "") =>
      new Promise<string | null>((resolve) => {
        setPromptValue(initialValue);
        setDialog({
          mode: "prompt",
          initialValue,
          ...normalize(input),
          resolve: (value) => resolve(typeof value === "string" ? value : null),
        });
      }),
    [],
  );

  const close = useCallback((value: boolean | string | null) => {
    setDialog((prev) => {
      prev?.resolve(value);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const isPrompt = dialog.mode === "prompt";
    const enterConfirms = !dialog.disableEnterConfirm;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter" && enterConfirms) close(isPrompt ? promptValue : true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, close, promptValue]);

  return (
    <DialogContext.Provider value={{ confirm, alert, prompt }}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-200 flex items-center justify-center bg-black/50 p-4"
          onClick={() => close(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className={cn("pixel-frame w-full bg-surface p-6", dialog.maxWidthClassName ?? "max-w-sm")}
            onClick={(e) => e.stopPropagation()}
          >
            {dialog.title && <h2 className="text-base font-bold text-ivory">{dialog.title}</h2>}
            {dialog.description && (
              <p className={cn("whitespace-pre-line text-sm text-ivory/85", dialog.title ? "mt-2" : "")}>{dialog.description}</p>
            )}
            {dialog.content}
            {dialog.mode === "prompt" && (
              <Input
                className="mt-4"
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
                autoFocus
              />
            )}
            <div className="mt-6 flex justify-end gap-2">
              {(dialog.mode === "confirm" || dialog.mode === "prompt") && (
                <Button variant="outline" size="sm" onClick={() => close(dialog.mode === "prompt" ? null : false)}>
                  {dialog.cancelText ?? "취소"}
                </Button>
              )}
              <Button
                size="sm"
                variant={dialog.tone === "danger" ? "destructive" : "default"}
                onClick={() => close(dialog.mode === "prompt" ? promptValue : true)}
                // 자동 포커스된 버튼은 Enter로도 눌리므로, Enter 확인을 끈 창에서는 포커스도 주지 않는다.
                autoFocus={dialog.mode !== "prompt" && !dialog.disableEnterConfirm}
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
