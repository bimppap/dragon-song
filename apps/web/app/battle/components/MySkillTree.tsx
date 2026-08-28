"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import SkillTreeGrid from "@/components/skill/SkillTreeGrid";
import { BOOK_ACCENT } from "@/components/skill/bookAccent";
import {
  fetchCharacterSkillTree,
  formatEffect,
  renameCharacterSkill,
  unlockCharacterSkill,
  type CharacterSkillNode,
  type CharacterSkillTree,
  type SkillBook,
} from "@/lib/api";
import { useDialog } from "@/components/common/DialogProvider";
import { useToast } from "@/components/common/ToastProvider";

const BOOKS: SkillBook[] = ["용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"];
const numberFormatter = new Intl.NumberFormat("ko-KR");

interface Props {
  characterId: number;
}

export default function MySkillTree({ characterId }: Props) {
  const { confirm, prompt } = useDialog();
  const { toast } = useToast();
  const [treesByBook, setTreesByBook] = useState<Record<SkillBook, CharacterSkillTree> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyNodeId, setBusyNodeId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const lists = await Promise.all(BOOKS.map((b) => fetchCharacterSkillTree(characterId, b)));
        if (cancelled) return;
        setTreesByBook(Object.fromEntries(BOOKS.map((b, i) => [b, lists[i]])) as Record<SkillBook, CharacterSkillTree>);
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : "기술트리 조회 실패", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [characterId, toast]);

  /** AP는 캐릭터 전역 값이라, 한 서에서 소모해도 나머지 서의 캐시된 표시 AP를 함께 갱신해야 어긋나지 않는다. */
  function applyTreeUpdate(book: SkillBook, updated: CharacterSkillTree) {
    setTreesByBook((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [book]: updated };
      for (const b of BOOKS) {
        if (b !== book) next[b] = { ...next[b], character_ap: updated.character_ap };
      }
      return next;
    });
  }

  async function handleUnlock(book: SkillBook, node: CharacterSkillNode) {
    setBusyNodeId(node.id);
    try {
      applyTreeUpdate(book, await unlockCharacterSkill(characterId, node.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : "기술 강화 실패", "error");
    } finally {
      setBusyNodeId(null);
    }
  }

  async function renameNode(book: SkillBook, node: CharacterSkillNode) {
    const nextName = await prompt(
      { title: "기술 이름 수정", description: "새로운 기술 이름을 입력해 주세요." },
      node.custom_name ?? node.default_name,
    );
    if (nextName === null) return;
    setBusyNodeId(node.id);
    try {
      applyTreeUpdate(book, await renameCharacterSkill(characterId, node.id, nextName));
    } catch (e) {
      toast(e instanceof Error ? e.message : "기술 이름 설정 실패", "error");
    } finally {
      setBusyNodeId(null);
    }
  }

  function canUnlock(tree: CharacterSkillTree, node: CharacterSkillNode): boolean {
    if (!node.is_public || node.unlocked || node.tier === 0 || tree.character_ap < tree.ap_cost_to_unlock) return false;
    if (node.tier === 1) {
      return !tree.nodes.some((candidate) => candidate.unlocked && candidate.tier === 1 && candidate.branch !== node.branch);
    }
    const parentUnlocked = tree.nodes.some((candidate) =>
      candidate.unlocked
      && candidate.branch === node.branch
      && candidate.tier === node.tier - 1
      && (node.tier === 2 || candidate.col === node.col),
    );
    if (!parentUnlocked) return false;
    return !tree.nodes.some((candidate) =>
      candidate.unlocked && candidate.branch === node.branch && candidate.tier >= 2 && candidate.col !== node.col,
    );
  }

  async function handleNodeClick(book: SkillBook, tree: CharacterSkillTree, node: CharacterSkillNode) {
    if (node.unlocked) {
      await renameNode(book, node);
      return;
    }
    if (!canUnlock(tree, node)) return;
    const effectDescription = node.effects.length > 0 ? node.effects.map(formatEffect).join(", ") : "효과 없음";
    const accepted = await confirm({
      title: "기술 선택",
      description: `정말 '${node.display_name}'을 선택하시겠습니까?\n${effectDescription}`,
    });
    if (accepted) await handleUnlock(book, node);
  }

  const anyTree = treesByBook ? treesByBook[BOOKS[0]] : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-ivory">기술트리</h2>
          <p className="text-sm text-muted">
            용맹·불굴·헌신·탐구 4개 서 전부에서 캐릭터의 역할과 무관하게 자유롭게 기술을 강화할 수 있습니다. 각 서의 1단계
            계열과 2단계부터의 세부 경로는 각각 하나만 선택할 수 있습니다. 습득한 기술을 누르면 이름을 바꿀 수 있습니다.
          </p>
        </div>
        {anyTree && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-num">보유 AP {numberFormatter.format(anyTree.character_ap)}</Badge>
            <Badge variant="secondary" className="font-num">강화 비용 {numberFormatter.format(anyTree.ap_cost_to_unlock)} AP</Badge>
          </div>
        )}
      </div>

      {loading || !treesByBook ? (
        <p className="text-sm text-muted">불러오는 중...</p>
      ) : (
        <div className="no-scrollbar overflow-x-auto pb-2"><div className="mx-auto flex w-max gap-6">
          {BOOKS.map((book) => {
            const tree = treesByBook[book];
            return (
              <div key={book} className="flex flex-col items-center gap-3">
                <h3 className={`text-sm font-semibold ${BOOK_ACCENT[book].text}`}>{book}</h3>
                <div className="rounded-xl border border-gold bg-surface p-4">
                  <SkillTreeGrid
                    nodes={tree.nodes}
                    getLabel={(n) => n.display_name}
                    isHighlighted={(n) => n.unlocked}
                    isLocked={(n) => !n.is_public}
                    isDisabled={(node) => busyNodeId !== null || (!node.unlocked && !canUnlock(tree, node))}
                    onNodeClick={(node) => handleNodeClick(book, tree, node)}
                    showLabels={false}
                    tooltipVariant="runner"
                    accent={BOOK_ACCENT[book]}
                  />
                </div>
              </div>
            );
          })}
        </div></div>
      )}
    </div>
  );
}
