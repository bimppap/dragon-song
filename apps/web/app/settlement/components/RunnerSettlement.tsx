"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Link2, Minus, MessageSquareText, Plus, Send, Users, X, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import AlertBanner from "@/components/common/AlertBanner";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import EmptyState from "@/components/common/EmptyState";
import { useDialog } from "@/components/common/DialogProvider";
import { useToast } from "@/components/common/ToastProvider";
import {
  cancelSettlement,
  createSettlement,
  fetchAppearedSettlementTargetIds,
  fetchSettlementTargetCandidates,
  fetchSettlements,
} from "@/lib/api";
import type { Character, Settlement, SettlementType } from "@/lib/api";
import { cn, parsePositiveInt } from "@/lib/utils";
import TargetPickerModal from "./TargetPickerModal";

const TYPE_LABELS: Record<SettlementType, string> = {
  board: "게시글 & 댓글",
  log: "교류 로그",
};

// crud.py의 정산 규칙(SETTLEMENT_GOLD_PER_POST, SETTLEMENT_COMMENTS_PER_CP, SETTLEMENT_CP_PER_LINK,
// SETTLEMENT_CP_PER_NEW_TARGET)과 동일한 값. 지급 예상액 미리보기 계산에 사용한다.
const GOLD_PER_POST = 1;
const COMMENTS_PER_CP = 50;
const CP_PER_LINK = 1;
const CP_PER_NEW_TARGET = 1;

function SettlementHistoryRow({
  settlement,
  onCancel,
}: {
  settlement: Settlement;
  onCancel: (settlement: Settlement) => void;
}) {
  const paid = settlement.status === "paid";
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{TYPE_LABELS[settlement.type]}</Badge>
        <Badge variant={paid ? "success" : "warning"}>{paid ? "지급 완료" : "대기 중"}</Badge>
        <span className="ml-auto text-xs text-muted">
          {new Date(settlement.created_at).toLocaleString("ko-KR")}
        </span>
      </div>
      {settlement.type === "board" ? (
        <p className="text-sm text-ivory/90">
          총 게시물 <span className="font-num font-semibold text-gold">{settlement.total_posts}</span>개 ·
          총 댓글 <span className="font-num font-semibold text-gold">{settlement.total_comments}</span>개
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {settlement.links.map((link, index) => (
              <li key={index} className="truncate text-sm text-ivory/80">
                <Link2 size={12} className="mr-1 inline text-muted" />
                {link}
              </li>
            ))}
          </ul>
          {settlement.targets.length > 0 && (
            <p className="text-xs text-muted">
              교류 대상: {settlement.targets.map((t) => t.name).join(", ")}
            </p>
          )}
        </>
      )}
      {paid ? (
        <p className="text-sm text-muted">
          지급: <span className="font-num font-semibold text-yellow-400">{settlement.paid_gold ?? 0}G</span> +{" "}
          <span className="font-num font-semibold text-cyan-400">{settlement.paid_cp ?? 0}CP</span>
        </p>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 self-end text-red-400 hover:text-red-300"
          onClick={() => onCancel(settlement)}
        >
          <XCircle size={13} />
          요청 취소
        </Button>
      )}
    </div>
  );
}

