"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import SkillTreeGrid, { QuotedDescription } from "@/components/skill/SkillTreeGrid";
import { BOOK_ACCENT } from "@/components/skill/bookAccent";
import Modal from "@/components/common/Modal";
import {
  fetchCharacterSkillTree,
  fetchCharacterDetail,
  selectAdminCharacterSkill,
  type CharacterDetail,
  formatEffect,
  customizeCharacterSkill,
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
  adminMode?: boolean;
  customizeOnly?: boolean;
  onUpdated?: (detail: CharacterDetail) => void;
  onClose?: () => void;
}

export default function MySkillTree({ characterId, adminMode = false, customizeOnly = false, onUpdated, onClose }: Props) {
  const { confirm } = useDialog();
  const { toast } = useToast();
  const [treesByBook, setTreesByBook] = useState<Record<SkillBook, CharacterSkillTree> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyNodeId, setBusyNodeId] = useState<number | null>(null);
  const [customizing, setCustomizing] = useState<{ book: SkillBook; node: CharacterSkillNode } | null>(null);
  const [customName, setCustomName] = useState("");
  const [customImageFile, setCustomImageFile] = useState<File | null>(null);
  const [customImagePreview, setCustomImagePreview] = useState<string | null>(null);
  const [customDescription, setCustomDescription] = useState("");
  // "" 이면 색을 따로 저장하지 않고 서(book) 기본 강조색을 쓴다.
  const [customDescriptionColor, setCustomDescriptionColor] = useState("");
  const [savingCustomize, setSavingCustomize] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const lists = await Promise.all(BOOKS.map((b) => fetchCharacterSkillTree(characterId, b)));
        if (cancelled) return;
        if (customizeOnly) {
          const node = deepestLearnedSkill(lists.flatMap((tree) => tree.nodes));
          if (node) openCustomize(node.book, node);
        }
        setTreesByBook(Object.fromEntries(BOOKS.map((b, i) => [b, lists[i]])) as Record<SkillBook, CharacterSkillTree>);
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : "기술트리 조회 실패", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [characterId, toast, customizeOnly]);

  /** SP는 캐릭터 전역 값이라, 한 서에서 소모해도 나머지 서의 캐시된 표시 SP를 함께 갱신해야 어긋나지 않는다. */
  function applyTreeUpdate(book: SkillBook, updated: CharacterSkillTree) {
    setTreesByBook((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [book]: updated };
      for (const b of BOOKS) {
        if (b !== book) next[b] = { ...next[b], character_sp: updated.character_sp };
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
    setCustomDescription(node.custom_description ?? "");
    setCustomDescriptionColor(node.custom_description_color ?? "");
  }

  function closeCustomize() {
    setCustomizing(null);
    if (customizeOnly) onClose?.();
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
      const trimmedName = customName.trim();
      let tree = await customizeCharacterSkill(characterId, node.id, {
        // 기본 이름 그대로면 커스터마이즈하지 않은 것으로 되돌린다.
        custom_name: trimmedName === node.default_name ? "" : trimmedName,
        custom_description: customDescription.trim(),
        custom_description_color: customDescriptionColor,
      });
      // 이미지는 multipart라 경로가 따로다. 응답이 최신 트리이므로 이걸로 덮어쓴다.
      if (customImageFile) {
        tree = await uploadCharacterSkillImage(characterId, node.id, customImageFile);
      }
      applyTreeUpdate(book, tree);
      if (adminMode) onUpdated?.(await fetchCharacterDetail(characterId));
      closeCustomize();
    } catch (e) {
      toast(e instanceof Error ? e.message : "기술 커스터마이즈에 실패했습니다.", "error");
    } finally {
      setSavingCustomize(false);
    }
  }

  function canUnlock(tree: CharacterSkillTree, node: CharacterSkillNode): boolean {
    if (adminMode) return node.tier > 0;
    if (selectedBook && selectedBook !== node.book) return false;
    if (isExcludedSkillPath(tree.nodes, node)) return false;
    if (!node.is_public || node.unlocked || node.tier === 0 || tree.character_sp < tree.sp_cost_to_unlock) return false;
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
    if (adminMode) {
      if (node.tier === 0 || busyNodeId !== null) return;
      setBusyNodeId(node.id);
      try { onUpdated?.(await selectAdminCharacterSkill(characterId, node.id)); onClose?.(); }
      catch (error) { toast(error instanceof Error ? error.message : "기술 선택 실패", "error"); }
      finally { setBusyNodeId(null); }
      return;
    }
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
  const visibleBooks = !adminMode && selectedBook ? [selectedBook] : BOOKS;
  const anyTree = treesByBook ? treesByBook[BOOKS[0]] : null;

  return (
    <div className="space-y-6">
      {!customizeOnly && <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-ivory">기술트리</h2>
          <p className="text-sm text-muted">
            {adminMode ? "서·선행 기술·SP 제한 없이 기술 하나를 선택하세요. 기존 기술은 교체됩니다." : <>캐릭터의 역할과 무관하게 용맹·불굴·헌신·탐구 중 하나의 서를 선택할 수 있습니다.
            첫 기술을 습득하면 해당 서만 표시됩니다. 1단계의 세 계열과 2단계의 두 세부 경로에서 각각 하나를 선택하며,
            선택하지 않은 경로는 설명만 확인할 수 있습니다. 습득한 기술을 누르면 이름·이미지·설명을 바꿀 수
            있습니다(루트 노드는 제외).</>}
          </p>
        </div>
        {anyTree && !adminMode && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-num">보유 SP {numberFormatter.format(anyTree.character_sp)}</Badge>
            <Badge variant="secondary" className="font-num">강화 비용 {numberFormatter.format(anyTree.sp_cost_to_unlock)} SP</Badge>
          </div>
        )}
      </div>}

      {!customizeOnly && (loading || !treesByBook ? (
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
                    isLocked={(n) => !adminMode && !n.is_public}
                    isDisabled={(node) => busyNodeId !== null || (!node.unlocked && !canUnlock(tree, node))}
                    onNodeClick={(node) => handleNodeClick(book, tree, node)}
                    showLabels={false}
                    tooltipVariant={adminMode ? "admin" : "runner"}
                    accent={BOOK_ACCENT[book]}
                  />
                </div>
              </div>
            );
          })}
        </div></div>
      ))}

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

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wide" htmlFor="skill-custom-description">
                기술 설명
              </label>
              <Textarea
                id="skill-custom-description"
                value={customDescription}
                maxLength={300}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="예) 붉은 '검기'가 흐른다"
              />
              <p className="text-xs text-muted">
                작은따옴표로 감싼 부분은 아래 강조 색으로 표시됩니다(따옴표는 보이지 않습니다). 원래 기술 설명은
                그대로 두고 툴팁에 함께 보입니다. {customDescription.length}/300자
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wide">강조 색</label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="color"
                  aria-label="강조 색"
                  value={customDescriptionColor || BOOK_ACCENT[customizing.book].line}
                  onChange={(e) => setCustomDescriptionColor(e.target.value)}
                  className="size-9 cursor-pointer rounded-lg border border-line bg-surface p-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setCustomDescriptionColor("")}
                  disabled={customDescriptionColor === ""}
                >
                  기본 색으로
                </Button>
                {customDescriptionColor === "" && (
                  <span className="text-xs text-muted">{customizing.book} 기본 색을 쓰는 중</span>
                )}
              </div>
              {customDescription.trim() && (
                <p className="mt-1 whitespace-pre-line rounded-lg border border-line bg-inset px-3 py-2 text-sm text-ivory/85">
                  <QuotedDescription
                    text={customDescription}
                    color={customDescriptionColor}
                    accent={BOOK_ACCENT[customizing.book]}
                  />
                </p>
              )}
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
