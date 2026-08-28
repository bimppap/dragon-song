"use client";

import { useEffect, useState } from "react";
import { Coins, Send, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDialog } from "@/components/common/DialogProvider";
import { useToast } from "@/components/common/ToastProvider";
import {
  fetchBattleRewardPreview,
  sendBattleRewards,
  type BattleRewardPreview,
  type BattleSessionSummary,
} from "@/lib/api";

const numberFormatter = new Intl.NumberFormat("ko-KR");
const fmt = (n: number) => numberFormatter.format(n);

interface Props {
  session: BattleSessionSummary;
  onSent: () => void;
}

export default function BattleRewardCard({ session, onSent }: Props) {
  const { confirm } = useDialog();
  const { toast } = useToast();
  const [preview, setPreview] = useState<BattleRewardPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBattleRewardPreview(session.id)
      .then((data) => { if (!cancelled) setPreview(data); })
      .catch((e) => { if (!cancelled) toast(e instanceof Error ? e.message : "전투 보상 조회 실패", "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session.id, toast]);

  async function handleSend() {
    if (!preview) return;
    const ok = await confirm({
      title: "전투 보상 전송",
      description: `${session.enemy_names.join(", ") || `전투 #${session.id}`}의 보상을 러너들에게 지급합니다. 되돌릴 수 없습니다.`,
      confirmText: "전송",
    });
    if (!ok) return;
    try {
      setSending(true);
      const updated = await sendBattleRewards(session.id);
      setPreview(updated);
      toast("전투 보상을 전송했습니다.", "success");
      onSent();
    } catch (e) {
      toast(e instanceof Error ? e.message : "전투 보상 전송 실패", "error");
    } finally {
      setSending(false);
    }
  }

  const payableEntries = (preview?.entries ?? []).filter((e) => e.total_gold > 0 || e.participation_exp > 0);
  const isReal = session.mode === "real";

  return (
    <Card className="border-gold/40 bg-gold/5">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-gold" />
            {session.enemy_names.join(", ") || `전투 #${session.id}`} {isReal ? "보상 전송" : "보상 미리보기"}
          </CardTitle>
          <CardDescription>
            {session.chapter ? `${session.chapter} · ` : ""}
            {session.status === "victory" ? "승리" : session.status === "defeat" ? "패배" : "조기 종료"} · 라운드 {session.round}
            {!isReal && " · 모의전은 실제로 지급되지 않습니다"}
          </CardDescription>
        </div>
        {isReal && (
          <Button size="sm" onClick={handleSend} disabled={loading || sending || !preview || preview.already_sent}>
            <Send size={14} />
            {sending ? "전송 중..." : preview?.already_sent ? "전송 완료" : "보상 전송"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted">보상을 계산하는 중입니다.</p>
        ) : !preview || payableEntries.length === 0 ? (
          <p className="text-sm text-muted">지급할 보상이 없습니다. 챕터 보상 설정을 확인해주세요.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {payableEntries.map((entry) => (
              <div key={entry.character_id} className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-3 py-2">
                <p className="text-sm font-semibold text-ivory">{entry.character_name}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {entry.total_gold > 0 && (
                    <Badge variant="outline" className="gap-1 font-num text-yellow-600">
                      <Coins size={11} />
                      {fmt(entry.total_gold)} G
                      <span className="text-muted">
                        (승리 {fmt(entry.victory_gold)} + 행동 {entry.action_rounds}회×{fmt(entry.action_gold / (entry.action_rounds || 1))})
                      </span>
                    </Badge>
                  )}
                  {entry.participation_exp > 0 && (
                    <Badge variant="outline" className="gap-1 font-num text-emerald-500">
                      +{fmt(entry.participation_exp)} EXP
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
