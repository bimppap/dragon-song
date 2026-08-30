"use client";

import { useEffect, useMemo, useState } from "react";
import { UserStar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/common/EmptyState";
import { useDialog } from "@/components/common/DialogProvider";
import { useToast } from "@/components/common/ToastProvider";
import { fetchStaffCandidates, updateStaffRole, type StaffCandidate } from "@/lib/api";

export default function PermissionTab() {
  const { confirm } = useDialog();
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<StaffCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const list = await fetchStaffCandidates();
        if (!cancelled) setCandidates(list);
      } catch (error) {
        if (!cancelled) toast(error instanceof Error ? error.message : "스텝 후보 조회 실패", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [toast]);

  const filtered = useMemo(() => {
    const normalized = query.trim();
    if (!normalized) return candidates;
    return candidates.filter((c) => c.character_name.includes(normalized));
  }, [candidates, query]);

  async function handleToggle(candidate: StaffCandidate) {
    const grant = candidate.role !== "STAFF";
    const ok = await confirm({
      title: grant ? "스텝 권한 부여" : "스텝 권한 해제",
      description: grant
        ? `${candidate.character_name}에게 스텝 권한을 부여할까요? 권한 탭 접근을 제외하고 관리자와 동일한 작업을 할 수 있게 됩니다.`
        : `${candidate.character_name}의 스텝 권한을 해제할까요?`,
      confirmText: grant ? "부여" : "해제",
      tone: grant ? "default" : "danger",
    });
    if (!ok) return;

    setUpdatingId(candidate.member_id);
    try {
      const updated = await updateStaffRole(candidate.member_id, grant ? "STAFF" : "RUNNER");
      setCandidates((prev) => prev.map((c) => (c.member_id === updated.member_id ? updated : c)));
    } catch (error) {
      toast(error instanceof Error ? error.message : "스텝 권한 변경 실패", "error");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserStar size={16} className="text-gold" />
          권한
        </CardTitle>
        <CardDescription>
          러너에게 스텝 권한을 부여하거나 해제합니다. 스텝은 권한 탭 접근을 제외하고 관리자와 동일한 작업을 할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="캐릭터 이름으로 검색"
          className="max-w-xs"
        />

        {loading ? (
          <EmptyState>목록을 불러오는 중입니다.</EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState>{query ? "검색 결과가 없습니다." : "캐릭터를 가진 러너가 없습니다."}</EmptyState>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {filtered.map((candidate) => {
              const isStaff = candidate.role === "STAFF";
              return (
                <div key={candidate.member_id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ivory">{candidate.character_name}</span>
                    {isStaff && (
                      <Badge variant="secondary" className="gap-1">
                        <UserStar size={11} />
                        스텝
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant={isStaff ? "outline" : "default"}
                    size="sm"
                    disabled={updatingId === candidate.member_id}
                    onClick={() => handleToggle(candidate)}
                  >
                    {updatingId === candidate.member_id ? "처리 중..." : isStaff ? "스텝 해제" : "스텝 임명"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
