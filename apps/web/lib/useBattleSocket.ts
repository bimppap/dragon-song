"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { getToken } from "@/lib/token";
import type { BattleSession, CharacterActionKind } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** 확정 전 초안 미리보기 페이로드. 카드 표시에 필요한 값(기술/아이템 아이콘, 행동 대상)만 담는다. */
export interface BattleDraftPreviewEntry {
  ally_target_ids?: number[];
  kind: CharacterActionKind;
  skill_node_id: number | null;
  skill_name: string | null;
  skill_image_url: string | null;
  /** 러너 화면은 기술 목록을 받지 않아 노드 id로 설명을 찾을 수 없다. 이름·이미지와 같이 실어 보낸다. */
  skill_description: string | null;
  item_id: number | null;
  item_name: string | null;
  item_image_url: string | null;
  target_character_id: number | null;
  protect_target_character_id: number | null;
  /**
   * 관리자 화면에서 이미 해석해 둔 행동 대상 이름. 러너 화면은 에너미/하수인/아군을
   * 한 번에 가리키는 이름 목록이 필요한데, 식별자만 보내면 종류별로 다시 찾아야 해서
   * 표시용 문자열로 보낸다. 아직 대상을 고르지 않았으면 빈 배열이다.
   */
  target_names: string[];
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

export interface BattleDraftSnapshot {
  character?: Record<string, Record<string, unknown>>;
  enemy?: Record<string, Record<string, unknown>>;
}

export type BattleWsMessage =
  | { type: "battle_update"; session: BattleSession; draft?: BattleDraftSnapshot; preview: BattleDraftPreview | null }
  | { type: "battle_deleted"; session_id: number }
  | { type: "draft_preview"; version: string; draft: BattleDraftPreview }
  | ({ type: "editing_state"; version: string } & BattleEditingState)
  | ({ type: "draft_patch"; version: string } & BattleDraftPatch);

/**
 * 전투 세션 하나에 대한 WebSocket 연결을 관리한다. 외부 상태관리 라이브러리 없이
 * 네이티브 WebSocket + 지수 백오프 재연결만 사용한다(apps/web/CLAUDE.md 규칙 준수).
 * 연결이 끊긴 동안에는 각 화면의 기존 폴링이 폴백 역할을 한다.
 */
export function useBattleSocket(sessionId: number | null, onMessage: (msg: BattleWsMessage) => void) {
  const [connectedSessionId, setConnectedSessionId] = useState<number | null>(null);
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
        if (cancelled || wsRef.current !== ws) return;
        attemptRef.current = 0;
        setConnectedSessionId(sessionId);
      };
      ws.onmessage = (event) => {
        if (cancelled || wsRef.current !== ws) return;
        try {
          handleMessage(JSON.parse(event.data));
        } catch {
          // 잘못된 메시지는 무시한다.
        }
      };
      ws.onclose = () => {
        if (cancelled || wsRef.current !== ws) return;
        setConnectedSessionId(null);
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

  return { connected: sessionId != null && connectedSessionId === sessionId, send, clientId };
}
