"use client";

import { useEffect, useState } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SkillTreeGrid from "@/components/skill/SkillTreeGrid";
import { BOOK_ACCENT } from "@/components/skill/bookAccent";
import SkillEditModal from "./SkillEditModal";
import {
  fetchSkillNodes,
  updateSkillVisibility,
  type SkillBook,
  type SkillNode,
} from "@/lib/api";

const BOOKS: SkillBook[] = ["용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"];

/**
 * 누른 노드와 같은 기술의 depth별 노드. 뿌리 기술은 1단계와 col 0의 2~6단계,
 * 파생 기술은 col 1의 2~6단계이고, 0단계(서 아이덴티티)는 혼자다.
 */
function skillChainOf(node: SkillNode, bookNodes: SkillNode[]): SkillNode[] {
  if (node.tier === 0) return [node];
  const col = node.tier === 1 ? 0 : node.col;
  return bookNodes
    .filter((other) => other.branch === node.branch && (other.col === col || (col === 0 && other.tier === 1)))
    .sort((a, b) => a.tier - b.tier);
}

export default function AdminSkillEditor() {
  const [nodesByBook, setNodesByBook] = useState<Record<SkillBook, SkillNode[]>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ chain: SkillNode[]; focusId: number } | null>(null);
  const [maxPublicTier, setMaxPublicTier] = useState(6);
  const [savingVisibility, setSavingVisibility] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const lists = await Promise.all(BOOKS.map((b) => fetchSkillNodes(b)));
        if (cancelled) return;
        setNodesByBook(Object.fromEntries(BOOKS.map((b, i) => [b, lists[i]])) as Record<SkillBook, SkillNode[]>);
        setMaxPublicTier(Math.max(0, ...lists.flatMap((nodes) => nodes.filter((node) => node.is_public).map((node) => node.tier))));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "기술트리 조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  function startEdit(node: SkillNode) {
    if (!nodesByBook) return;
    setEditing({ chain: skillChainOf(node, nodesByBook[node.book]), focusId: node.id });
  }

  async function reloadBook(book: SkillBook) {
    try {
      const nodes = await fetchSkillNodes(book);
      setNodesByBook((prev) => (prev ? { ...prev, [book]: nodes } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "기술트리 조회 실패");
    }
  }

  async function handleVisibilityChange(value: string) {
    const nextTier = Number(value);
    setSavingVisibility(true);
    setError(null);
    try {
      const updated = await updateSkillVisibility(nextTier);
      setNodesByBook(Object.fromEntries(
        BOOKS.map((book) => [book, updated.filter((node) => node.book === book)]),
      ) as Record<SkillBook, SkillNode[]>);
      setMaxPublicTier(nextTier);
    } catch (e) {
      setError(e instanceof Error ? e.message : "기술 공개 단계 저장 실패");
    } finally {
      setSavingVisibility(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-ivory">기술트리 관리</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-ivory">기술 노드 공개 범위</span>
          <Select
            value={String(maxPublicTier)}
            onValueChange={(value) => void handleVisibilityChange(value)}
            disabled={loading || savingVisibility}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Array.from({ length: 7 }, (_, tier) => (
                  <SelectItem key={tier} value={String(tier)}>
                    {tier === 0 ? "루트만 공개" : `${tier}단계까지 공개`}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {savingVisibility ? <span className="text-xs text-muted">저장 중...</span> : null}
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      {loading || !nodesByBook ? (
        <p className="text-sm text-muted">불러오는 중...</p>
      ) : (
        <div className="no-scrollbar overflow-x-auto pb-2"><div className="mx-auto flex w-max gap-6">
          {BOOKS.map((book) => (
            <div key={book} className="flex flex-col items-center gap-3">
              <h3 className={`text-sm font-semibold ${BOOK_ACCENT[book].text}`}>{book}</h3>
              <div className="rounded-xl border border-line bg-surface p-4">
                <SkillTreeGrid
                  nodes={nodesByBook[book]}
                  getLabel={(n) => n.default_name}
                  isHighlighted={(n) => Boolean(editing?.chain.some((node) => node.id === n.id))}
                  onNodeClick={startEdit}
                  showLabels={false}
                  tooltipVariant="admin"
                  accent={BOOK_ACCENT[book]}
                />
              </div>
            </div>
          ))}
        </div></div>
      )}

      {editing && (
        <SkillEditModal
          nodes={editing.chain}
          focusId={editing.focusId}
          onClose={() => setEditing(null)}
          onSaved={() => void reloadBook(editing.chain[0].book)}
        />
      )}
    </div>
  );
}
