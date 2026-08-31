"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SkillTreeGrid from "@/components/skill/SkillTreeGrid";
import { BOOK_ACCENT } from "@/components/skill/bookAccent";
import Modal from "@/components/common/Modal";
import {
  fetchCharacterSkillTree,
  formatEffect,
  renameCharacterSkill,
  unlockCharacterSkill,
  uploadCharacterSkillImage,
  type CharacterSkillNode,
  type CharacterSkillTree,
  type SkillBook,
} from "@/lib/api";
import { useDialog } from "@/components/common/DialogProvider";
import { useToast } from "@/components/common/ToastProvider";

import { deepestLearnedSkill, isExcludedSkillPath } from "@/lib/skillProgression";

const BOOKS: SkillBook[] = ["용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"];
const numberFormatter = new Intl.NumberFormat("ko-KR");

interface Props {
  characterId: number;
}

export default function MySkillTree({ characterId }: Props) {
  const { confirm } = useDialog();
  const { toast } = useToast();
  const [treesByBook, setTreesByBook] = useState<Record<SkillBook, CharacterSkillTree> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyNodeId, setBusyNodeId] = useState<number | null>(null);
  const [customizing, setCustomizing] = useState<{ book: SkillBook; node: CharacterSkillNode } | null>(null);
  const [customName, setCustomName] = useState("");
  const [customImageFile, setCustomImageFile] = useState<File | null>(null);
  const [customImagePreview, setCustomImagePreview] = useState<string | null>(null);
  const [savingCustomize, setSavingCustomize] = useState(false);

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

  function openCustomize(book: SkillBook, node: CharacterSkillNode) {
    setCustomizing({ book, node });
    setCustomName(node.custom_name ?? node.default_name);
    setCustomImageFile(null);
    setCustomImagePreview(node.image_url);
  }

  function closeCustomize() {
    setCustomizing(null);
  }

  function handleCustomImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setCustomImageFile(file);
    setCustomImagePreview(file ? URL.createObjectURL(file) : (customizing?.node.image_url ?? null));
  }

  async function handleSaveCustomize() {
    if (!customizing) return;
    const { book, node } = customizing;
    setSavingCustomize(true);
    try {
      let tree: CharacterSkillTree | null = null;
      const trimmedName = customName.trim();
      if (trimmedName !== (node.custom_name ?? node.default_name)) {
        tree = await renameCharacterSkill(characterId, node.id, trimmedName);
      }
      if (customImageFile) {
        tree = await uploadCharacterSkillImage(characterId, node.id, customImageFile);
      }
      if (tree) applyTreeUpdate(book, tree);
      closeCustomize();
    } catch (e) {
      toast(e instanceof Error ? e.message : "기술 커스터마이즈에 실패했습니다.", "error");
    } finally {
      setSavingCustomize(false);
    }
  }

  function canUnlock(tree: CharacterSkillTree, node: CharacterSkillNode): boolean {
    if (selectedBook && selectedBook !== node.book) return false;
    if (isExcludedSkillPath(tree.nodes, node)) return false;
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
      // 루트(0단계) 노드는 서 자체를 나타내는 자리표시자라 이름·이미지를 커스터마이즈할 수 없다.
      if (node.tier === 0) return;
      openCustomize(book, node);
      return;
    }
    if (busyNodeId !== null || !canUnlock(tree, node)) return;
    const effectDescription = node.effects.length > 0 ? node.effects.map(formatEffect).join(", ") : "효과 없음";
    const accepted = await confirm({
      title: "기술 선택",
      description: `정말 '${node.display_name}'을 선택하시겠습니까?\n${effectDescription}${node.tier === 1 ? '\n선택하면 다른 서와 다른 계열의 기술은 습득할 수 없습니다.' : node.tier === 2 ? '\n선택하면 다른 세부 경로의 기술은 습득할 수 없습니다.' : ''}`,
    });
    if (accepted) await handleUnlock(book, node);
  }

  const selectedBook = treesByBook
    ? deepestLearnedSkill(BOOKS.flatMap((book) => treesByBook[book].nodes))?.book ?? null
    : null;
  const visibleBooks = selectedBook ? [selectedBook] : BOOKS;
  const anyTree = treesByBook ? treesByBook[BOOKS[0]] : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-ivory">기술트리</h2>
          <p className="text-sm text-muted">
            캐릭터의 역할과 무관하게 용맹·불굴·헌신·탐구 중 하나의 서를 선택할 수 있습니다.
            첫 기술을 습득하면 해당 서만 표시됩니다. 1단계의 세 계열과 2단계의 두 세부 경로에서 각각 하나를 선택하며,
            선택하지 않은 경로는 설명만 확인할 수 있습니다. 습득한 기술을 누르면 이름과 이미지를 바꿀 수
            있습니다(루트 노드는 제외).
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
          {visibleBooks.map((book) => {
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

      <Modal
        open={customizing !== null}
        onClose={closeCustomize}
        title={customizing ? `${customizing.node.default_name} 커스터마이즈` : undefined}
      >
        {customizing && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wide">기술 이름</label>
              <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="기술 이름" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wide">기술 이미지</label>
              <div className="flex items-center gap-4">
                <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden border border-line bg-inset">
                  {customImagePreview ? (
                    <Image src={customImagePreview} alt="기술 이미지 미리보기" fill unoptimized className="object-cover" />
                  ) : (
                    <ImageIcon size={20} className="text-muted" />
                  )}
                </div>
                <div className="space-y-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCustomImageChange}
                    className="block text-sm text-ivory/85 file:mr-3 file:rounded-lg file:border-0 file:bg-gold/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gold hover:file:bg-gold/15"
                  />
                  <p className="text-xs text-muted">업로드 시 자동으로 WebP로 변환되며, 5MB를 넘으면 실패합니다.</p>
                </div>
              </div>
            </div>

            <Button type="button" className="w-full" onClick={handleSaveCustomize} disabled={savingCustomize}>
              {savingCustomize ? "저장 중..." : "저장"}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
