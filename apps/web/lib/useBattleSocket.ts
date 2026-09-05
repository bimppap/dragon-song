"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { getToken } from "@/lib/token";
import type { BattlePhase, BattleSession, CharacterActionKind } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** 확정 전 초안 미리보기 페이로드. 카드 표시에 필요한 값(기술 아이콘, 방어/치유 대상)만 담는다. */
export interface BattleDraftPreviewEntry {
  kind: CharacterActionKind;
  skill_node_id: number | null;
  skill_name: string | null;
  skill_image_url: string | null;
  target_character_id: number | null;
  protect_target_character_id: number | null;
}

export type BattleDraftPreview = Record<number, BattleDraftPreviewEntry>;

export interface BattleEditingState {
  editor_id: number;
  editor_client_id: string;
  input_id: string;
  field: "action" | "target";
  active: boolean;
}

export interface BattleDraftPatch {
  editor_id: number;
  editor_client_id: string;
  draft_type: "character" | "enemy";
  entity_id: number;
  patch: Record<string, unknown>;
}

export type BattleWsMessage =
  | { type: "battle_update"; session: BattleSession }
  | { type: "battle_deleted"; session_id: number }
  | { type: "draft_preview"; phase: BattlePhase; draft: BattleDraftPreview }
  | ({ type: "editing_state" } & BattleEditingState)
  | ({ type: "draft_patch" } & BattleDraftPatch);

/**
 * 전투 세션 하나에 대한 WebSocket 연결을 관리한다. 외부 상태관리 라이브러리 없이
 * 네이티브 WebSocket + 지수 백오프 재연결만 사용한다(apps/web/CLAUDE.md 규칙 준수).
 * 연결이 끊긴 동안에는 각 화면의 기존 폴링이 폴백 역할을 한다.
 */
export function useBattleSocket(sessionId: number | null, onMessage: (msg: BattleWsMessage) => void) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [clientId] = useState(() => (
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  ));
  const attemptRef = useRef(0);
  const handleMessage = useEffectEvent((msg: BattleWsMessage) => onMessage(msg));

  useEffect(() => {
    if (sessionId == null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const token = getToken();
      if (!token) return;
      const base = API_URL.replace(/^http/, "ws");
      const ws = new WebSocket(`${base}/ws/battles/${sessionId}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;
      ws.onopen = () => {
        attemptRef.current = 0;
        setConnected(true);
      };
      ws.onmessage = (event) => {
        try {
          handleMessage(JSON.parse(event.data));
        } catch {
          // 잘못된 메시지는 무시한다.
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        const delay = Math.min(1000 * 2 ** attemptRef.current, 15000) + Math.random() * 500;
        attemptRef.current += 1;
        timer = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [sessionId]);

  const send = useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const payload = message != null && typeof message === "object" && !Array.isArray(message)
        ? { ...message, client_id: clientId }
        : message;
      wsRef.current.send(JSON.stringify(payload));
    }
  }, [clientId]);

  return { connected, send, clientId };
}
