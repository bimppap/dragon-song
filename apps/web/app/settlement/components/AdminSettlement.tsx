"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Coins, Link2, MessageSquareText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import AlertBanner from "@/components/common/AlertBanner";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import EmptyState from "@/components/common/EmptyState";
import { useDialog } from "@/components/common/DialogProvider";
import { fetchSettlements, paySettlement } from "@/lib/api";
import type { Settlement } from "@/lib/api";
import { parsePositiveInt } from "@/lib/utils";

const TYPE_LABELS = { board: "게시글 & 댓글", log: "로그잇기" } as const;

function SettlementMeta({ settlement }: { settlement: Settlement }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CharacterAvatar
        src={settlement.character_image_url}
        alt={settlement.character_name}
        className="size-8 rounded-lg"
        iconSize={14}
      />
      <span className="font-semibold text-ivory">{settlement.character_name}</span>
      <Badge variant="secondary" className="gap-1">
        {settlement.type === "board" ? <MessageSquareText size={11} /> : <Link2 size={11} />}
        {TYPE_LABELS[settlement.type]}
      </Badge>
      <span className="ml-auto text-xs text-muted">
        {new Date(settlement.created_at).toLocaleString("ko-KR")}
      </span>
    </div>
  );
}

/** 대기 중인 정산 요청 카드: 제안값이 채워진 지급액을 수정해 지급한다. */
function PendingSettlementCard({
  settlement,
  onPaid,
  onError,
}: {
  settlement: Settlement;
  onPaid: (updated: Settlement) => void;
  onError: (message: string) => void;
}) {
  const { confirm } = useDialog();
  const [gold, setGold] = useState(settlement.suggested_gold);
  const [cp, setCp] = useState(settlement.suggested_cp);
  const [cpTouched, setCpTouched] = useState(false);
  const [appearances, setAppearances] = useState<number[]>(() => settlement.links.map(() => 0));
  const [paying, setPaying] = useState(false);

  function handleAppearanceChange(index: number, value: number) {
    const next = appearances.map((v, i) => (i === index ? value : v));
    setAppearances(next);
    // 어드민이 CP를 직접 고치기 전까지는 링크 CP + 출현 보상 합계로 자동 계산한다.
    if (!cpTouched) {
      setCp(settlement.suggested_cp + next.reduce((sum, v) => sum + v, 0));
    }
  }

  async function handlePay() {
    const ok = await confirm({
      title: "정산 지급",
      description: `${settlement.character_name}에게 골드 ${gold}G, CP ${cp}을(를) 지급할까요?`,
      confirmText: "지급",
    });
    if (!ok) return;
    setPaying(true);
    try {
      onPaid(await paySettlement(settlement.id, gold, cp));
    } catch (error) {
      onError(error instanceof Error ? error.message : "정산 지급 실패");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line px-4 py-4">
      <SettlementMeta settlement={settlement} />

      {settlement.type === "board" ? (
        <p className="text-sm text-ivory/90">
          총 게시물 <span className="font-num font-semibold text-gold">{settlement.total_posts}</span>개 ·
          총 댓글 <span className="font-num font-semibold text-gold">{settlement.total_comments}</span>개
          <span className="ml-2 text-xs text-muted">
            (직전 지급 이력 기준 제안: {settlement.suggested_gold}G + {settlement.suggested_cp}CP)
          </span>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {settlement.links.map((link, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ivory/80">
                <Link2 size={12} className="mr-1 inline text-muted" />
                {link}
              </span>
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                <Sparkles size={11} className="text-gold" />
                캐릭터 출현 보상(CP)
                <Input
                  type="number"
                  min={0}
                  className="h-8 w-20"
                  value={appearances[index] === 0 ? "" : appearances[index]}
                  placeholder="0"
                  onChange={(event) => handleAppearanceChange(index, parsePositiveInt(event.target.value))}
                />
              </label>
            </div>
          ))}
          <p className="text-xs text-muted">기본: 링크 1개당 1CP ({settlement.links.length}CP) + 링크별 캐릭터 출현 보상</p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
        <label className="space-y-1">
          <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <Coins size={11} className="text-gold" />지급 골드
          </span>
          <Input
            type="number"
            min={0}
            className="w-28"
            value={gold === 0 ? "" : gold}
            placeholder="0"
            onChange={(event) => setGold(parsePositiveInt(event.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <Sparkles size={11} className="text-cyan-400" />지급 CP
          </span>
          <Input
            type="number"
            min={0}
            className="w-28"
            value={cp === 0 ? "" : cp}
            placeholder="0"
            onChange={(event) => {
              setCpTouched(true);
              setCp(parsePositiveInt(event.target.value));
            }}
          />
        </label>
        <Button className="ml-auto gap-2" onClick={handlePay} disabled={paying}>
          <CheckCircle2 size={15} />
          {paying ? "지급 중..." : "지급하기"}
        </Button>
      </div>
    </div>
  );
}

export default function AdminSettlement() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const pending = settlements.filter((s) => s.status === "pending");
  const paid = settlements.filter((s) => s.status === "paid");

  function handlePaid(updated: Settlement) {
    setSettlements((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setErrorMessage(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {errorMessage && <AlertBanner>{errorMessage}</AlertBanner>}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle>대기 중인 정산 요청</CardTitle>
            <CardDescription>
              게시글 1개당 1골드, 댓글 50개당 1CP, 로그 링크 1개당 1CP가 기본이며, 게시글&댓글 정산은 직전
              지급 이력과의 차이로 자동 계산됩니다. 지급액은 수정할 수 있습니다.
            </CardDescription>
          </div>
          <Badge variant={pending.length > 0 ? "warning" : "outline"} className="shrink-0">{pending.length}건</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loading ? (
            <EmptyState>정산 요청을 불러오는 중입니다.</EmptyState>
          ) : pending.length === 0 ? (
            <EmptyState>대기 중인 정산 요청이 없습니다.</EmptyState>
          ) : (
            pending.map((settlement) => (
              <PendingSettlementCard
                key={settlement.id}
                settlement={settlement}
                onPaid={handlePaid}
                onError={setErrorMessage}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>지급 완료된 정산</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {paid.length === 0 ? (
            <EmptyState>지급 완료된 정산이 없습니다.</EmptyState>
          ) : (
            paid.map((settlement) => (
              <div key={settlement.id} className="flex flex-col gap-2 rounded-2xl border border-line px-4 py-4">
                <SettlementMeta settlement={settlement} />
                <p className="text-sm text-muted">
                  지급: <span className="font-num font-semibold text-yellow-400">{settlement.paid_gold ?? 0}G</span> +{" "}
                  <span className="font-num font-semibold text-cyan-400">{settlement.paid_cp ?? 0}CP</span>
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
