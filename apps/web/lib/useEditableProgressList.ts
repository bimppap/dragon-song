"use client";

import { useCallback, useState } from "react";

export interface ProgressEntryBase {
  character_id: number;
  achieved: boolean;
  reward_paid: boolean;
}

interface UseEditableProgressListOptions<T extends ProgressEntryBase> {
  onSave: (entries: T[]) => Promise<T[]>;
  successMessage: string;
  errorMessage: string;
  toast: (message: string, tone: "success" | "error" | "info") => void;
}

/** 임무/도전과제 현황처럼 캐릭터별 달성 여부를 편집 모드로 진입해 한꺼번에 저장하는 화면에서 공용으로 쓰는 상태 관리. */
export function useEditableProgressList<T extends ProgressEntryBase>({
  onSave,
  successMessage,
  errorMessage,
  toast,
}: UseEditableProgressListOptions<T>) {
  const [entries, setEntries] = useState<T[]>([]);
  const [backup, setBackup] = useState<T[] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  /** 선택 대상(임무/도전과제)이 바뀌어 새로 로드할 때 편집 상태를 초기화한다.
   *  다른 렌더에서도 참조가 바뀌지 않아야 effect 의존성 배열에 안전하게 넣을 수 있다. */
  const resetEditing = useCallback(() => {
    setIsEditing(false);
    setBackup(null);
  }, []);

  function startEdit() {
    setBackup(entries);
    setIsEditing(true);
  }

  function cancelEdit() {
    if (backup) setEntries(backup);
    setBackup(null);
    setIsEditing(false);
  }

  /** 편집 모드에서 체크박스를 누르면 서버에 바로 반영하지 않고 화면에만 표시한다. "저장"을 눌러야 한꺼번에 저장된다. */
  function toggle(characterId: number, achieved: boolean) {
    const target = entries.find((e) => e.character_id === characterId);
    if (target?.reward_paid && !achieved) return;
    setEntries((prev) => prev.map((e) => (e.character_id === characterId ? { ...e, achieved } : e)));
  }

  async function save() {
    try {
      setSaving(true);
      const updated = await onSave(entries);
      setEntries(updated);
      setBackup(null);
      setIsEditing(false);
      toast(successMessage, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : errorMessage, "error");
    } finally {
      setSaving(false);
    }
  }

  function markRewardPaid(characterIds: Set<number>) {
    if (characterIds.size === 0) return;
    setEntries((prev) => prev.map((e) => (characterIds.has(e.character_id) ? { ...e, reward_paid: true } : e)));
  }

  return {
    entries,
    setEntries,
    isEditing,
    saving,
    resetEditing,
    startEdit,
    cancelEdit,
    toggle,
    save,
    markRewardPaid,
  };
}
