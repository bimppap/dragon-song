"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Link2, Minus, MessageSquareText, Plus, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import AlertBanner from "@/components/common/AlertBanner";
import EmptyState from "@/components/common/EmptyState";
import { createSettlement, fetchSettlements } from "@/lib/api";
import type { Settlement, SettlementType } from "@/lib/api";
import { cn, parsePositiveInt } from "@/lib/utils";

const TYPE_LABELS: Record<SettlementType, string> = {
  board: "게시글 & 댓글",
  log: "로그잇기",
};

function SettlementHistoryRow({ settlement }: { settlement: Settlement }) {
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
        <ul className="flex flex-col gap-1">
          {settlement.links.map((link, index) => (
            <li key={index} className="truncate text-sm text-ivory/80">
              <Link2 size={12} className="mr-1 inline text-muted" />
              {link}
            </li>
          ))}
        </ul>
      )}
      {paid && (
        <p className="text-sm text-muted">
          지급: <span className="font-num font-semibold text-yellow-400">{settlement.paid_gold ?? 0}G</span> +{" "}
          <span className="font-num font-semibold text-cyan-400">{settlement.paid_cp ?? 0}CP</span>
        </p>
      )}
    </div>
  );
}

export default function RunnerSettlement() {
  const [type, setType] = useState<SettlementType>("board");
  const [totalPosts, setTotalPosts] = useState("");
  const [totalComments, setTotalComments] = useState("");
  const [links, setLinks] = useState<string[]>([""]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const list = await fetchSettlements();
        if (!cancelled) setSettlements(list);
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "정산 요청 조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit() {
    setSuccessMessage(null);
    try {
      setSubmitting(true);
      const payload = type === "board"
        ? { type, total_posts: parsePositiveInt(totalPosts), total_comments: parsePositiveInt(totalComments) }
        : { type, links: links.map((l) => l.trim()).filter(Boolean) };
      if (type === "board" && (totalPosts.trim() === "" || totalComments.trim() === "")) {
        setErrorMessage("총 게시물 갯수와 총 댓글 갯수를 모두 입력해 주세요.");
        return;
      }
      if (type === "log" && (payload.links?.length ?? 0) === 0) {
        setErrorMessage("게시물 링크를 1개 이상 입력해 주세요.");
        return;
      }
      setSettlements(await createSettlement(payload));
      setTotalPosts("");
      setTotalComments("");
      setLinks([""]);
      setErrorMessage(null);
      setSuccessMessage("정산 요청을 보냈습니다. 어드민 확인 후 보상이 지급됩니다.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "정산 요청 실패");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {errorMessage && <AlertBanner>{errorMessage}</AlertBanner>}
      {successMessage && <AlertBanner tone="success">{successMessage}</AlertBanner>}

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
            </div>
          )}

          <Button className="gap-2 self-end" onClick={handleSubmit} disabled={submitting}>
            <Send size={15} />
            {submitting ? "요청 중..." : "정산 요청하기"}
          </Button>
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
              <SettlementHistoryRow key={settlement.id} settlement={settlement} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