export default function RunnerSettlement() {
  const { toast } = useToast();
  const { confirm } = useDialog();
  const [type, setType] = useState<SettlementType>("board");
  const [totalPosts, setTotalPosts] = useState("");
  const [totalComments, setTotalComments] = useState("");
  const [links, setLinks] = useState<string[]>([""]);
  const [targetIds, setTargetIds] = useState<number[]>([]);
  const [targetCandidates, setTargetCandidates] = useState<Character[]>([]);
  const [appearedTargetIds, setAppearedTargetIds] = useState<number[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const list = await fetchSettlements(true);
        if (!cancelled) setSettlements(list);
      } catch (error) {
        if (!cancelled) toast(error instanceof Error ? error.message : "정산 요청 조회 실패", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadTargets() {
      try {
        const [candidates, appeared] = await Promise.all([
          fetchSettlementTargetCandidates(),
          fetchAppearedSettlementTargetIds(),
        ]);
        if (!cancelled) {
          setTargetCandidates(candidates);
          setAppearedTargetIds(appeared);
        }
      } catch {
        // 교류 대상 목록 조회 실패는 조용히 무시한다 (게시글&댓글 정산에는 영향 없음).
      }
    }

    load();
    loadTargets();
    return () => { cancelled = true; };
  }, [toast]);

  const selectedTargets = useMemo(
    () => targetCandidates.filter((c) => targetIds.includes(c.id)),
    [targetCandidates, targetIds],
  );

  const preview = useMemo(() => {
    if (type === "board") {
      const prevBoard = settlements
        .filter((s) => s.type === "board" && s.status === "paid")
        .sort((a, b) => b.id - a.id)[0];
      const prevPosts = prevBoard?.total_posts ?? 0;
      const prevComments = prevBoard?.total_comments ?? 0;
      const posts = parsePositiveInt(totalPosts);
      const comments = parsePositiveInt(totalComments);
      const gold = Math.max(0, posts - prevPosts) * GOLD_PER_POST;
      const cp = Math.max(0, Math.floor(comments / COMMENTS_PER_CP) - Math.floor(prevComments / COMMENTS_PER_CP));
      return { gold, cp };
    }
    const linkCount = links.map((l) => l.trim()).filter(Boolean).length;
    const newTargetCount = targetIds.filter((id) => !appearedTargetIds.includes(id)).length;
    return { gold: 0, cp: linkCount * CP_PER_LINK + newTargetCount * CP_PER_NEW_TARGET };
  }, [type, settlements, totalPosts, totalComments, links, targetIds, appearedTargetIds]);

  async function handleSubmit() {
    try {
      setSubmitting(true);
      const payload = type === "board"
        ? { type, total_posts: parsePositiveInt(totalPosts), total_comments: parsePositiveInt(totalComments) }
        : { type, links: links.map((l) => l.trim()).filter(Boolean), target_character_ids: targetIds };
      if (type === "board" && (totalPosts.trim() === "" || totalComments.trim() === "")) {
        toast("총 게시물 갯수와 총 댓글 갯수를 모두 입력해 주세요.", "error");
        return;
      }
      if (type === "log" && (payload.links?.length ?? 0) === 0) {
        toast("게시물 링크를 1개 이상 입력해 주세요.", "error");
        return;
      }
      setSettlements(await createSettlement(payload));
      setTotalPosts("");
      setTotalComments("");
      setLinks([""]);
      setTargetIds([]);
      const appeared = await fetchAppearedSettlementTargetIds().catch(() => appearedTargetIds);
      setAppearedTargetIds(appeared);
      toast("정산 요청을 보냈습니다. 어드민 확인 후 보상이 지급됩니다.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "정산 요청 실패", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(settlement: Settlement) {
    const ok = await confirm({
      title: "정산 요청 취소",
      description: "이 정산 요청을 취소할까요? 취소한 요청은 되돌릴 수 없습니다.",
      confirmText: "취소하기",
      tone: "danger",
    });
    if (!ok) return;
    try {
      setSettlements(await cancelSettlement(settlement.id));
      toast("정산 요청을 취소했습니다.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "정산 요청 취소 실패", "error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>정산 요청</CardTitle>
          <CardDescription>정산 종류를 선택하고 내용을 입력해 어드민에게 정산을 요청합니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* 종류 선택 */}
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(TYPE_LABELS) as SettlementType[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors",
                  type === value ? "border-gold bg-gold/10 text-gold" : "border-line text-muted hover:text-ivory",
                )}
              >
                {value === "board" ? <MessageSquareText size={15} /> : <Link2 size={15} />}
                {TYPE_LABELS[value]}
              </button>
            ))}
          </div>

          {type === "board" ? (
            <div className="flex flex-col gap-4">
              <AlertBanner tone="warning" className="text-sm">
                <span className="flex items-start gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>
                    반드시 지금까지 누적된 <b>&lsquo;총 게시물 갯수&rsquo;</b>와 <b>&lsquo;총 댓글 갯수&rsquo;</b>를
                    입력해야 합니다. 이번에 새로 작성한 개수가 아닌 <b>전체 누적 수</b>입니다.
                  </span>
                </span>
              </AlertBanner>
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1.5">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                    총 게시물 갯수 <span className="text-red-400">*</span>
                  </span>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={totalPosts}
                    onChange={(event) => setTotalPosts(event.target.value)}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                    총 댓글 갯수 <span className="text-red-400">*</span>
                  </span>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={totalComments}
                    onChange={(event) => setTotalComments(event.target.value)}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <AlertBanner tone="warning" className="text-sm">
                <span className="flex items-start gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>
                    사이트 상단 주소창의 링크가 아닌, 게시물의 <b>&lsquo;URL 복사&rsquo;</b>를 통해 얻은 링크를
                    기입해 주세요. 그렇지 않으면 정산이 어려워질 수 있습니다. (아래 참고 사진)
                  </span>
                </span>
              </AlertBanner>
              <Image
                src="/log_example.png"
                alt="게시물 URL 복사 위치 참고 사진"
                width={1652}
                height={268}
                className="h-auto w-full max-w-md rounded-xl border border-line"
              />

              <div className="flex flex-col gap-2">
                {links.map((link, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      placeholder="게시물 링크 (URL 복사)"
                      value={link}
                      onChange={(event) =>
                        setLinks((prev) => prev.map((v, i) => (i === index ? event.target.value : v)))
                      }
                    />
                    {links.length > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))}
                        aria-label="링크 삭제"
                      >
                        <Minus size={14} />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" className="self-start gap-1" onClick={() => setLinks((prev) => [...prev, ""])}>
                  <Plus size={14} />
                  링크 추가
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                <span className="block text-xs font-semibold uppercase tracking-wide text-muted">교류 대상</span>
                <p className="text-xs text-muted">
                  이 로그에서 교류한 러너 캐릭터를 선택하면, 이번 챕터에 처음 기입되는 캐릭터마다 1CP가 추가됩니다.
                </p>
                {selectedTargets.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedTargets.map((c) => (
                      <span
                        key={c.id}
                        className="flex items-center gap-1.5 rounded-full border border-line bg-ground/40 py-1 pl-1 pr-2 text-xs text-ivory"
                      >
                        <CharacterAvatar src={c.image_url} alt={c.name} className="size-5 rounded-full" iconSize={10} />
                        {c.name}
                        <button
                          type="button"
                          aria-label={`${c.name} 제거`}
                          onClick={() => setTargetIds((prev) => prev.filter((id) => id !== c.id))}
                          className="text-muted hover:text-ivory"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 self-start"
                  onClick={() => setPickerOpen(true)}
                >
                  <Users size={14} />
                  교류 대상 선택
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-sm text-muted">
              <span className="font-num font-semibold text-yellow-400">{preview.gold}G</span>{" "}
              <span className="font-num font-semibold text-cyan-400">{preview.cp}CP</span> 지급 예상
            </span>
            <Button className="gap-2" onClick={handleSubmit} disabled={submitting}>
              <Send size={15} />
              {submitting ? "요청 중..." : "정산 요청하기"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>내 정산 요청 내역</CardTitle>
          <CardDescription>요청한 정산의 처리 상태를 확인할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loading ? (
            <EmptyState>정산 요청 내역을 불러오는 중입니다.</EmptyState>
          ) : settlements.length === 0 ? (
            <EmptyState>아직 요청한 정산이 없습니다.</EmptyState>
          ) : (
            settlements.map((settlement) => (
              <SettlementHistoryRow key={settlement.id} settlement={settlement} onCancel={handleCancel} />
            ))
          )}
        </CardContent>
      </Card>

      {pickerOpen && (
        <TargetPickerModal
          candidates={targetCandidates}
          appearedIds={appearedTargetIds}
          selectedIds={targetIds}
          onClose={() => setPickerOpen(false)}
          onConfirm={(ids) => {
            setTargetIds(ids);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
