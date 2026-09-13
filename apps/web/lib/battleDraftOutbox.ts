import type { BattleWsMessage } from "./useBattleSocket";

type PendingPatch = {
  type: "draft_patch";
  version: string;
  draft_type: "character" | "enemy";
  entity_id: number;
  patch: Record<string, unknown>;
  patch_id: string;
};

/** Keep unacknowledged fields, including writes interrupted just before a disconnect. */
export class BattleDraftOutbox {
  private pending = new Map<string, PendingPatch>();
  private sequence = 0;

  get size() { return this.pending.size; }
  values() { return this.pending.values(); }
  clear() { this.pending.clear(); }

  add(message: Omit<PendingPatch, "patch_id">): PendingPatch {
    const key = `${message.draft_type}:${message.entity_id}`;
    const previous = this.pending.get(key);
    const next = {
      ...message,
      patch: { ...(previous?.version === message.version ? previous.patch : {}), ...message.patch },
      patch_id: String(++this.sequence),
    };
    this.pending.set(key, next);
    return next;
  }

  reconcile(message: BattleWsMessage, clientId: string): BattleWsMessage {
    if (message.type === "battle_deleted") this.clear();
    if (message.type === "battle_update") {
      for (const [key, patch] of this.pending) {
        if (patch.version < message.session.updated_at || message.session.status !== "in_progress") this.pending.delete(key);
      }
      if (!message.draft || !this.size) return message;
      const draft = { character: { ...message.draft.character }, enemy: { ...message.draft.enemy } };
      for (const pending of this.values()) {
        if (pending.version !== message.session.updated_at) continue;
        const group = draft[pending.draft_type];
        group[pending.entity_id] = { ...group[pending.entity_id], ...pending.patch };
      }
      return { ...message, draft };
    }
    if (message.type === "draft_patch") {
      const key = `${message.draft_type}:${message.entity_id}`;
      const pending = this.pending.get(key);
      if (pending?.version !== message.version) return message;
      if (message.editor_client_id === clientId && message.patch_id === pending.patch_id) {
        this.pending.delete(key);
      } else {
        return { ...message, patch: { ...message.patch, ...pending.patch } };
      }
    }
    return message;
  }
}
