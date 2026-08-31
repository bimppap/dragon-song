"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Coins, Link2, MessageSquareText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CharacterAvatar from "@/components/common/CharacterAvatar";
import EmptyState from "@/components/common/EmptyState";
import { useDialog } from "@/components/common/DialogProvider";
import { useToast } from "@/components/common/ToastProvider";
import { fetchSettlements, paySettlement } from "@/lib/api";
import type { Settlement } from "@/lib/api";
import { parsePositiveInt } from "@/lib/utils";

const TYPE_LABELS = { board: "게시글 & 댓글", log: "교류 로그" } as const;

function SettlementMeta({ settlement, trailing }: { settlement: Settlement; trailing?: ReactNode }) {
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
      {trailing}
      <span className="ml-auto text-xs text-muted">
        {new Date(settlement.created_at).toLocaleString("ko-KR")}
      </span>
    </div>
  );
}

function PaidAmount({ settlement }: { settlement: Settlement }) {
  return (
    <span className="text-sm text-muted">
      <span className="font-num font-semibold text-yellow-400">{settlement.paid_gold ?? 0}G</span> +{" "}
      <span className="font-num font-semibold text-cyan-400">{settlement.paid_cp ?? 0}CP</span>
    </span>
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
  const [paying, setPaying] = useState(false);

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
            </div>
          ))}
          <p className="text-xs text-muted">
            기본: 링크 1개당 1CP ({settlement.links.length}CP) + 챕터 내 최초 교류 대상 1명당 1CP
          </p>
          {settlement.targets.length > 0 && (
            <p className="text-xs text-muted">
              교류 대상: {settlement.targets.map((t) => t.name).join(", ")}
            </p>
          )}
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
            onChange={(event) => setCp(parsePositiveInt(event.target.value))}
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
  const { toast } = useToast();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const list = await fetchSettlements();
        if (!cancelled) setSettlements(list);
      } catch (error) {
        if (!cancelled) toast(error instanceof Error ? error.message : "정산 요청 조회 실패", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [toast]);

  const [paidCharacterFilter, setPaidCharacterFilter] = useState("all");

  const pending = settlements.filter((s) => s.status === "pending");
  const paid = settlements.filter((s) => s.status === "paid");

  const paidCharacters = useMemo(() => {
    const byId = new Map<number, { id: number; name: string; image_url: string | null }>();
    for (const s of paid) {
      if (!byId.has(s.character_id)) {
        byId.set(s.character_id, { id: s.character_id, name: s.character_name, image_url: s.character_image_url });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [paid]);

  const filteredPaid = paidCharacterFilter === "all"
    ? paid
    : paid.filter((s) => String(s.character_id) === paidCharacterFilter);

  function handlePaid(updated: Settlement) {
    setSettlements((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  return (
    <div className="flex flex-col gap-6">
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
                onError={(message) => toast(message, "error")}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>지급 완료된 정산</CardTitle>
          {paidCharacters.length > 0 && (
            <Select value={paidCharacterFilter} onValueChange={setPaidCharacterFilter}>
              <SelectTrigger className="w-40 shrink-0">
                <SelectValue placeholder="캐릭터 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 캐릭터</SelectItem>
                {paidCharacters.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {paid.length === 0 ? (
            <EmptyState>지급 완료된 정산이 없습니다.</EmptyState>
          ) : filteredPaid.length === 0 ? (
            <EmptyState>선택한 캐릭터의 지급 완료된 정산이 없습니다.</EmptyState>
          ) : (
            filteredPaid.map((settlement) => (
              <div key={settlement.id} className="flex flex-col gap-2 rounded-2xl border border-line px-4 py-4">
                <SettlementMeta settlement={settlement} trailing={<PaidAmount settlement={settlement} />} />
                {settlement.targets.length > 0 && (
                  <p className="text-xs text-muted">
                    교류 대상: {settlement.targets.map((t) => t.name).join(", ")}
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
